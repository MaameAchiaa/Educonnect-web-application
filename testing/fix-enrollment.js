
// fix-enrollment.js
const mongoose = require('mongoose');
require('dotenv').config();

async function fixEnrollment() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/educonnect');
    console.log('✅ MongoDB Connected');
    
    const User = mongoose.model('User', new mongoose.Schema({
      username: String,
      role: String,
      studentId: String
    }));
    
    const Class = mongoose.model('Class', new mongoose.Schema({
      name: String,
      subject: String,
      teacher: mongoose.Schema.Types.ObjectId,
      students: [mongoose.Schema.Types.ObjectId]
    }));
    
    // Get all students
    const students = await User.find({ role: 'student' });
    console.log(`Found ${students.length} students`);
    
    // Get all classes
    const classes = await Class.find();
    console.log(`Found ${classes.length} classes`);
    
    // Enroll each student in each class
    for (const classDoc of classes) {
      for (const student of students) {
        if (!classDoc.students.includes(student._id)) {
          classDoc.students.push(student._id);
        }
      }
      await classDoc.save();
      console.log(`✅ Enrolled students in ${classDoc.name}`);
    }
    
    console.log('🎉 Enrollment fixed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixEnrollment();