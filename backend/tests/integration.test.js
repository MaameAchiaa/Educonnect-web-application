
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Class = require('../models/Class');
const Assignment = require('../models/Assignment');

describe('EduConnect Integration Tests', () => {
  let adminToken, teacherToken, studentToken, parentToken;
  let teacherId, studentId, classId, assignmentId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  beforeEach(async () => {
    // Clean database
    await User.deleteMany({});
    await Class.deleteMany({});
    await Assignment.deleteMany({});
  });

  // ==================== 1. END-TO-END USER FLOW ====================
  describe('User Registration → Login → Dashboard Flow', () => {
    test('Complete user journey: register, login, access dashboard', async () => {
      // Step 1: Register as teacher
      const registerRes = await request(app)
        .post('/api/register')
        .send({
          username: 'integteacher',
          email: 'teacher@integ.com',
          password: 'Password@123',
          role: 'teacher'
        });
      expect(registerRes.statusCode).toBe(201);

      // Step 2: Login
      const loginRes = await request(app)
        .post('/api/login')
        .send({
          username: 'integteacher',
          password: 'Password@123',
          role: 'teacher'
        });
      expect(loginRes.statusCode).toBe(200);
      
      const cookies = loginRes.headers['set-cookie'];
      teacherToken = cookies;

      // Step 3: Access dashboard with session
      const dashboardRes = await request(app)
        .get('/api/dashboard')
        .set('Cookie', teacherToken);
      expect(dashboardRes.statusCode).toBe(200);
      expect(dashboardRes.body.user.role).toBe('teacher');
    });
  });

  // ==================== 2. CLASS MANAGEMENT FLOW ====================
  describe('Class Creation → Student Enrollment Flow', () => {
    beforeEach(async () => {
      // Create teacher
      const teacher = await User.create({
        username: 'classteacher',
        email: 'class@teacher.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'teacher'
      });
      teacherId = teacher._id;

      // Create student
      const student = await User.create({
        username: 'classstudent',
        email: 'student@class.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student',
        studentId: 'STU001'
      });
      studentId = student._id;
    });

    test('Admin creates class → Teacher teaches → Student enrolls', async () => {
      // Admin creates class
      const admin = await User.create({
        username: 'adminuser',
        email: 'admin@integ.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'admin'
      });

      const loginRes = await request(app)
        .post('/api/login')
        .send({
          username: 'adminuser',
          password: 'Password@123',
          role: 'admin'
        });
      const adminToken = loginRes.headers['set-cookie'];

      const classRes = await request(app)
        .post('/api/classes')
        .set('Cookie', adminToken)
        .send({
          name: 'Integration Math',
          subject: 'Mathematics',
          teacherId: teacherId.toString()
        });
      expect(classRes.statusCode).toBe(201);
      classId = classRes.body.class._id;

      // Student enrolls in class
      const studentLogin = await request(app)
        .post('/api/login')
        .send({
          username: 'classstudent',
          password: 'Password@123',
          role: 'student'
        });
      const studentToken = studentLogin.headers['set-cookie'];

      const enrollRes = await request(app)
        .post(`/api/classes/${classId}/self-enroll`)
        .set('Cookie', studentToken);
      expect(enrollRes.statusCode).toBe(200);

      // Verify enrollment
      const classInfo = await Class.findById(classId).populate('students');
      expect(classInfo.students).toHaveLength(1);
      expect(classInfo.students[0]._id.toString()).toBe(studentId.toString());
    });
  });

  // ==================== 3. ASSIGNMENT FULL FLOW ====================
  describe('Assignment Creation → Submission → Grading Flow', () => {
    beforeEach(async () => {
      // Setup: Teacher, Student, Class
      const teacher = await User.create({
        username: 'assignteacher',
        email: 'assign@teacher.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'teacher'
      });

      const student = await User.create({
        username: 'assignstudent',
        email: 'assign@student.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student'
      });

      const classObj = await Class.create({
        name: 'Test Class',
        subject: 'Testing',
        teacher: teacher._id,
        students: [student._id]
      });

      teacherId = teacher._id;
      studentId = student._id;
      classId = classObj._id;
    });

    test('Teacher creates assignment → Student submits → Teacher grades', async () => {
      // Teacher login
      const teacherLogin = await request(app)
        .post('/api/login')
        .send({
          username: 'assignteacher',
          password: 'Password@123',
          role: 'teacher'
        });
      const teacherToken = teacherLogin.headers['set-cookie'];

      // 1. Teacher creates assignment
      const createRes = await request(app)
        .post('/api/assignments')
        .set('Cookie', teacherToken)
        .send({
          title: 'Integration Test Assignment',
          description: 'Test the full flow',
          dueDate: '2024-12-31',
          classId: classId.toString()
        });
      expect(createRes.statusCode).toBe(201);
      assignmentId = createRes.body.assignment._id;

      // 2. Student login
      const studentLogin = await request(app)
        .post('/api/login')
        .send({
          username: 'assignstudent',
          password: 'Password@123',
          role: 'student'
        });
      const studentToken = studentLogin.headers['set-cookie'];

      // 3. Student submits assignment (mock file upload)
      const submitRes = await request(app)
        .post(`/api/assignments/${assignmentId}/submit`)
        .set('Cookie', studentToken)
        .field('description', 'My submission')
        .attach('file', Buffer.from('test content'), 'test.pdf');
      expect(submitRes.statusCode).toBe(200);

      // 4. Teacher grades submission
      const gradeRes = await request(app)
        .post(`/api/assignments/${assignmentId}/submissions/${studentId}/grade`)
        .set('Cookie', teacherToken)
        .send({
          grade: 85,
          score: 42.5,
          feedback: 'Good work!',
          maxScore: 50
        });
      expect(gradeRes.statusCode).toBe(200);

      // 5. Student checks grade
      const gradesRes = await request(app)
        .get('/api/grades')
        .set('Cookie', studentToken);
      expect(gradesRes.statusCode).toBe(200);
      expect(gradesRes.body.grades[0].grade).toBe(85);
    });
  });

  // ==================== 4. PARENT-CHILD INTEGRATION ====================
  describe('Parent Monitoring Child Progress', () => {
    test('Parent links to student → Views assignments and grades', async () => {
      // Create student
      const student = await User.create({
        username: 'childstudent',
        email: 'child@student.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student',
        studentId: 'CHILD001'
      });

      // Create parent linked to student
      const parent = await User.create({
        username: 'parentuser',
        email: 'parent@integ.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'parent',
        studentId: 'CHILD001' // Same studentId links them
      });

      // Create class and assignment for student
      const teacher = await User.create({
        username: 'parentteacher',
        email: 'teacher@parent.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'teacher'
      });

      const classObj = await Class.create({
        name: 'Parent Test Class',
        subject: 'Parenting',
        teacher: teacher._id,
        students: [student._id]
      });

      const assignment = await Assignment.create({
        title: 'Parent Test Assignment',
        description: 'For parent monitoring',
        dueDate: new Date('2024-12-31'),
        class: classObj._id,
        teacher: teacher._id,
        submissions: [{
          student: student._id,
          grade: 92,
          feedback: 'Excellent work'
        }]
      });

      // Parent login and view dashboard
      const parentLogin = await request(app)
        .post('/api/login')
        .send({
          username: 'parentuser',
          password: 'Password@123',
          role: 'parent'
        });
      const parentToken = parentLogin.headers['set-cookie'];

      const parentDashboard = await request(app)
        .get('/api/dashboard')
        .set('Cookie', parentToken);
      expect(parentDashboard.statusCode).toBe(200);
      expect(parentDashboard.body.assignments).toHaveLength(1);
      expect(parentDashboard.body.assignments[0].submissions[0].grade).toBe(92);
    });
  });

  // ==================== 5. ROLE-BASED ACCESS INTEGRATION ====================
  describe('Cross-Role Access Control', () => {
    beforeEach(async () => {
      // Create one user of each role
      await User.create({
        username: 'testadmin',
        email: 'admin@role.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'admin'
      });

      await User.create({
        username: 'testteacher',
        email: 'teacher@role.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'teacher'
      });

      await User.create({
        username: 'teststudent',
        email: 'student@role.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'student'
      });

      await User.create({
        username: 'testparent',
        email: 'parent@role.com',
        password: await bcrypt.hash('Password@123', 10),
        role: 'parent'
      });
    });

    test('Each role can only access permitted endpoints', async () => {
      const roles = ['admin', 'teacher', 'student', 'parent'];
      
      for (const role of roles) {
        const loginRes = await request(app)
          .post('/api/login')
          .send({
            username: `test${role}`,
            password: 'Password@123',
            role: role
          });
        const token = loginRes.headers['set-cookie'];

        // Test admin-only endpoint
        const adminRes = await request(app)
          .get('/api/admin-data')
          .set('Cookie', token);
        
        if (role === 'admin') {
          expect(adminRes.statusCode).toBe(200);
        } else {
          expect(adminRes.statusCode).toBe(403); // Forbidden
        }

        // Test teacher assignment creation
        const assignRes = await request(app)
          .post('/api/assignments')
          .set('Cookie', token)
          .send({ title: 'Test', description: 'Test', dueDate: '2024-12-31', classId: 'dummy' });
        
        if (role === 'teacher' || role === 'admin') {
          // Will fail due to invalid classId but shows attempt was allowed
          expect([400, 404]).toContain(assignRes.statusCode);
        } else {
          expect(assignRes.statusCode).toBe(403); // Forbidden
        }
      }
    });
  });

  // ==================== 6. SESSION & AUTH INTEGRATION ====================
  describe('Session Management Across Requests', () => {
    test('Session persists across multiple requests', async () => {
      // Register and login
      await request(app)
        .post('/api/register')
        .send({
          username: 'sessionuser',
          email: 'session@test.com',
          password: 'Password@123',
          role: 'student'
        });

      const loginRes = await request(app)
        .post('/api/login')
        .send({
          username: 'sessionuser',
          password: 'Password@123',
          role: 'student'
        });
      const token = loginRes.headers['set-cookie'];

      // Make multiple requests with same session
      const requests = [
        request(app).get('/api/dashboard').set('Cookie', token),
        request(app).get('/api/assignments').set('Cookie', token),
        request(app).get('/api/grades').set('Cookie', token)
      ];

      const responses = await Promise.all(requests);
      
      // All should succeed with same user
      responses.forEach(res => {
        expect(res.statusCode).toBe(200);
      });

      // Logout
      const logoutRes = await request(app)
        .post('/api/logout')
        .set('Cookie', token);
      expect(logoutRes.statusCode).toBe(200);

      // Session should be invalid after logout
      const invalidRes = await request(app)
        .get('/api/dashboard')
        .set('Cookie', token);
      expect(invalidRes.statusCode).toBe(401); // Unauthorized
    });
  });

  // ==================== 7. ERROR HANDLING INTEGRATION ====================
  describe('Error Handling Across System', () => {
    test('System handles invalid requests gracefully', async () => {
      const tests = [
        { url: '/api/login', method: 'POST', data: {}, expected: 400 },
        { url: '/api/register', method: 'POST', data: { username: 'test' }, expected: 400 },
        { url: '/api/assignments/invalid-id', method: 'GET', expected: 404 },
        { url: '/api/nonexistent', method: 'GET', expected: 404 }
      ];

      for (const test of tests) {
        const res = await request(app)
          [test.method.toLowerCase()](test.url)
          .send(test.data || {});
        expect(res.statusCode).toBe(test.expected);
      }
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });
});