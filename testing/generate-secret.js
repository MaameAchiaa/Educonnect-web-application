
const crypto = require('crypto');

// Generate a random 64-byte (512-bit) secret
const jwtSecret = crypto.randomBytes(64).toString('hex');

console.log('============================================');
console.log('✅ Your JWT_SECRET (copy this to your .env):');
console.log('============================================');
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('============================================\n');

console.log('📝 Add this to your .env file:');
console.log(`JWT_SECRET=${jwtSecret}`);