const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'parent'], required: true },
  studentId: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submissions: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    fileUrl: String,
    fileName: String,
    grade: Number,
    feedback: String,
    gradedAt: Date
  }],
  createdAt: { type: Date, default: Date.now }
});

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetRoles: [{ type: String, enum: ['admin', 'teacher', 'student', 'parent'] }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const scheduleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  date: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Create models
const User = mongoose.model('User', userSchema);
const Class = mongoose.model('Class', classSchema);
const Assignment = mongoose.model('Assignment', assignmentSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);

// Connect to MongoDB - FIXED DATABASE NAME
const connectDB = async () => {
  try {
    // Using the exact case that already exists (Educonnect)
    await mongoose.connect('mongodb://localhost:27017/Educonnect', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected to Educonnect database');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/assignments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const extname = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.some(type => extname === type)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static('uploads'));

// Serve static files from the current directory
app.use(express.static(__dirname));

// Handle all other routes by sending the index.html file
app.get('*', (req, res) => {
  // Exclude API routes
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // For all other routes, serve the index.html
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Move this line to the end of your middleware setup
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

// Utility functions
const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePassword = (password) => {
  // Minimum 8 characters, at least one letter, one number and one special character
  const re = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
  return re.test(password);
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
    
    if (!token || token === 'undefined' || token === 'null') {
      return res.status(401).json({ error: 'Access denied. Please log in.' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(token)) {
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
    
    const user = await User.findById(token).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid authentication' });
  }
};

// API Routes

// User registration 
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role, studentId } = req.body;
    
    console.log('📝 Registration attempt:', { username, email, role });
    
    // Validation
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }
    
    if (!validatePassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with letters, numbers, and special characters (@$!%*#?&)' 
      });
    }
    
    // Check existing user
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingUser) {
      console.log('❌ User already exists:', existingUser.username);
      return res.status(400).json({ 
        error: existingUser.username === username 
          ? 'Username already exists' 
          : 'Email already registered'
      });
    }
    
    // Create user - password will be hashed by the pre-save hook
    const newUser = new User({
      username,
      email,
      password, // Password will be hashed by pre-save hook
      role,
      studentId: studentId || null,
      isActive: true
    });
    
    await newUser.save();
    
    console.log('✅ User created successfully:', username);
    
    // Prepare user response
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({ 
      success: true,
      message: 'Account created successfully! You can now login.',
      user: userResponse,
      token: newUser._id.toString()
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      error: 'Server error during registration',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// User login 
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('🔑 Login attempt:', { username, role }); // Log login attempts
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by username or email
    const user = await User.findOne({ 
      $or: [{ username }, { email: username }] 
    });
    
    if (!user) {
      console.log('❌ User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    console.log('👤 User found:', user.username, 'Role:', user.role);
    
    // Check password using the comparePassword method
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    console.log('🔐 Password valid:', isPasswordValid);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Optional role check
    if (role && user.role !== role) {
      console.log('⚠️ Role mismatch. User role:', user.role, 'Requested role:', role);
      return res.status(401).json({ 
        error: `Invalid role. Your account is registered as ${user.role}` 
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive. Please contact administrator.' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    console.log('✅ Login successful for:', user.username);
    
    // Create response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse,
      token: user._id.toString()
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get user dashboard data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const data = { user, dashboardStats: {} };
    
    // Get announcements visible to user
    data.announcements = await Announcement.find({ 
      isActive: true,
      $or: [
        { targetRoles: { $in: [user.role] } },
        { targetRoles: { $size: 0 } }
      ]
    })
    .populate('author', 'username')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Get schedules
    data.schedules = await Schedule.find({
      $or: [
        { participants: user._id },
        { createdBy: user._id }
      ]
    })
    .populate('createdBy', 'username')
    .populate('participants', 'username')
    .sort({ date: 1, startTime: 1 });
    
    // Role-specific data
    switch(user.role) {
      case 'teacher':
        data.classes = await Class.find({ teacher: user._id })
          .populate('students', 'username')
          .populate('teacher', 'username');
        
        data.assignments = await Assignment.find({ teacher: user._id })
          .populate('class', 'name')
          .sort({ dueDate: 1 });
        
        // Get submissions for teacher's assignments
        const teacherAssignments = await Assignment.find({ teacher: user._id })
          .populate('class', 'name');
        
        // Teacher dashboard stats
        const teacherClasses = await Class.find({ teacher: user._id });
        const totalStudents = teacherClasses.reduce((sum, cls) => sum + cls.students.length, 0);
        
        data.dashboardStats = {
          totalClasses: teacherClasses.length,
          totalStudents: totalStudents,
          pendingAssignments: await Assignment.countDocuments({ 
            teacher: user._id,
            dueDate: { $gte: new Date() }
          }),
          gradedAssignments: await Assignment.find({
            teacher: user._id,
            submissions: { $exists: true, $not: { $size: 0 } }
          })
          .then(assignments => assignments.filter(a => 
            a.submissions.some(s => s.grade !== undefined)
          ).length)
        };
        break;
        
      case 'student':
        data.classes = await Class.find({ students: user._id })
          .populate('teacher', 'username');
        
        // Get assignments for student's classes
        const studentClasses = await Class.find({ students: user._id });
        const classIds = studentClasses.map(c => c._id);
        
        data.assignments = await Assignment.find({ class: { $in: classIds } })
          .populate('class', 'name')
          .populate('teacher', 'username')
          .sort({ dueDate: 1 });
        
        // Get submissions for current student
        const assignmentsWithSubmissions = await Assignment.find({
          class: { $in: classIds }
        });
        
        data.grades = [];
        let submittedCount = 0;
        let totalScore = 0;
        let gradedCount = 0;
        
        assignmentsWithSubmissions.forEach(assignment => {
          const submission = assignment.submissions.find(
            sub => sub.student && sub.student.toString() === user._id.toString()
          );
          
          if (submission) {
            submittedCount++;
            if (submission.grade !== undefined) {
              totalScore += submission.grade;
              gradedCount++;
            }
            
            data.grades.push({
              assignment: assignment.title,
              score: submission.grade || null,
              date: submission.submittedAt || null,
              class: assignment.class?.name || 'N/A',
              submitted: true
            });
          }
        });
        
        // Student dashboard stats
        data.dashboardStats = {
          enrolledClasses: studentClasses.length,
          pendingAssignments: data.assignments.filter(a => 
            !a.submissions.some(s => 
              s.student && s.student.toString() === user._id.toString()
            )
          ).length,
          submittedAssignments: submittedCount,
          averageGrade: gradedCount > 0 ? (totalScore / gradedCount).toFixed(1) : 0
        };
        break;
        
      case 'admin':
        data.classes = await Class.find()
          .populate('teacher', 'username')
          .populate('students', 'username');
        
        data.allUsers = await User.find().select('-password');
        data.teachers = await User.find({ role: 'teacher' }).select('-password');
        data.students = await User.find({ role: 'student' }).select('-password');
        
        // Admin dashboard stats
        data.dashboardStats = {
          totalUsers: await User.countDocuments(),
          activeTeachers: await User.countDocuments({ role: 'teacher', isActive: true }),
          activeStudents: await User.countDocuments({ role: 'student', isActive: true }),
          totalClasses: await Class.countDocuments(),
          recentRegistrations: await User.countDocuments({ 
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          })
        };
        break;
        
      case 'parent':
        // Parent sees their child's data
        const child = await User.findOne({ studentId: user.studentId, role: 'student' });
        if (child) {
          const childClasses = await Class.find({ students: child._id });
          const childClassIds = childClasses.map(c => c._id);
          
          data.childInfo = child;
          data.childClasses = childClasses;
          data.childAssignments = await Assignment.find({ class: { $in: childClassIds } })
            .populate('class', 'name')
            .populate('teacher', 'username')
            .sort({ dueDate: 1 });
          
          const childGrades = await Assignment.find({
            class: { $in: childClassIds }
          });
          
          data.grades = [];
          childGrades.forEach(assignment => {
            const submission = assignment.submissions.find(
              sub => sub.student && sub.student.toString() === child._id.toString()
            );
            
            if (submission && submission.grade !== undefined) {
              data.grades.push({
                assignment: assignment.title,
                score: submission.grade,
                date: submission.submittedAt || null,
                class: assignment.class?.name || 'N/A'
              });
            }
          });
          
          // Parent dashboard stats
          const totalChildScore = data.grades.reduce((sum, grade) => sum + grade.score, 0);
          
          data.dashboardStats = {
            childClasses: childClasses.length,
            upcomingAssignments: await Assignment.countDocuments({
              class: { $in: childClassIds },
              dueDate: { $gte: new Date() }
            }),
            completedAssignments: await Assignment.countDocuments({
              class: { $in: childClassIds },
              'submissions.student': child._id
            }),
            childAverageGrade: data.grades.length > 0 
              ? (totalChildScore / data.grades.length).toFixed(1)
              : 0
          };
        }
        break;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (admin only)
app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { username, email, password, role, studentId } = req.body;
    
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check existing user
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      studentId: role === 'student' ? studentId : null,
      isActive: true,
      createdBy: req.user._id
    });
    
    await newUser.save();
    
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all classes
app.get('/api/classes', authenticateToken, async (req, res) => {
  try {
    const classes = await Class.find()
      .populate('teacher', 'username')
      .populate('students', 'username')
      .sort({ name: 1 });
    
    res.json(classes);
  } catch (error) {
    console.error('Classes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new class
app.post('/api/classes', authenticateToken, async (req, res) => {
  try {
    const { name, subject, teacherId } = req.body;
    
    if (!name || !subject || !teacherId) {
      return res.status(400).json({ error: 'Name, subject and teacher are required' });
    }
    
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(400).json({ error: 'Invalid teacher ID' });
    }
    
    const newClass = new Class({
      name,
      subject,
      teacher: teacherId,
      students: []
    });
    
    await newClass.save();
    
    const populatedClass = await Class.findById(newClass._id)
      .populate('teacher', 'username');
    
    res.status(201).json({ 
      message: 'Class created successfully',
      class: populatedClass
    });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Add students to class
app.post('/api/classes/:classId/students', authenticateToken, async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ error: 'Student IDs array is required' });
    }
    
    const classObj = await Class.findById(req.params.classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Add students if not already in class
    studentIds.forEach(studentId => {
      if (!classObj.students.includes(studentId)) {
        classObj.students.push(studentId);
      }
    });
    
    await classObj.save();
    
    const populatedClass = await Class.findById(classObj._id)
      .populate('teacher', 'username')
      .populate('students', 'username');
    
    res.json({ 
      message: 'Students added successfully',
      class: populatedClass
    });
  } catch (error) {
    console.error('Add students error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create new assignment
app.post('/api/assignments', authenticateToken, async (req, res) => {
  try {
    const { title, description, dueDate, classId } = req.body;
    
    if (!title || !description || !dueDate || !classId) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const classObj = await Class.findById(classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    const newAssignment = new Assignment({
      title,
      description,
      dueDate: new Date(dueDate),
      class: classId,
      teacher: req.user._id,
      submissions: []
    });
    
    await newAssignment.save();
    
    const populatedAssignment = await Assignment.findById(newAssignment._id)
      .populate('class', 'name')
      .populate('teacher', 'username');
    
    res.status(201).json({ 
      message: 'Assignment created successfully',
      assignment: populatedAssignment
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get assignments for class
app.get('/api/classes/:classId/assignments', authenticateToken, async (req, res) => {
  try {
    const assignments = await Assignment.find({ class: req.params.classId })
      .populate('class', 'name')
      .populate('teacher', 'username')
      .sort({ dueDate: 1 });
    
    res.json(assignments);
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit assignment (with file upload)
app.post('/api/assignments/:assignmentId/submit', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    
    const assignment = await Assignment.findById(assignmentId)
      .populate('class', 'students');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if student is in the class
    const isStudentInClass = assignment.class.students.some(
      studentId => studentId.toString() === req.user._id.toString()
    );
    
    if (!isStudentInClass && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not enrolled in this class' });
    }
    
    // Check if already submitted
    const existingSubmissionIndex = assignment.submissions.findIndex(
      sub => sub.student && sub.student.toString() === req.user._id.toString()
    );
    
    const submissionData = {
      student: req.user._id,
      submittedAt: new Date(),
      fileUrl: req.file ? `/uploads/assignments/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      grade: undefined
    };
    
    if (existingSubmissionIndex >= 0) {
      // Update existing submission
      assignment.submissions[existingSubmissionIndex] = submissionData;
    } else {
      // Add new submission
      assignment.submissions.push(submissionData);
    }
    
    await assignment.save();
    
    res.json({ 
      success: true,
      message: 'Assignment submitted successfully',
      submission: submissionData
    });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get assignment submissions
app.get('/api/assignments/:assignmentId/submissions', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('submissions.student', 'username')
      .populate('class', 'name');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is teacher of this assignment
    if (assignment.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(assignment.submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Delete assignment
app.delete('/api/assignments/:assignmentId', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is the teacher who created this assignment or admin
    if (assignment.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own assignments' });
    }
    
    await assignment.deleteOne();
    
    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user
app.delete('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }
    
    // Prevent admin from deleting themselves
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await user.deleteOne();
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Submit grade
app.post('/api/grades', authenticateToken, async (req, res) => {
  try {
    const { studentId, assignmentId, score, feedback } = req.body;
    
    if (!studentId || !assignmentId || score === undefined) {
      return res.status(400).json({ error: 'Student ID, assignment ID and score are required' });
    }
    
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is the teacher of this assignment
    if (assignment.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only grade your own assignments' });
    }
    
    const submissionIndex = assignment.submissions.findIndex(
      sub => sub.student && sub.student.toString() === studentId
    );
    
    if (submissionIndex === -1) {
      return res.status(404).json({ error: 'No submission found for this student' });
    }
    
    // Update grade
    assignment.submissions[submissionIndex].grade = parseFloat(score);
    assignment.submissions[submissionIndex].feedback = feedback || '';
    assignment.submissions[submissionIndex].gradedAt = new Date();
    
    await assignment.save();
    
    res.json({ 
      success: true,
      message: 'Grade submitted successfully'
    });
  } catch (error) {
    console.error('Submit grade error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Create announcement
app.post('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const { title, content, targetRoles } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const newAnnouncement = new Announcement({
      title,
      content,
      author: req.user._id,
      targetRoles: targetRoles || [],
      isActive: true
    });
    
    await newAnnouncement.save();
    
    const populatedAnnouncement = await Announcement.findById(newAnnouncement._id)
      .populate('author', 'username');
    
    res.status(201).json({ 
      success: true,
      message: 'Announcement created successfully',
      announcement: populatedAnnouncement
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get announcements
app.get('/api/announcements', authenticateToken, async (req, res) => {
  try {
    const announcements = await Announcement.find({ 
      isActive: true,
      $or: [
        { targetRoles: { $in: [req.user.role] } },
        { targetRoles: { $size: 0 } },
        { author: req.user._id }
      ]
    })
    .populate('author', 'username')
    .sort({ createdAt: -1 });
    
    res.json(announcements);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Schedule routes
app.post('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const { title, description, date, startTime, endTime, participants } = req.body;
    
    if (!title || !date || !startTime) {
      return res.status(400).json({ error: 'Title, date and start time are required' });
    }
    
    const newSchedule = new Schedule({
      title,
      description,
      date: new Date(date),
      startTime,
      endTime,
      createdBy: req.user._id,
      participants: participants || []
    });
    
    await newSchedule.save();
    
    const populatedSchedule = await Schedule.findById(newSchedule._id)
      .populate('createdBy', 'username')
      .populate('participants', 'username');
    
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      schedule: populatedSchedule
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/schedules', authenticateToken, async (req, res) => {
  try {
    let schedules;
    
    if (req.user.role === 'admin' || req.user.role === 'teacher') {
      schedules = await Schedule.find()
        .populate('createdBy', 'username')
        .populate('participants', 'username')
        .sort({ date: 1, startTime: 1 });
    } else {
      schedules = await Schedule.find({
        $or: [
          { participants: req.user._id },
          { createdBy: req.user._id }
        ]
      })
      .populate('createdBy', 'username')
      .populate('participants', 'username')
      .sort({ date: 1, startTime: 1 });
    }
    
    res.json(schedules);
  } catch (error) {
    console.error('Get schedules error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize sample data - FIXED TO HANDLE CASE SENSITIVITY
const initializeSampleData = async () => {
  try {
    console.log('🔍 Checking database connection and existing data...');
    
    // First, let's check if we can access the database properly
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Connected to database: ${dbName}`);
    
    // Check user count - handle potential errors
    let userCount;
    try {
      userCount = await User.countDocuments();
      console.log(`👥 Current user count in ${dbName}: ${userCount}`);
    } catch (countError) {
      console.log('⚠️  Could not count users, collection might not exist yet');
      userCount = 0;
    }
    
    if (userCount === 0) {
      console.log('🌱 Creating sample data...');
      
      // Create sample users
      const sampleUsersData = [
        { 
          username: 'admin', 
          email: 'admin@educonnect.edu', 
          password: 'Password@123', 
          role: 'admin'
        },
        { 
          username: 'teacher1', 
          email: 'teacher1@educonnect.edu', 
          password: 'Password@123', 
          role: 'teacher'
        },
        { 
          username: 'student1', 
          email: 'student1@educonnect.edu', 
          password: 'Password@123', 
          role: 'student',
          studentId: 'STU2024001'
        },
        { 
          username: 'parent1', 
          email: 'parent1@educonnect.edu', 
          password: 'Password@123', 
          role: 'parent',
          studentId: 'STU2024001'
        }
      ];
      
      for (const userData of sampleUsersData) {
        try {
          // Check if user already exists
          const existingUser = await User.findOne({ 
            $or: [{ username: userData.username }, { email: userData.email }] 
          });
          
          if (!existingUser) {
            const user = new User({
              username: userData.username,
              email: userData.email,
              password: userData.password,
              role: userData.role,
              studentId: userData.studentId || null,
              isActive: true
            });
            
            await user.save();
            console.log(`✅ Created user: ${userData.username} (${userData.role})`);
          } else {
            console.log(`⚠️  User already exists: ${userData.username}`);
          }
        } catch (userError) {
          console.error(`❌ Error creating user ${userData.username}:`, userError.message);
        }
      }
      
      // Try to create sample class
      try {
        const teacher = await User.findOne({ role: 'teacher' });
        const student = await User.findOne({ role: 'student' });
        
        if (teacher && student) {
          const existingClass = await Class.findOne({ name: 'Mathematics 101' });
          if (!existingClass) {
            const sampleClass = new Class({
              name: 'Mathematics 101',
              subject: 'Mathematics',
              teacher: teacher._id,
              students: [student._id]
            });
            
            await sampleClass.save();
            console.log('✅ Created sample class: Mathematics 101');
          } else {
            console.log('⚠️  Sample class already exists');
          }
        }
      } catch (classError) {
        console.error('❌ Error creating class:', classError.message);
      }
      
      console.log('✅ Sample data initialization completed!');
    } else {
      console.log('📋 Existing users in database:');
      try {
        const allUsers = await User.find().select('username email role studentId');
        allUsers.forEach(user => {
          console.log(`   👤 ${user.username} (${user.email}) - ${user.role} ${user.studentId ? `- ID: ${user.studentId}` : ''}`);
        });
        console.log('🔑 Default passwords: Password@123');
      } catch (fetchError) {
        console.log('⚠️  Could not fetch existing users');
      }
    }
  } catch (error) {
    console.error('❌ Error in initializeSampleData:', error.message);
    // Don't crash the server, just log the error and continue
  }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  
  // Create uploads directory
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
    fs.mkdirSync('uploads/assignments', { recursive: true });
  }
  
  await connectDB();
  await initializeSampleData();
});