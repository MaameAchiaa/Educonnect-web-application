
const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const User = require('../models/User');

describe('Authentication API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  test('POST /api/register - should create new user', async () => {
    const res = await request(app)
      .post('/api/register')
      .send({
        username: 'testuser',
        email: 'test@edu.com',
        password: 'Password@123',
        role: 'student'
      });
    
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.username).toBe('testuser');
  });

  test('POST /api/login - should authenticate valid user', async () => {
    // First register
    await request(app)
      .post('/api/register')
      .send({
        username: 'testteacher',
        email: 'teacher@edu.com',
        password: 'Password@123',
        role: 'teacher'
      });

    // Then login
    const res = await request(app)
      .post('/api/login')
      .send({
        username: 'testteacher',
        password: 'Password@123',
        role: 'teacher'
      });
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.role).toBe('teacher');
  });
});