/**
 * Authentication Configuration
 * Loads authentication settings from environment variables
 */

require('dotenv').config();
const path = require('path');

const authConfig = {
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRY || '24h',
    algorithm: 'HS256'
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxAttempts: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS, 10) || 5, // 5 attempts per window
    message: {
      success: false,
      error: 'Too many login attempts. Please try again later.',
      code: 'AUTH_RATE_LIMITED'
    }
  },

  // Password Hashing Configuration
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10
  },

  // Wallet Configuration
  wallet: {
    path: process.env.WALLET_PATH || path.join(__dirname, '../../wallet')
  }
};

// Validate critical configuration in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret-change-in-production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
}

module.exports = authConfig;
