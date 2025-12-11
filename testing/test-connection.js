
// test-connection.js
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/educonnect', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('✅ Successfully connected to MongoDB!');
  
  // Test insert
  const User = mongoose.model('User', { name: String });
  const testUser = new User({ name: 'Test User' });
  
  testUser.save()
    .then(() => console.log('✅ Test user saved successfully'))
    .then(() => process.exit(0))
    .catch(err => console.error('❌ Error:', err));
});