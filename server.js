
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
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
  maxScore: { type: Number, default: 100 }, // Add max score
  submissions: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date, default: Date.now },
    fileUrl: String,
    fileName: String,
    grade: { type: Number, min: 0, max: 100 },
    score: { type: Number, min: 0 },
    feedback: String,
    gradedAt: Date,
    status: { type: String, enum: ['submitted', 'graded', 'late'], default: 'submitted' }
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
})

const User = mongoose.model('User', userSchema);
const Class = mongoose.model('Class', classSchema);
const Assignment = mongoose.model('Assignment', assignmentSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);

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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
  fs.mkdirSync('uploads/assignments', { recursive: true });
}

// CORS Configuration
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SESSION MIDDLEWARE
app.use(session({
  name: 'educonnect.sid',
  secret: process.env.SESSION_SECRET || 'default-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/educonnect',
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60,
    autoRemove: 'native'
  }),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use true in production
    sameSite: 'lax'
  }
}));

// Test middleware to ensure session exists
app.use((req, res, next) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session exists:', !!req.session);
  next();
});

// Static files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static('uploads'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/educonnect', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB Connected to educonnect database');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};



// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    session: req.session ? 'Session exists' : 'No session',
    sessionId: req.sessionID,
    userId: req.session?.userId,
    timestamp: new Date().toISOString()
  });
});

// User registration 
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role, studentId } = req.body;
    
    console.log('📝 Registration attempt:', { username, email, role });
    
    // Validation
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check existing user
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.username === username ? 'Username already exists' : 'Email already registered'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      studentId: studentId || null
    });
    
    await newUser.save();
    
    console.log('✅ User created successfully:', username);
    
    res.status(201).json({ 
      success: true,
      message: 'Account created successfully! You can now login.',
      user: { ...newUser.toObject(), password: undefined }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check role, if provided
    if (role && user.role !== role) {
      return res.status(401).json({ error: `Invalid role. Your account is registered as ${user.role}` });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive. Please contact administrator.' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Set session data
    req.session.userId = user._id.toString();
    req.session.userRole = user.role;
    req.session.username = user.username;
    
    console.log('✅ Login successful for:', user.username);
    
    // Create response
    res.json({
      success: true,
      message: 'Login successful',
      user: { ...user.toObject(), password: undefined }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('educonnect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check session
app.get('/api/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ 
      authenticated: true, 
      userId: req.session.userId, 
      role: req.session.userRole,
      username: req.session.username 
    });
  } 
  res.json({ authenticated: false });
});

// Helper function to calculate average grade for parent
const calculateAverageGradeForParent = (assignments, studentId) => {
  let totalGrade = 0;
  let gradedCount = 0;
  
  assignments.forEach(assignment => {
    const submission = assignment.submissions?.find(s => 
      s.student && s.student.studentId === studentId
    );
    
    if (submission && submission.grade !== null && submission.grade !== undefined) {
      totalGrade += submission.grade;
      gradedCount++;
    }
  });
  
  return gradedCount > 0 ? Math.round(totalGrade / gradedCount) + '%' : 'N/A';
};

// Get user dashboard data
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    console.log('Dashboard - Session userId:', req.session.userId);
    
    const user = await User.findById(req.session.userId).select('-password');
    
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'User not found' });
    }
    
    const data = { user, dashboardStats: [] };
    
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
          .populate('teacher', 'username')
          .populate('students', 'username');
        
        data.assignments = await Assignment.find({ teacher: user._id })
          .populate('class', 'name')
          .populate('teacher', 'username')
          .populate('submissions.student', 'username')
          .sort({ dueDate: 1 });
        
        // Teacher dashboard stats
        const teacherClasses = await Class.find({ teacher: user._id });
        const teacherAssignments = await Assignment.find({ teacher: user._id });
        const pendingAssignments = teacherAssignments.filter(a => 
          new Date(a.dueDate) > new Date()
        ).length;
        
        data.dashboardStats = [
          { label: 'My Classes', value: teacherClasses.length, description: 'Classes you teach' },
          { label: 'Total Students', value: teacherClasses.reduce((sum, cls) => sum + cls.students.length, 0), description: 'Students across all classes' },
          { label: 'Pending Assignments', value: pendingAssignments, description: 'Assignments to be graded' },
          { label: 'Total Assignments', value: teacherAssignments.length, description: 'All assignments created' }
        ];
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
          .populate('submissions.student', 'username')
          .sort({ dueDate: 1 });
        
        // Student dashboard stats
        const pending = data.assignments.filter(a => {
          const submitted = a.submissions.some(s => 
            s.student && s.student._id.toString() === user._id.toString()
          );
          return !submitted && new Date(a.dueDate) > new Date();
        }).length;
        
        const submitted = data.assignments.filter(a => 
          a.submissions.some(s => 
            s.student && s.student._id.toString() === user._id.toString()
          )
        ).length;
        
        data.dashboardStats = [
          { label: 'Enrolled Classes', value: studentClasses.length, description: 'Classes you\'re enrolled in' },
          { label: 'Pending Assignments', value: pending, description: 'Assignments to submit' },
          { label: 'Submitted Assignments', value: submitted, description: 'Assignments submitted' },
          { label: 'Total Assignments', value: data.assignments.length, description: 'All assignments' }
        ];
        break;
        
      case 'admin':
        data.classes = await Class.find()
          .populate('teacher', 'username')
          .populate('students', 'username');
        
        data.teachers = await User.find({ role: 'teacher' }).select('-password');
        data.students = await User.find({ role: 'student' }).select('-password');
        data.assignments = await Assignment.find()
          .populate('class', 'name')
          .populate('teacher', 'username')
          .sort({ dueDate: 1 });
        
        // Admin dashboard stats
        const totalUsers = await User.countDocuments();
        const activeTeachers = await User.countDocuments({ role: 'teacher', isActive: true });
        const activeStudents = await User.countDocuments({ role: 'student', isActive: true });
        const totalClasses = await Class.countDocuments();
        
        data.dashboardStats = [
          { label: 'Total Users', value: totalUsers, description: 'All system users' },
          { label: 'Active Teachers', value: activeTeachers, description: 'Teaching staff' },
          { label: 'Active Students', value: activeStudents, description: 'Enrolled students' },
          { label: 'Total Classes', value: totalClasses, description: 'Classes created' }
        ];
        break;
        
      case 'parent':
        // Parent-specific data
        if (user.studentId) {
          const child = await User.findOne({ studentId: user.studentId, role: 'student' });
          if (child) {
            // Get child's classes
            const childClasses = await Class.find({ students: child._id })
              .populate('teacher', 'username');
            
            data.classes = childClasses;
            
            // Get assignments for child's classes
            const classIds = childClasses.map(c => c._id);
            data.assignments = await Assignment.find({ class: { $in: classIds } })
              .populate('class', 'name')
              .populate('teacher', 'username')
              .populate('submissions.student', 'username studentId') // Important: populate studentId
              .sort({ dueDate: 1 });
          }
        }
        
        data.dashboardStats = [
          { 
            label: 'Child\'s Assignments', 
            value: data.assignments?.length || 0, 
            description: 'Total assignments' 
          },
          { 
            label: 'Pending', 
            value: data.assignments ? data.assignments.filter(a => {
              const submission = a.submissions?.find(s => 
                s.student && s.student.studentId === user.studentId
              );
              return !submission && new Date(a.dueDate) > new Date();
            }).length : 0, 
            description: 'Assignments to complete' 
          },
          { 
            label: 'Submitted', 
            value: data.assignments ? data.assignments.filter(a => 
              a.submissions?.some(s => 
                s.student && s.student.studentId === user.studentId
              )
            ).length : 0, 
            description: 'Assignments submitted' 
          },
          { 
            label: 'Average Grade', 
            value: data.assignments ? calculateAverageGradeForParent(data.assignments, user.studentId) : 'N/A', 
            description: 'Child\'s performance' 
          }
        ];
        break;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});


// ========== CLASS MANAGEMENT ROUTES ==========

// Get all classes
app.get('/api/classes', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    let classes;
    
    if (user.role === 'teacher') {
      classes = await Class.find({ teacher: user._id })
        .populate('teacher', 'username')
        .populate('students', 'username')
        .sort({ name: 1 });
    } else if (user.role === 'student') {
      classes = await Class.find({ students: user._id })
        .populate('teacher', 'username')
        .populate('students', 'username')
        .sort({ name: 1 });
    } else if (user.role === 'admin') {
      classes = await Class.find()
        .populate('teacher', 'username')
        .populate('students', 'username')
        .sort({ name: 1 });
    } else if (user.role === 'parent') {
      // Parent sees child's classes
      if (user.studentId) {
        const child = await User.findOne({ studentId: user.studentId, role: 'student' });
        if (child) {
          classes = await Class.find({ students: child._id })
            .populate('teacher', 'username')
            .populate('students', 'username')
            .sort({ name: 1 });
        } else {
          classes = [];
        }
      } else {
        classes = [];
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(classes);
  } catch (error) {
    console.error('Classes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new class (admin only)
app.post('/api/classes', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
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


// ========== STUDENT ENROLLMENT ROUTES ==========

// Enroll student in class (Admin or Teacher)
app.post('/api/classes/:classId/enroll', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { classId } = req.params;
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }
    
    const classObj = await Class.findById(classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check permissions: Admin or class teacher can enroll students
    if (user.role !== 'admin' && classObj.teacher.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You do not have permission to enroll students in this class' });
    }
    
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check if already enrolled
    if (classObj.students.includes(studentId)) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }
    
    // Enroll student
    classObj.students.push(studentId);
    await classObj.save();
    
    const populatedClass = await Class.findById(classId)
      .populate('teacher', 'username')
      .populate('students', 'username');
    
    res.json({
      success: true,
      message: 'Student enrolled successfully',
      class: populatedClass
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove student from class
app.delete('/api/classes/:classId/enroll/:studentId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { classId, studentId } = req.params;
    
    const classObj = await Class.findById(classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check permissions
    if (user.role !== 'admin' && classObj.teacher.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You do not have permission to manage this class' });
    }
    
    // Remove student
    classObj.students = classObj.students.filter(id => id.toString() !== studentId);
    await classObj.save();
    
    res.json({
      success: true,
      message: 'Student removed from class successfully'
    });
  } catch (error) {
    console.error('Remove enrollment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get enrolled students for a class
app.get('/api/classes/:classId/students', requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;
    
    const classObj = await Class.findById(classId)
      .populate('students', 'username email studentId');
    
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json({
      success: true,
      students: classObj.students
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Student self-enrollment (if allowed)
app.post('/api/classes/:classId/self-enroll', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { classId } = req.params;
    
    if (user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can self-enroll' });
    }
    
    const classObj = await Class.findById(classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check if already enrolled
    if (classObj.students.includes(user._id)) {
      return res.status(400).json({ error: 'You are already enrolled in this class' });
    }
    
    // Enroll student
    classObj.students.push(user._id);
    await classObj.save();
    
    res.json({
      success: true,
      message: 'Successfully enrolled in class',
      class: {
        _id: classObj._id,
        name: classObj.name,
        subject: classObj.subject
      }
    });
  } catch (error) {
    console.error('Self-enrollment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ASSIGNMENT MANAGEMENT ROUTES ==========

// Get all assignments
app.get('/api/assignments', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    let assignments;
    
    if (user.role === 'teacher') {
      assignments = await Assignment.find({ teacher: user._id })
        .populate('class', 'name')
        .populate('teacher', 'username')
        .populate('submissions.student', 'username')
        .sort({ dueDate: 1 });
    } else if (user.role === 'student') {
      const studentClasses = await Class.find({ students: user._id });
      const classIds = studentClasses.map(c => c._id);
      
      assignments = await Assignment.find({ class: { $in: classIds } })
        .populate('class', 'name')
        .populate('teacher', 'username')
        .populate('submissions.student', 'username')
        .sort({ dueDate: 1 });
    } else if (user.role === 'admin') {
      assignments = await Assignment.find()
        .populate('class', 'name')
        .populate('teacher', 'username')
        .populate('submissions.student', 'username')
        .sort({ dueDate: 1 });
    } else if (user.role === 'parent') {
      // Parent sees child's assignments
      if (user.studentId) {
        const child = await User.findOne({ studentId: user.studentId, role: 'student' });
        if (child) {
          const childClasses = await Class.find({ students: child._id });
          const classIds = childClasses.map(c => c._id);
          
          assignments = await Assignment.find({ class: { $in: classIds } })
            .populate('class', 'name')
            .populate('teacher', 'username')
            .populate('submissions.student', 'username')
            .sort({ dueDate: 1 });
        } else {
          assignments = [];
        }
      } else {
        assignments = [];
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(assignments);
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new assignment
app.post('/api/assignments', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { title, description, dueDate, classId } = req.body;
    
    console.log('Creating assignment:', { title, classId, dueDate, user: user.username });
    
    if (!title || !description || !dueDate || !classId) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const classObj = await Class.findById(classId);
    if (!classObj) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    // Check if user is the teacher of this class or admin
    if (user.role !== 'admin' && classObj.teacher.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You can only create assignments for your own classes' });
    }
    
    const newAssignment = new Assignment({
      title,
      description,
      dueDate: new Date(dueDate),
      class: classId,
      teacher: classObj.teacher,
      submissions: []
    });
    
    await newAssignment.save();
    
    const populatedAssignment = await Assignment.findById(newAssignment._id)
      .populate('class', 'name')
      .populate('teacher', 'username');
    
    console.log('✅ Assignment created successfully:', title);
    
    res.status(201).json({ 
      message: 'Assignment created successfully',
      assignment: populatedAssignment
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Submit assignment (with file upload)
app.post('/api/assignments/:assignmentId/submit', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const assignmentId = req.params.assignmentId;
    
    const assignment = await Assignment.findById(assignmentId)
      .populate('class', 'students');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is in the class
    const isStudentInClass = assignment.class.students.some(
      studentId => studentId.toString() === user._id.toString()
    );
    
    if (!isStudentInClass && user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not enrolled in this class' });
    }
    
    // Check if already submitted
    const existingSubmissionIndex = assignment.submissions.findIndex(
      sub => sub.student && sub.student.toString() === user._id.toString()
    );
    
    const submissionData = {
      student: user._id,
      submittedAt: new Date(),
      fileUrl: req.file ? `/uploads/assignments/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null
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

// Delete assignment
app.delete('/api/assignments/:assignmentId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const assignment = await Assignment.findById(req.params.assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is the teacher who created this assignment or admin
    if (assignment.teacher.toString() !== user._id.toString() && user.role !== 'admin') {
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

// ========== GRADE MANAGEMENT ROUTES ==========

// Grade a submission
app.post('/api/assignments/:assignmentId/submissions/:studentId/grade', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { assignmentId, studentId } = req.params;
    const { grade, score, feedback, maxScore } = req.body;
    
    const assignment = await Assignment.findById(assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is the teacher of this assignment or admin
    if (user.role !== 'admin' && assignment.teacher.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'You can only grade assignments for your own classes' });
    }
    
    // Find the submission
    const submissionIndex = assignment.submissions.findIndex(
      sub => sub.student && sub.student.toString() === studentId
    );
    
    if (submissionIndex === -1) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Update the submission with grade
    assignment.submissions[submissionIndex].grade = grade || null;
    assignment.submissions[submissionIndex].score = score || null;
    assignment.submissions[submissionIndex].feedback = feedback || '';
    assignment.submissions[submissionIndex].gradedAt = new Date();
    assignment.submissions[submissionIndex].status = 'graded';
    
    // Update max score if provided
    if (maxScore && assignment.maxScore !== maxScore) {
      assignment.maxScore = maxScore;
    }
    
    await assignment.save();
    
    // Populate the updated submission
    const populatedAssignment = await Assignment.findById(assignmentId)
      .populate('submissions.student', 'username email studentId');
    
    res.json({
      success: true,
      message: 'Grade submitted successfully',
      submission: populatedAssignment.submissions[submissionIndex]
    });
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get assignment with all submissions (for teacher)
app.get('/api/assignments/:assignmentId/submissions', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { assignmentId } = req.params;
    
    const assignment = await Assignment.findById(assignmentId)
      .populate('class', 'name subject')
      .populate('teacher', 'username')
      .populate('submissions.student', 'username email studentId');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if user is the teacher or admin
    if (user.role !== 'admin' && assignment.teacher._id.toString() !== user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get class students to show who hasn't submitted
    const classObj = await Class.findById(assignment.class._id)
      .populate('students', 'username email studentId');
    
    // Mark submissions as late if overdue
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    
    assignment.submissions.forEach(sub => {
      if (sub.submittedAt > dueDate && sub.status !== 'graded') {
        sub.status = 'late';
      }
    });
    
    res.json({
      assignment,
      classStudents: classObj.students || [],
      unsubmittedStudents: classObj.students?.filter(student => 
        !assignment.submissions.some(sub => 
          sub.student && sub.student._id.toString() === student._id.toString()
        )
      ) || []
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get grades for student
app.get('/api/grades', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    let grades = [];
    
    if (user.role === 'student') {
      // Get assignments for student's classes
      const studentClasses = await Class.find({ students: user._id });
      const classIds = studentClasses.map(c => c._id);
      
      const assignments = await Assignment.find({ class: { $in: classIds } })
        .populate('class', 'name subject')
        .populate('teacher', 'username')
        .populate('submissions.student', 'username');
      
      // Extract student's submissions with grades
      assignments.forEach(assignment => {
        const submission = assignment.submissions.find(
          sub => sub.student && sub.student._id.toString() === user._id.toString()
        );
        
        if (submission) {
          grades.push({
            assignmentId: assignment._id,
            assignmentTitle: assignment.title,
            className: assignment.class.name,
            teacherName: assignment.teacher.username,
            dueDate: assignment.dueDate,
            submittedAt: submission.submittedAt,
            grade: submission.grade,
            score: submission.score,
            maxScore: assignment.maxScore,
            feedback: submission.feedback,
            status: submission.status,
            gradedAt: submission.gradedAt
          });
        }
      });
      
    } else if (user.role === 'parent') {
      // Get grades for parent's child
      if (user.studentId) {
        const child = await User.findOne({ studentId: user.studentId, role: 'student' });
        if (child) {
          const childClasses = await Class.find({ students: child._id });
          const classIds = childClasses.map(c => c._id);
          
          const assignments = await Assignment.find({ class: { $in: classIds } })
            .populate('class', 'name subject')
            .populate('teacher', 'username')
            .populate('submissions.student', 'username studentId');
          
          assignments.forEach(assignment => {
            const submission = assignment.submissions.find(
              sub => sub.student && sub.student._id.toString() === child._id.toString()
            );
            
            if (submission) {
              grades.push({
                assignmentId: assignment._id,
                assignmentTitle: assignment.title,
                className: assignment.class.name,
                teacherName: assignment.teacher.username,
                dueDate: assignment.dueDate,
                submittedAt: submission.submittedAt,
                grade: submission.grade,
                score: submission.score,
                maxScore: assignment.maxScore,
                feedback: submission.feedback,
                status: submission.status,
                gradedAt: submission.gradedAt,
                studentName: submission.student.username
              });
            }
          });
        }
      }
    } else if (user.role === 'teacher') {
      // Get all assignments by this teacher with submissions
      const assignments = await Assignment.find({ teacher: user._id })
        .populate('class', 'name')
        .populate('submissions.student', 'username studentId');
      
      // Count graded vs ungraded
      assignments.forEach(assignment => {
        assignment.submissions.forEach(submission => {
          if (submission.student) {
            grades.push({
              assignmentId: assignment._id,
              assignmentTitle: assignment.title,
              className: assignment.class.name,
              studentName: submission.student.username,
              studentId: submission.student.studentId,
              submittedAt: submission.submittedAt,
              grade: submission.grade,
              score: submission.score,
              maxScore: assignment.maxScore,
              feedback: submission.feedback,
              status: submission.status,
              gradedAt: submission.gradedAt
            });
          }
        });
      });
    }
    
    // Sort by due date (most recent first)
    grades.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    
    res.json({ grades });
  } catch (error) {
    console.error('Get grades error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== ANNOUNCEMENT ROUTES ==========

// Create announcement
app.post('/api/announcements', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { title, content, targetRoles } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    // Check if user has permission to create announcements
    if (user.role !== 'admin' && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied. Only admins and teachers can create announcements.' });
    }
    
    const newAnnouncement = new Announcement({
      title,
      content,
      author: user._id,
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
app.get('/api/announcements', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const announcements = await Announcement.find({ 
      isActive: true,
      $or: [
        { targetRoles: { $in: [user.role] } },
        { targetRoles: { $size: 0 } },
        { author: user._id }
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

// ========== SCHEDULE ROUTES ==========

// Create schedule
app.post('/api/schedules', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { title, description, date, startTime, endTime } = req.body;
    
    if (!title || !date || !startTime) {
      return res.status(400).json({ error: 'Title, date and start time are required' });
    }
    
    const newSchedule = new Schedule({
      title,
      description,
      date: new Date(date),
      startTime,
      endTime,
      createdBy: user._id,
      participants: []
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

// Get schedules
app.get('/api/schedules', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    let schedules;
    
    if (user.role === 'admin' || user.role === 'teacher') {
      schedules = await Schedule.find()
        .populate('createdBy', 'username')
        .populate('participants', 'username')
        .sort({ date: 1, startTime: 1 });
    } else {
      schedules = await Schedule.find({
        $or: [
          { participants: user._id },
          { createdBy: user._id }
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

// ========== USER MANAGEMENT ROUTES ==========

// Create user (admin only)
app.post('/api/users', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user.role !== 'admin') {
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
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      studentId: role === 'student' ? studentId : null,
      isActive: true
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

// Get admin data
app.get('/api/admin-data', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const teachers = await User.find({ role: 'teacher' }).select('-password');
    const students = await User.find({ role: 'student' }).select('-password');
    const classes = await Class.find()
      .populate('teacher', 'username')
      .populate('students', 'username');
    
    res.json({ teachers, students, classes });
  } catch (error) {
    console.error('Admin data error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user
app.delete('/api/users/:userId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }
    
    // Prevent admin from deleting themselves
    if (req.params.userId === user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const userToDelete = await User.findById(req.params.userId);
    
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await userToDelete.deleteOne();
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ========== FORGOT PASSWORD ROUTE ==========

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // In a real app, you would:
    // 1. Check if email exists
    // 2. Generate reset token
    // 3. Send email with reset link
    
    // For now, just return success
    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});




// Serve static files
app.use(express.static(__dirname));

// Handle all other routes
app.get('*', (req, res) => {
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  
  // Connect to MongoDB
  await connectDB();
  
  // Initialize sample data
  await initializeSampleData();
});

// Sample data initialization
async function initializeSampleData() {
  try {
    const userCount = await User.countDocuments();
    // Existing sample data creation logic...

console.log(`👥 Current user count: ${userCount}`);
    
    if (userCount === 0) {
      console.log('🌱 Creating sample data...');
      
      // Create sample users with hashed passwords
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
          password:'Password@123', 
          role: 'student',
          studentId: 'STU2024001'
        },
        { 
          username: 'parent1', 
          email: 'parent1@educonnect.edu', 
          password:'Password@123', 
          role: 'parent',
          studentId: 'STU2024001'
        }
      ];
      
      for (const userData of sampleUsersData) {
        try {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(userData.password, salt);
          
          const user = new User({
            username: userData.username,
            email: userData.email,
            password: hashedPassword,
            role: userData.role,
            studentId: userData.studentId || null,
            isActive: true
          });
          
          await user.save();
          console.log(`✅ Created user: ${userData.username} (${userData.role})`);
        } catch (userError) {
          console.error(`❌ Error creating user ${userData.username}:`, userError.message);
        }
      }
      
      // Create sample class and related data
      try {
        const teacher = await User.findOne({ role: 'teacher' });
        const student = await User.findOne({ role: 'student' });
        
        if (teacher && student) {
          // Create class
          const sampleClass = new Class({
            name: 'Mathematics 101',
            subject: 'Mathematics',
            teacher: teacher._id,
            students: [student._id]
          });
          
          await sampleClass.save();
          console.log('✅ Created sample class: Mathematics 101');
          
          // Create assignment
          const sampleAssignment = new Assignment({
            title: 'Algebra Basics Assignment',
            description: 'Complete exercises 1-10 on algebraic expressions',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            class: sampleClass._id,
            teacher: teacher._id,
            submissions: []
          });
          
          await sampleAssignment.save();
          console.log('✅ Created sample assignment');
          
          // Create announcement
          const sampleAnnouncement = new Announcement({
            title: 'Welcome to EduConnect!',
            content: 'Welcome to our school management system. We are excited to have you here!',
            author: teacher._id,
            targetRoles: ['teacher', 'student', 'parent', 'admin'],
            isActive: true
          });
          
          await sampleAnnouncement.save();
          console.log('✅ Created sample announcement');
          
          // Create schedule
          const sampleSchedule = new Schedule({
            title: 'Parent-Teacher Meeting',
            description: 'Monthly parent-teacher meeting to discuss student progress',
            date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            startTime: '14:00',
            endTime: '16:00',
            createdBy: teacher._id,
            participants: [teacher._id, student._id]
          });
          
          await sampleSchedule.save();
          console.log('✅ Created sample schedule');
        }
      } catch (error) {
        console.error('❌ Error creating sample data:', error.message);
      }
      
      console.log('✅ Sample data initialization completed!');
    } else {
      console.log('📋 Database already has data');
    }

  } catch (error) {
    console.error('❌ Error in initializeSampleData:', error.message);
  }
}