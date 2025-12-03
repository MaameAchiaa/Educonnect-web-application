const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// Import MongoDB connection and models
const connectDB = require('./db/connect');
const User = require('./db/models/User');
const Class = require('./db/models/Class');
const Assignment = require('./db/models/assignment');
const Announcement = require('./db/models/announcement');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));


app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Authorization header:', req.headers['authorization']);
  next();
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './educonnect-realtime/index.html'));
});

// API Routes


// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role, studentId } = req.body;
    
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Username or email already exists' 
      });
    }
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password, // Will be hashed by pre-save middleware
      role,
      studentId: studentId || null
    });
    
    await newUser.save();
    
    // Remove password from response
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({ 
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Find user
    const user = await User.findOne({ username, role });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      message: 'Login successful',
      user: userResponse,
      token: user._id.toString() // Simple token for now
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const token = req.headers['authorization'];
    
    // Debug: Log the incoming token
    console.log('Dashboard request - Token:', token);
    
    if (!token || token === 'undefined') {
      console.log('No token or token is undefined string');
      return res.status(401).json({ error: 'Access denied. Please log in.' });
    }
    
    // Validate that token is a proper ObjectId
    if (!mongoose.Types.ObjectId.isValid(token)) {
      console.log('Invalid token format (not a valid ObjectId):', token);
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
    
    // Find user by token (simple implementation)
    const user = await User.findById(token).select('-password');
    
    if (!user) {
      console.log('User not found for token:', token);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`Dashboard loaded for user: ${user.username} (${user.role})`);
    
    const data = { user };
    
    // Get announcements (for all roles)
    data.announcements = await Announcement.find({ isActive: true })
      .populate('author', 'username')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get classes based on role
    if (user.role === 'teacher') {
      data.classes = await Class.find({ teacher: user._id })
        .populate('students', 'username')
        .populate('teacher', 'username');
    } else if (user.role === 'student') {
      data.classes = await Class.find({ students: user._id })
        .populate('teacher', 'username');
    }
    
    // Get assignments
    if (user.role === 'teacher') {
      data.assignments = await Assignment.find({ teacher: user._id })
        .populate('class', 'name')
        .sort({ dueDate: 1 });
    } else if (user.role === 'student') {
      // Get assignments for student's classes
      const studentClasses = await Class.find({ students: user._id });
      const classIds = studentClasses.map(c => c._id);
      
      data.assignments = await Assignment.find({ class: { $in: classIds } })
        .populate('class', 'name')
        .populate('teacher', 'username')
        .sort({ dueDate: 1 });
    }
    
    // Get grades
    if (user.role === 'student') {
      const assignments = await Assignment.find({
        'submissions.student': user._id
      });
      
      data.grades = assignments.map(assignment => {
        const submission = assignment.submissions.find(
          sub => sub.student.toString() === user._id.toString()
        );
        return {
          assignment: assignment.title,
          score: submission?.grade || null,
          date: submission?.submittedAt || null
        };
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Get all classes
app.get('/api/classes', async (req, res) => {
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
app.post('/api/classes', async (req, res) => {
  try {
    const { name, subject, teacherId } = req.body;
    
    if (!name || !subject || !teacherId) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if teacher exists
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(400).json({ error: 'Invalid teacher' });
    }
    
    const newClass = new Class({
      name,
      subject,
      teacher: teacherId
    });
    
    await newClass.save();
    
    res.status(201).json({ 
      message: 'Class created successfully',
      class: newClass
    });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new assignment
app.post('/api/assignments', async (req, res) => {
  try {
    const { title, description, dueDate, classId, teacherId } = req.body;
    
    if (!title || !description || !dueDate || !classId || !teacherId) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const newAssignment = new Assignment({
      title,
      description,
      dueDate: new Date(dueDate),
      class: classId,
      teacher: teacherId
    });
    
    await newAssignment.save();
    
    res.status(201).json({ 
      message: 'Assignment created successfully',
      assignment: newAssignment
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit grade
app.post('/api/grades', async (req, res) => {
  try {
    const { studentId, assignmentId, score } = req.body;
    
    if (!studentId || !assignmentId || score === undefined) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Update or add submission
    const submissionIndex = assignment.submissions.findIndex(
      sub => sub.student.toString() === studentId
    );
    
    if (submissionIndex >= 0) {
      // Update existing submission
      assignment.submissions[submissionIndex].grade = score;
      assignment.submissions[submissionIndex].submittedAt = new Date();
    } else {
      // Add new submission
      assignment.submissions.push({
        student: studentId,
        grade: score,
        submittedAt: new Date()
      });
    }
    
    await assignment.save();
    
    res.json({ 
      message: 'Grade submitted successfully'
    });
  } catch (error) {
    console.error('Submit grade error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create announcement
app.post('/api/announcements', async (req, res) => {
  try {
    const { title, content, authorId, targetRoles } = req.body;
    
    if (!title || !content || !authorId) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const newAnnouncement = new Announcement({
      title,
      content,
      author: authorId,
      targetRoles: targetRoles || ['teacher', 'student', 'parent', 'admin']
    });
    
    await newAnnouncement.save();
    
    res.status(201).json({ 
      message: 'Announcement created successfully',
      announcement: newAnnouncement
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Initialize sample data
const initializeSampleData = async () => {
  try {
    // Check if sample data already exists
    const userCount = await User.countDocuments();
    
    if (userCount === 0) {
      console.log('🌱 Creating sample data...');
      
      // Create sample users
      const sampleUsers = [
        { username: 'teacher1', email: 'teacher1@school.edu', password: 'password', role: 'teacher' },
        { username: 'student1', email: 'student1@school.edu', password: 'password', role: 'student', studentId: 'STU001' },
        { username: 'parent1', email: 'parent1@school.edu', password: 'password', role: 'parent', studentId: 'STU001' },
        { username: 'admin1', email: 'admin1@school.edu', password: 'password', role: 'admin' }
      ];
      
      for (const userData of sampleUsers) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created user: ${userData.username}`);
      }
      
      // Get teacher to create sample class
      const teacher = await User.findOne({ role: 'teacher' });
      if (teacher) {
        const sampleClass = new Class({
          name: 'Mathematics 101',
          subject: 'Math',
          teacher: teacher._id
        });
        await sampleClass.save();
        console.log('✅ Created sample class: Mathematics 101');
      }
      
      // Create sample announcements
      const admin = await User.findOne({ role: 'admin' });
      if (admin) {
        const announcements = [
          {
            title: 'School Holiday',
            content: 'School will be closed on Monday for a public holiday.',
            author: admin._id
          },
          {
            title: 'Sports Day',
            content: 'Annual sports day will be held next Friday. All parents are invited.',
            author: admin._id
          }
        ];
        
        for (const announcementData of announcements) {
          const announcement = new Announcement(announcementData);
          await announcement.save();
          console.log(`✅ Created announcement: ${announcementData.title}`);
        }
      }
      
      console.log('✅ Sample data created successfully!');
    }
  } catch (error) {
    console.error('❌ Error creating sample data:', error);
  }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Open http://localhost:${PORT} in your browser`);
  
  // Initialize sample data after server starts
  await initializeSampleData();
});