const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const corsOptions = require('./config/cors');
const { errorHandler, apiLimiter } = require('./middleware/auth.js');
const userRoutes = require('./routes/userRoutes');
const storyRoutes = require('./routes/storyRoutes');

// Load env vars
dotenv.config();

const app = express();

// Global error handler
const globalErrorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Database connection status
let dbConnected = false;

// Connect to database with retry mechanism
const connectWithRetry = async (retries = 5, interval = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      dbConnected = await connectDB();
      if (dbConnected) break;
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${interval/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
};

connectWithRetry();

// Middleware
app.use(cors(corsOptions));
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../dist')));
}

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Rate limiting
app.use('/api', apiLimiter);

// Routes
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: dbConnected ? 'ok' : 'degraded',
    server: 'running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);
app.use(globalErrorHandler);

// Handle frontend routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../../../dist/index.html'));
    } else {
      res.status(404).json({
        success: false,
        message: 'API route not found'
      });
    }
  });
} else {
  // Handle 404 in development
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  });
}

const PORT = process.env.PORT || 5000;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Log the error but don't crash the server
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Log the error but don't crash the server
});

// Create server with error handling
let server;
try {
  server = app.listen(PORT)
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is busy, trying ${PORT + 1}...`);
        server.listen(PORT + 1);
      } else {
        console.error('Server error:', err);
      }
    })
    .on('listening', () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${server.address().port}`);
      if (!dbConnected) {
        console.log('Warning: Server is running in degraded mode - database is not connected');
        console.log('API endpoints requiring database access will not function properly');
      }
    });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}

module.exports = app;
