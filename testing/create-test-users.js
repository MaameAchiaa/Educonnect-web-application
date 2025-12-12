
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function createTestUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/educonnect');
    
    const User = mongoose.model('User', new mongoose.Schema({
      username: String,
      email: String,
      password: String,
      role: String,
      studentId: String,
      isActive: Boolean
    }));
    
    // Create test users
    const users = [
      {
        username: 'student1',
        email: 'student1@test.edu',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student',
        studentId: 'STU001',
        isActive: true
      },
      {
        username: 'student2',
        email: 'student2@test.edu',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student',
        studentId: 'STU002',
        isActive: true
      },
      {
        username: 'teacher1',
        email: 'teacher1@test.edu',
        password: await bcrypt.hash('Password@123', 10),
        role: 'teacher',
        isActive: true
      },
      {
        username: 'admin',
        email: 'admin@test.edu',
        password: await bcrypt.hash('Password@123', 10),
        role: 'admin',
        isActive: true
      }
    ];
    
    // Insert users
    for (const userData of users) {
      try {
        await User.create(userData);
        console.log(`Created user: ${userData.username}`);
      } catch (error) {
        console.log(`User ${userData.username} may already exist`);
      }
    }
    
    console.log('Test users created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestUsers();