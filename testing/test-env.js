
require('dotenv').config();

console.log('Environment Variables Test:');
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('JWT_SECET exists:', !!process.env.JWT_SECRET);