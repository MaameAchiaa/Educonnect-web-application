const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define User schema inline
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'parent'], required: true },
  studentId: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

async function testAuth() {
  console.log("🧪 Testing Auth Logic...");
  
  // Connect to test DB
  await mongoose.connect('mongodb://localhost:27017/educonnect', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  console.log("✅ Connected to MongoDB");
  
  // Test 1: Password hashing
  const password = 'Password@123';
  const hashed = await bcrypt.hash(password, 10);
  const match = await bcrypt.compare(password, hashed);
  console.log("✅ Password hashing test:", match ? "PASS" : "FAIL");
  
  // Test 2: Create test user
  const user = new User({
    username: 'testuser',
    email: 'test@edu.com',
    password: hashed,
    role: 'student'
  });
  
  try {
    await user.save();
    console.log("✅ User creation test: PASS");
    
    // Test 3: Find user
    const foundUser = await User.findOne({ username: 'testuser' });
    console.log("✅ User retrieval test:", foundUser ? "PASS" : "FAIL");
    
    // Cleanup
    await User.deleteOne({ username: 'testuser' });
    console.log("✅ Cleanup completed");
    
  } catch (err) {
    console.log("❌ Test failed:", err.message);
  }
  
  await mongoose.disconnect();
  console.log("🎯 All auth tests completed!");
}

testAuth().catch(console.error);
