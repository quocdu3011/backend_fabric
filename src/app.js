/**
 * Main Application Server
 * 
 * Express.js server for the Hyperledger Fabric Degree and Transcript Management System.
 * This server provides RESTful API endpoints for degree issuance, transcript management,
 * and degree queries.
 * 
 * Features:
 * - Singleton Gateway connection to Hyperledger Fabric
 * - RESTful API endpoints
 * - Comprehensive error handling
 * - Graceful shutdown handling
 * - Health check endpoint
 */

const express = require('express');
const cors = require('cors');
const { GatewayConnectionManager } = require('./fabric/gateway-connection');
const apiRoutes = require('./routes/api-routes');
const authRoutes = require('./routes/auth-routes');
const { errorHandler } = require('./middleware/error-handler');
const config = require('./config/fabric-config');

// Create Express application instance
const app = express();

// CORS configuration - Allow frontend to call API
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    // Allow all localhost origins
    if (origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware setup
// Parse JSON request bodies
app.use(express.json());

// Log incoming requests (simple logging middleware)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Mount Auth routes at /api/auth
app.use('/api/auth', authRoutes);

// Mount API routes at /api
app.use('/api', apiRoutes);

// Error handler middleware (must be last middleware)
app.use(errorHandler);

// Server instance reference for graceful shutdown
let server = null;

/**
 * Initialize Gateway connection and start server
 */
async function startServer() {
  try {
    console.log('=== Starting Hyperledger Fabric Backend API Server ===');
    console.log(`Environment: ${config.NODE_ENV}`);
    console.log(`Port: ${config.PORT}`);
    console.log(`Peer Endpoint: ${config.PEER_ENDPOINT}`);
    console.log(`MSP ID: ${config.MSP_ID}`);
    console.log(`Channel: ${config.CHANNEL_NAME}`);
    console.log(`Chaincode: ${config.CHAINCODE_NAME}`);
    console.log('');

    // Initialize Database connection
    console.log('Initializing PostgreSQL database connection...');
    const db = require('./database/db');
    const isConnected = await db.checkConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to PostgreSQL database');
    }
    console.log('Database connection initialized successfully');
    console.log('');

    // Initialize Gateway connection (Singleton Pattern)
    console.log('Initializing Gateway connection...');
    const gatewayManager = await GatewayConnectionManager.getInstance();
    console.log('Gateway connection initialized successfully');
    console.log('');

    // Start Express server
    server = app.listen(config.PORT, () => {
      console.log(`✓ Server is running on port ${config.PORT}`);
      console.log(`✓ Health check: http://localhost:${config.PORT}/api/health`);
      console.log(`✓ API endpoints available at http://localhost:${config.PORT}/api`);
      console.log('');
      console.log('=== Server started successfully ===');
    });

  } catch (error) {
    console.error('Failed to start server:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 * Closes Gateway connection and Express server cleanly
 */
async function gracefulShutdown(signal) {
  console.log('');
  console.log(`${signal} signal received: closing HTTP server and Gateway connection`);

  try {
    // Close Express server (stop accepting new connections)
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error('Error closing HTTP server:', err.message);
            reject(err);
          } else {
            console.log('✓ HTTP server closed');
            resolve();
          }
        });
      });
    }

    // Disconnect from Gateway
    const gatewayManager = await GatewayConnectionManager.getInstance();
    await gatewayManager.disconnect();
    console.log('✓ Gateway connection closed');

    // Close database connection
    const db = require('./database/db');
    await db.close();
    console.log('✓ Database connection closed');

    console.log('Graceful shutdown completed');
    process.exit(0);

  } catch (error) {
    console.error('Error during graceful shutdown:', error.message);
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error('Stack trace:', error.stack);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the server
startServer();

// Export app for testing purposes
module.exports = app;
