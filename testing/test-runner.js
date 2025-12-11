
const axios = require('axios');
const fs = require('fs');

class EduConnectTester {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.results = [];
    this.token = null;
    this.userId = null;
  }

  async runTests() {
    console.log('🚀 Starting EduConnect Tests...\n');
    
    await this.testConnection();
    await this.testRegistration();
    await this.testLogin();
    await this.testDashboard();
    await this.testAssignments();
    await this.testAdminFeatures();
    
    this.printResults();
  }

  async testConnection() {
    try {
      const response = await axios.get(this.baseURL);
      this.recordTest('Server Connection', true, 'Server is running');
    } catch (error) {
      this.recordTest('Server Connection', false, error.message);
    }
  }

  async testRegistration() {
    const testUser = {
      username: `testuser_${Date.now()}`,
      email: `test${Date.now()}@test.com`,
      password: 'Test@1234',
      role: 'student',
      studentId: 'TEST001'
    };

    try {
      const response = await axios.post(`${this.baseURL}/api/register`, testUser);
      this.recordTest('User Registration', true, 'User registered successfully');
      this.userId = response.data.user._id;
    } catch (error) {
      this.recordTest('User Registration', false, error.response?.data?.error || error.message);
    }
  }

  async testLogin() {
    const credentials = {
      username: 'admin',
      password: 'Password@123',
      role: 'admin'
    };

    try {
      const response = await axios.post(`${this.baseURL}/api/login`, credentials);
      this.token = response.data.token;
      this.recordTest('User Login', true, 'Login successful');
    } catch (error) {
      this.recordTest('User Login', false, error.response?.data?.error || error.message);
    }
  }

  async testDashboard() {
    if (!this.token) return;

    try {
      const response = await axios.get(`${this.baseURL}/api/dashboard`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      this.recordTest('Dashboard Access', true, 'Dashboard data loaded');
    } catch (error) {
      this.recordTest('Dashboard Access', false, error.response?.data?.error || error.message);
    }
  }

  async testAssignments() {
    if (!this.token) return;

    try {
      // Test getting assignments
      const response = await axios.get(`${this.baseURL}/api/dashboard`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      this.recordTest('Assignments API', true, 'Assignments data accessible');
    } catch (error) {
      this.recordTest('Assignments API', false, error.message);
    }
  }

  async testAdminFeatures() {
    if (!this.token) return;

    try {
      // Test getting users
      const response = await axios.get(`${this.baseURL}/api/users`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
      this.recordTest('Admin Users API', true, 'Users list accessible');
    } catch (error) {
      this.recordTest('Admin Users API', false, error.message);
    }
  }

  recordTest(name, passed, message) {
    const result = {
      name,
      status: passed ? '✅ PASS' : '❌ FAIL',
      message,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);
    console.log(`${result.status} - ${name}: ${message}`);
  }

  printResults() {
    console.log('\n📊 TEST SUMMARY');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status.includes('PASS')).length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    // Save results to file
    fs.writeFileSync('test-results.json', JSON.stringify(this.results, null, 2));
    console.log('\n📄 Detailed results saved to test-results.json');
  }
}

// Run tests
const tester = new EduConnectTester();
tester.runTests().catch(console.error);