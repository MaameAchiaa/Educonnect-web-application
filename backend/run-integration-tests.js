
const { exec } = require('child_process');
const path = require('path');

console.log('🚀 Starting EduConnect Integration Tests...\n');

const tests = [
  { name: 'User Registration Flow', file: 'integration.test.js', filter: 'User Registration' },
  { name: 'Class Management Flow', file: 'integration.test.js', filter: 'Class Management' },
  { name: 'Assignment Full Flow', file: 'integration.test.js', filter: 'Assignment Full Flow' },
  { name: 'Parent-Child Integration', file: 'integration.test.js', filter: 'Parent Monitoring' },
  { name: 'Role-Based Access', file: 'integration.test.js', filter: 'Cross-Role Access' },
  { name: 'Session Management', file: 'integration.test.js', filter: 'Session Management' },
  { name: 'Error Handling', file: 'integration.test.js', filter: 'Error Handling' }
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    console.log('─'.repeat(50));

    try {
      const result = await new Promise((resolve) => {
        exec(
          `npx jest tests/${test.file} --testNamePattern="${test.filter}"`,
          { env: { ...process.env, MONGODB_URI: 'mongodb://localhost:27017/educonnect' } },
          (error, stdout, stderr) => {
            console.log(stdout);
            if (stderr) console.error(stderr);
            resolve(!error);
          }
        );
      });

      if (result) {
        console.log(`✅ ${test.name}: PASSED\n`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED\n`);
        failed++;
      }
    } catch (error) {
      console.error(`💥 ${test.name}: ERROR - ${error.message}\n`);
      failed++;
    }
  }

  console.log('='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log('\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();