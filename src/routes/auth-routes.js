/**
 * Auth Routes Module
 * 
 * Defines RESTful API endpoints for user authentication and authorization.
 * This module handles HTTP request/response logic for:
 * - User registration (admin only)
 * - User enrollment with Fabric CA
 * - User login and JWT token generation
 * - User logout and session invalidation
 * - User profile retrieval
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

const express = require('express');
const router = express.Router();

// Import AuthService
const { getAuthService } = require('../services/auth-service');

// Import auth middleware
const { 
  authMiddleware, 
  requireRole, 
  loginRateLimiter 
} = require('../middleware/auth-middleware');

/**
 * POST /api/auth/import-admin
 * 
 * Import admin identity from file system (using .env paths).
 * This is a helper endpoint for setting up the environment.
 */
router.post('/import-admin', async (req, res) => {
  try {
    const authService = getAuthService();
    const result = await authService.importAdminIdentity();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/auth/register
 * 
 * Register a new user with the system.
 * Requires admin authentication.
 * 
 * Request Body:
 * {
 *   "adminUsername": "admin",
 *   "adminPassword": "adminpw",
 *   "userData": {
 *     "username": "newuser",
 *     "password": "userpassword",
 *     "role": "student",  // admin | student | client
 *     "studentId": "CT010203" // Optional: Official Student ID (if different from username)
 *   }
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "enrollmentId": "newuser",
 *   "enrollmentSecret": "abc123...",
 *   "message": "User registered successfully..."
 * }
 * 
 * Error Responses:
 * - 400: Missing required fields
 * - 401: Invalid admin credentials
 * - 409: User already exists
 * 
 * @requirement 7.1
 */
router.post('/register', async (req, res) => {
  try {
    const { adminUsername, adminPassword, userData } = req.body;

    // Validate required fields
    if (!adminUsername || !adminPassword) {
      return res.status(400).json({
        success: false,
        error: 'Admin credentials are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    if (!userData) {
      return res.status(400).json({
        success: false,
        error: 'User data is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    if (!userData.username || !userData.password || !userData.role) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and role are required in userData',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Call AuthService to register user
    const authService = getAuthService();
    const result = await authService.registerUser(adminUsername, adminPassword, userData);

    return res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/auth/register:', error.message);

    // Handle user already exists
    if (error.code === 'AUTH_USER_EXISTS') {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
    }

    // Handle invalid admin credentials
    if (error.message === 'Invalid admin credentials') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: 'AUTH_INVALID_CREDENTIALS',
        timestamp: new Date().toISOString()
      });
    }

    // Handle validation errors
    if (error.message.includes('required') || error.message.includes('Invalid role')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to register user',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});


/**
 * POST /api/auth/enroll
 * 
 * Enroll a registered user and store their identity in wallet.
 * Does not require authentication (user enrolls with enrollment secret).
 * 
 * Request Body:
 * {
 *   "username": "newuser",
 *   "enrollmentSecret": "abc123..."
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "username": "newuser",
 *   "mspId": "Org1MSP",
 *   "ou": "student",
 *   "enrolledAt": "2024-12-09T10:00:00Z",
 *   "message": "User enrolled successfully"
 * }
 * 
 * Error Responses:
 * - 400: Missing required fields or invalid enrollment secret
 * - 404: User not found
 * 
 * @requirement 7.2
 */
router.post('/enroll', async (req, res) => {
  try {
    const { username, enrollmentSecret } = req.body;

    // Validate required fields
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    if (!enrollmentSecret) {
      return res.status(400).json({
        success: false,
        error: 'Enrollment secret is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Call AuthService to enroll user
    const authService = getAuthService();
    const result = await authService.enrollUser(username, enrollmentSecret);

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/auth/enroll:', error.message);

    // Handle user not found
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'AUTH_USER_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    // Handle invalid enrollment secret
    if (error.message === 'Invalid enrollment secret') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'AUTH_INVALID_SECRET',
        timestamp: new Date().toISOString()
      });
    }

    // Handle already enrolled
    if (error.message === 'User already enrolled') {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'AUTH_ALREADY_ENROLLED',
        timestamp: new Date().toISOString()
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to enroll user',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/auth/login
 * 
 * Authenticate user and generate JWT token.
 * Rate limited to prevent brute force attacks.
 * 
 * Request Body:
 * {
 *   "username": "user1",
 *   "password": "userpassword"
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "token": "eyJhbGciOiJIUzI1NiIs...",
 *   "user": {
 *     "username": "user1",
 *     "mspId": "Org1MSP",
 *     "ou": "student",
 *     "enrolledAt": "2024-12-09T10:00:00Z"
 *   }
 * }
 * 
 * Error Responses:
 * - 400: Missing required fields
 * - 401: Invalid credentials or user not enrolled
 * - 429: Too many login attempts
 * 
 * @requirement 7.3
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Call AuthService to login
    const authService = getAuthService();
    const result = await authService.login(username, password);

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/auth/login:', error.message);

    // Handle invalid credentials
    if (error.code === 'AUTH_INVALID_CREDENTIALS') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
    }

    // Handle user not enrolled
    if (error.code === 'AUTH_NOT_ENROLLED') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
    }

    // Handle identity not found
    if (error.code === 'AUTH_IDENTITY_NOT_FOUND') {
      return res.status(401).json({
        success: false,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });
    }

    // Handle other errors
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to login',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});


/**
 * POST /api/auth/logout
 * 
 * Logout user and invalidate JWT token.
 * Requires authentication.
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 * 
 * Error Responses:
 * - 401: No token or invalid token
 * 
 * @requirement 7.4
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // Get token from request (attached by authMiddleware)
    const token = req.token;

    // Call AuthService to logout
    const authService = getAuthService();
    const result = await authService.logout(token);

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/auth/logout:', error.message);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to logout',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/auth/profile
 * 
 * Get current user's profile information.
 * Requires authentication.
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "profile": {
 *     "username": "user1",
 *     "role": "student",
 *     "enrolled": true,
 *     "mspId": "Org1MSP",
 *     "ou": "student",
 *     "certificateInfo": {
 *       "cn": "user1",
 *       "validFrom": "2024-12-09T10:00:00Z",
 *       "validTo": "2025-12-09T10:00:00Z",
 *       "serialNumber": "abc123..."
 *     },
 *     "createdAt": "2024-12-09T09:00:00Z",
 *     "enrolledAt": "2024-12-09T10:00:00Z"
 *   }
 * }
 * 
 * Error Responses:
 * - 401: No token or invalid token
 * - 404: User not found
 * 
 * @requirement 7.5
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // Get username from authenticated user
    const { username } = req.user;

    // Call AuthService to get profile
    const authService = getAuthService();
    const profile = await authService.getProfile(username);

    return res.status(200).json({
      success: true,
      profile,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in GET /api/auth/profile:', error.message);

    // Handle user not found
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
        code: 'AUTH_USER_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get profile',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/auth/refresh
 * 
 * Refresh access token using refresh token.
 * 
 * Request Body:
 * {
 *   "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
 * }
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "accessToken": "eyJhbGciOiJIUzI1NiIs...",
 *   "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
 * }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }

    // Call AuthService to refresh token
    const authService = getAuthService();
    const result = await authService.refreshToken(refreshToken);

    return res.status(200).json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in POST /api/auth/refresh:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired. Please login again.',
        code: 'AUTH_REFRESH_EXPIRED',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token',
      code: 'AUTH_INVALID_TOKEN',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
