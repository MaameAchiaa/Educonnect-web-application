
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Mock your authentication middleware
const createAuthMiddleware = require('../../../path-to-your-app/middleware/authenticateToken');

describe('Authentication Middleware Unit Tests', () => {
  let mongoServer;
  let User;
  let authenticateToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Setup User model
    const userSchema = new mongoose.Schema({
      username: String,
      email: String,
      password: String,
      role: String,
      isActive: Boolean
    });
    
    User = mongoose.model('User', userSchema);
    
    // Create middleware
    authenticateToken = async (req, res, next) => {
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
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  test('should authenticate valid token', async () => {
    // Create a test user
    const user = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'student',
      isActive: true
    });

    const req = {
      headers: {
        authorization: user._id.toString()
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user._id.toString()).toBe(user._id.toString());
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should reject request without token', async () => {
    const req = {
      headers: {}
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ 
      error: 'Access denied. Please log in.' 
    });
  });

  test('should reject invalid user ID', async () => {
    const req = {
      headers: {
        authorization: 'invalidObjectId123'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const next = jest.fn();

    await authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
  });
});