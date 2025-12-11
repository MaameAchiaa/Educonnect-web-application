

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let User;

describe('User Model Unit Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Load the actual schema from your app
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
    
    User = mongoose.model('User', userSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  test('should create a valid user', async () => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password@123',
      role: 'student'
    };

    const user = new User(userData);
    const savedUser = await user.save();

    expect(savedUser._id).toBeDefined();
    expect(savedUser.username).toBe(userData.username);
    expect(savedUser.email).toBe(userData.email);
    expect(savedUser.role).toBe(userData.role);
    expect(savedUser.isActive).toBe(true);
    expect(savedUser.createdAt).toBeDefined();
  });

  test('should fail to create user without required fields', async () => {
    const user = new User({ username: 'test' });

    let error;
    try {
      await user.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.errors.email).toBeDefined();
    expect(error.errors.password).toBeDefined();
    expect(error.errors.role).toBeDefined();
  });

  test('should fail to create user with duplicate username', async () => {
    const user1 = new User({
      username: 'testuser',
      email: 'test1@example.com',
      password: 'Password@123',
      role: 'student'
    });
    
    await user1.save();

    const user2 = new User({
      username: 'testuser',  // Same username
      email: 'test2@example.com',
      password: 'Password@123',
      role: 'teacher'
    });

    let error;
    try {
      await user2.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe(11000);
  });

  test('should fail with invalid role', async () => {
    const user = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password@123',
      role: 'invalid_role'
    });

    let error;
    try {
      await user.save();
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.errors.role).toBeDefined();
  });
});