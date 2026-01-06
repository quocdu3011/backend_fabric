/**
 * Authentication Middleware Module
 * 
 * Provides JWT authentication and ABAC (Attribute-Based Access Control)
 * middleware for protecting API endpoints.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 8.5
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const authConfig = require('../config/auth-config');
const { getAuthService } = require('../services/auth-service');

/**
 * Rate Limiter for Login Endpoint
 * 
 * Prevents brute force attacks by limiting login attempts.
 * Configuration: 5 attempts per 15 minutes per IP address.
 * Returns 429 Too Many Requests when limit exceeded.
 * 
 * @requirement 8.5
 */
const loginRateLimiter = rateLimit({
  windowMs: authConfig.rateLimit.windowMs, // 15 minutes
  max: authConfig.rateLimit.maxAttempts, // 5 attempts per window
  message: {
    success: false,
    error: authConfig.rateLimit.message.error,
    code: authConfig.rateLimit.message.code,
    timestamp: new Date().toISOString()
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Use IP address as key
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  // Skip successful requests (only count failed login attempts)
  skipSuccessfulRequests: false,
  // Handler for when rate limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: authConfig.rateLimit.message.error,
      code: authConfig.rateLimit.message.code,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Extract Bearer token from Authorization header
 * @param {Object} req - Express request object
 * @returns {string|null} Token or null if not found
 * @private
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  // Check for Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * JWT Authentication Middleware
 * 
 * Validates JWT token from Authorization header and attaches
 * user identity information to the request object.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @requirement 5.1, 5.2, 5.3, 5.4, 5.5
 */
function authMiddleware(req, res, next) {
  // Extract token from Authorization header
  const token = extractToken(req);
  
  // Check if token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided',
      code: 'AUTH_NO_TOKEN',
      timestamp: new Date().toISOString()
    });
  }

  // Check if token is blacklisted
  const authService = getAuthService();
  if (authService.isTokenBlacklisted(token)) {
    return res.status(401).json({
      success: false,
      error: 'Token has been invalidated',
      code: 'AUTH_TOKEN_INVALID',
      timestamp: new Date().toISOString()
    });
  }
  
  // Verify token
  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret, {
      algorithms: [authConfig.jwt.algorithm]
    });
    
    // Attach user info to request object
    req.user = {
      username: decoded.username,
      mspId: decoded.mspId,
      ou: decoded.ou
    };
    
    // Store token for potential logout
    req.token = token;
    
    next();
  } catch (err) {
    // Handle specific JWT errors
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'AUTH_TOKEN_EXPIRED',
        timestamp: new Date().toISOString()
      });
    }
    
    // Handle invalid token (malformed, wrong signature, etc.)
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'AUTH_TOKEN_INVALID',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * ABAC Authorization Middleware Factory
 * 
 * Creates middleware that checks user's OU attribute against allowed roles.
 * Must be used after authMiddleware.
 * 
 * @param {...string} allowedRoles - Array of allowed OU values
 * @returns {Function} Express middleware function
 * @requirement 4.1, 4.2, 4.3, 4.4, 4.6
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_NO_TOKEN',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check if user's OU is in allowed roles
    const userRole = req.user.ou;
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.',
        code: 'AUTH_FORBIDDEN',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

/**
 * Optional Auth Middleware
 * 
 * Attaches user info if valid token present, but doesn't require authentication.
 * Used for public endpoints that may optionally use user context.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @requirement 4.5
 */
function optionalAuth(req, res, next) {
  // Extract token from Authorization header
  const token = extractToken(req);
  
  // If no token, continue without user context
  if (!token) {
    req.user = null;
    return next();
  }
  
  // Check if token is blacklisted
  const authService = getAuthService();
  if (authService.isTokenBlacklisted(token)) {
    req.user = null;
    return next();
  }
  
  // Try to verify token
  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret, {
      algorithms: [authConfig.jwt.algorithm]
    });
    
    // Attach user info to request object
    req.user = {
      username: decoded.username,
      mspId: decoded.mspId,
      ou: decoded.ou
    };
    
    req.token = token;
  } catch (err) {
    // Token invalid or expired, continue without user context
    req.user = null;
  }
  
  next();
}

module.exports = {
  authMiddleware,
  requireRole,
  optionalAuth,
  extractToken,
  loginRateLimiter
};
