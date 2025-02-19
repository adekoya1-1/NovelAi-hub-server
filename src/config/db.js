const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      retryWrites: true,
      w: 'majority'
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection errors after initial connection
    mongoose.connection.on('error', err => {
      console.error('MongoDB connection error:', err);
      console.log('Please check:');
      console.log('1. Your IP address is whitelisted in MongoDB Atlas');
      console.log('2. Your database username and password are correct');
      console.log('3. Your database cluster is running and accessible');
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.log('\nTroubleshooting steps:');
    console.log('1. Verify your MongoDB URI in the .env file');
    console.log('2. Ensure your IP address is whitelisted in MongoDB Atlas:');
    console.log('   - Log in to MongoDB Atlas');
    console.log('   - Go to Network Access');
    console.log('   - Add your current IP address');
    console.log('3. Check your database credentials');
    console.log('4. Verify your cluster is active\n');
    
    // Don't exit the process, let the application continue without DB
    // This allows the server to start and show the error in the health check
    return false;
  }
  return true;
};

module.exports = connectDB;
