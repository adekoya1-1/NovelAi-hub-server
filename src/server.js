const express = require('express');
const path = require('path');
const fs = require('fs');  // Added missing fs import
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
      if (dbConnected) {
        console.log('Database connected successfully');
        break;
      }
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${interval/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
};

// Start database connection
connectWithRetry();

// Middleware
app.use(cors(corsOptions));

// Increase JSON payload limit and add raw body for webhooks
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Increase URL-encoded payload limit
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb'
}));

// Serve static files
const publicDir = path.join(__dirname, '../public');
const uploadsDir = path.join(publicDir, 'uploads');

// Create directories if they don't exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from public directory with proper MIME types
app.use('/public', express.static(publicDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

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
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    frontend: process.env.FRONTEND_URL
  });
});

// API 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware
app.use(errorHandler);
app.use(globalErrorHandler);

// Handle frontend routes in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../../../client/dist');
  
  // Serve static files from the React app
  app.use(express.static(clientBuildPath));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

const PORT = process.env.PORT || 5000;

// Create server with error handling
const startServer = () => {
  try {
    const server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      if (!dbConnected) {
        console.log('Warning: Server is running in degraded mode - database is not connected');
      }
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is busy, trying ${PORT + 1}...`);
        setTimeout(() => {
          server.close();
          startServer(PORT + 1);
        }, 1000);
      } else {
        console.error('Server error:', error);
        process.exit(1);
      }
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
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

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
