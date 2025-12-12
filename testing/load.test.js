
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('failed_requests');
const loginRate = new Rate('successful_logins');

// Test configuration
export const options = {
  stages: [
    // Ramp up to 100 users over 1 minute
    { duration: '1m', target: 100 },
    // Stay at 100 users for 5 minutes
    { duration: '5m', target: 100 },
    // Ramp up to 500 users over 2 minutes
    { duration: '2m', target: 500 },
    // Stay at 500 users for 10 minutes
    { duration: '10m', target: 500 },
    // Ramp down to 0 over 1 minute
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% of requests < 2s
    'failed_requests': ['rate<0.1'], // <10% failures
    'successful_logins': ['rate>0.9'], // >90% login success
  },
};

// Test users (pre-registered)
const testUsers = [
  { username: 'student1', password: 'Password@123', role: 'student' },
  { username: 'student2', password: 'Password@123', role: 'student' },
  // Add more test users as needed
];

export default function () {
  // Select random user
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // 1. Test Login
  const loginRes = http.post('http://localhost:3000/api/login', JSON.stringify({
    username: user.username,
    password: user.password,
    role: user.role
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  const loginSuccess = check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  loginRate.add(loginSuccess);
  
  if (!loginSuccess) {
    failureRate.add(1);
    return;
  }
  
  // Get session from response (simplified - in real test, parse cookie)
  const session = JSON.parse(loginRes.body).session || {};
  
  // 2. Test Dashboard Access
  const dashboardRes = http.get('http://localhost:3000/api/dashboard', {
    headers: {
      'Cookie': `educonnect.sid=${session.id}`,
    },
  });
  
  const dashboardSuccess = check(dashboardRes, {
    'dashboard status is 200': (r) => r.status === 200,
    'dashboard loads < 2s': (r) => r.timings.duration < 2000,
  });
  
  failureRate.add(!dashboardSuccess);
  
  // 3. Test Role-Specific Endpoints
  if (user.role === 'student') {
    // Test assignments endpoint
    const assignmentsRes = http.get('http://localhost:3000/api/assignments', {
      headers: {
        'Cookie': `educonnect.sid=${session.id}`,
      },
    });
    
    check(assignmentsRes, {
      'assignments status is 200': (r) => r.status === 200,
      'assignments response < 1.5s': (r) => r.timings.duration < 1500,
    });
  }
  
  // Random sleep to simulate user think time
  sleep(Math.random() * 2 + 1);
}