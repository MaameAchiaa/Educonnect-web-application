
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/Educonnect', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB Connected: localhost');
    console.log('📊 Database: Educonnect');

  } catch (error) {
   console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;