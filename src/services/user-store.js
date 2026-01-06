/**
 * User Store - PostgreSQL-based persistent storage for user data
 * 
 * This module provides persistent storage for user registration data
 * using PostgreSQL database.
 */

const db = require('../database/db');

/**
 * UserStore - Manages persistent user data storage in PostgreSQL
 */
class UserStore {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize store by checking database connection
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Check database connection
      const connected = await db.checkConnection();
      if (!connected) {
        throw new Error('Failed to connect to database');
      }
      
      console.log('User store initialized with PostgreSQL');
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing user store:', error.message);
      throw error;
    }
  }

  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} User data or null
   */
  async getUser(username) {
    await this.initialize();
    
    try {
      const result = await db.query(
        'SELECT username, password_hash as "passwordHash", role, student_id as "studentId", enrollment_secret as "enrollmentSecret", enrolled, created_at as "createdAt", enrolled_at as "enrolledAt" FROM users WHERE username = $1',
        [username]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const user = result.rows[0];
      
      // Get identity if exists
      const identityResult = await db.query(
        'SELECT type, msp_id as "mspId", ou, certificate, private_key as "privateKey", created_at as "createdAt", version FROM identities WHERE username = $1',
        [username]
      );
      
      if (identityResult.rows.length > 0) {
        const identity = identityResult.rows[0];
        user.identity = {
          type: identity.type,
          mspId: identity.mspId,
          ou: identity.ou,
          credentials: {
            certificate: identity.certificate,
            privateKey: identity.privateKey
          },
          createdAt: identity.createdAt,
          version: identity.version
        };
      }
      
      return user;
    } catch (error) {
      console.error('Error getting user:', error.message);
      throw error;
    }
  }

  /**
   * Save user data
   * @param {string} username - Username
   * @param {Object} userData - User data
   * @returns {Promise<void>}
   */
  async setUser(username, userData) {
    await this.initialize();
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Check if user exists
      const existingUser = await client.query(
        'SELECT username FROM users WHERE username = $1',
        [username]
      );
      
      if (existingUser.rows.length > 0) {
        // Update existing user
        await client.query(
          `UPDATE users SET 
            password_hash = $2,
            role = $3,
            student_id = $4,
            enrollment_secret = $5,
            enrolled = $6,
            enrolled_at = $7
          WHERE username = $1`,
          [
            username,
            userData.passwordHash || userData.password,
            userData.role,
            userData.studentId,
            userData.enrollmentSecret,
            userData.enrolled,
            userData.enrolledAt ? new Date(userData.enrolledAt) : null
          ]
        );
      } else {
        // Insert new user
        await client.query(
          `INSERT INTO users (username, password_hash, role, student_id, enrollment_secret, enrolled, created_at, enrolled_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            username,
            userData.passwordHash || userData.password,
            userData.role,
            userData.studentId,
            userData.enrollmentSecret,
            userData.enrolled || false,
            userData.createdAt ? new Date(userData.createdAt) : new Date(),
            userData.enrolledAt ? new Date(userData.enrolledAt) : null
          ]
        );
      }
      
      // Handle identity if present
      if (userData.identity) {
        const identity = userData.identity;
        
        // Check if identity exists
        const existingIdentity = await client.query(
          'SELECT username FROM identities WHERE username = $1',
          [username]
        );
        
        if (existingIdentity.rows.length > 0) {
          // Update existing identity
          await client.query(
            `UPDATE identities SET
              type = $2,
              msp_id = $3,
              ou = $4,
              certificate = $5,
              private_key = $6,
              version = $7
            WHERE username = $1`,
            [
              username,
              identity.type || 'X.509',
              identity.mspId,
              identity.ou,
              identity.credentials.certificate,
              identity.credentials.privateKey,
              identity.version || 1
            ]
          );
        } else {
          // Insert new identity
          await client.query(
            `INSERT INTO identities (username, type, msp_id, ou, certificate, private_key, created_at, version)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              username,
              identity.type || 'X.509',
              identity.mspId,
              identity.ou,
              identity.credentials.certificate,
              identity.credentials.privateKey,
              identity.createdAt ? new Date(identity.createdAt) : new Date(),
              identity.version || 1
            ]
          );
        }
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving user:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if user exists
   * @param {string} username - Username
   * @returns {Promise<boolean>} True if user exists
   */
  async hasUser(username) {
    await this.initialize();
    
    try {
      const result = await db.query(
        'SELECT 1 FROM users WHERE username = $1',
        [username]
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking user existence:', error.message);
      throw error;
    }
  }

  /**
   * Delete user
   * @param {string} username - Username
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteUser(username) {
    await this.initialize();
    
    try {
      const result = await db.query(
        'DELETE FROM users WHERE username = $1',
        [username]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error deleting user:', error.message);
      throw error;
    }
  }

  /**
   * Get all users
   * @returns {Promise<Array>} Array of [username, userData] pairs
   */
  async getAllUsers() {
    await this.initialize();
    
    try {
      const result = await db.query(
        'SELECT username, password_hash as "passwordHash", role, student_id as "studentId", enrollment_secret as "enrollmentSecret", enrolled, created_at as "createdAt", enrolled_at as "enrolledAt" FROM users'
      );
      
      const users = [];
      
      for (const user of result.rows) {
        // Get identity if exists
        const identityResult = await db.query(
          'SELECT type, msp_id as "mspId", ou, certificate, private_key as "privateKey", created_at as "createdAt", version FROM identities WHERE username = $1',
          [user.username]
        );
        
        if (identityResult.rows.length > 0) {
          const identity = identityResult.rows[0];
          user.identity = {
            type: identity.type,
            mspId: identity.mspId,
            ou: identity.ou,
            credentials: {
              certificate: identity.certificate,
              privateKey: identity.privateKey
            },
            createdAt: identity.createdAt,
            version: identity.version
          };
        }
        
        users.push([user.username, user]);
      }
      
      return users;
    } catch (error) {
      console.error('Error getting all users:', error.message);
      throw error;
    }
  }

  /**
   * Clear all users (for testing)
   * @returns {Promise<void>}
   */
  async clear() {
    await this.initialize();
    
    try {
      await db.query('DELETE FROM users');
    } catch (error) {
      console.error('Error clearing users:', error.message);
      throw error;
    }
  }
}

// Singleton instance
let userStoreInstance = null;

/**
 * Get singleton instance of UserStore
 * @returns {UserStore} UserStore instance
 */
function getUserStore() {
  if (!userStoreInstance) {
    userStoreInstance = new UserStore();
  }
  return userStoreInstance;
}

/**
 * Reset singleton instance (for testing)
 */
function resetUserStore() {
  userStoreInstance = null;
}

module.exports = {
  UserStore,
  getUserStore,
  resetUserStore
};
