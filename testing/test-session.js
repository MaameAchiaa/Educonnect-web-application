
// test-session.js
const mongoose = require('mongoose');
require('dotenv').config();

async function testSession() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/educonnect');
    console.log('✅ MongoDB connected');
    
    // Check if sessions collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasSessions = collections.some(c => c.name === 'sessions');
    console.log('Sessions collection exists:', hasSessions);
    
    // Create a test user if needed
    const User = mongoose.model('User', new mongoose.Schema({
      username: String,
      email: String,
      password: String,
      role: String
    }));
    
    const testUser = await User.findOne({ username: 'teacher' });
    console.log('Test user found:', testUser ? 'Yes' : 'No');
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testSession();