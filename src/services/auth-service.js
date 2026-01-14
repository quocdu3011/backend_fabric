/**
 * Auth Service for User Authentication & Authorization
 * 
 * This module handles user registration, enrollment, login, logout,
 * and profile management. It integrates with WalletManager for
 * identity storage and uses JWT for session management.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 7.5, 8.1
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const { getWalletManager } = require('./wallet-manager');
const { getUserStore } = require('./user-store');
const authConfig = require('../config/auth-config');

// Persistent user store (file-based)
const userStore = getUserStore();

// Token blacklist for logout functionality (in-memory, will be lost on restart)
// In production, use Redis or database for token blacklist
const tokenBlacklist = new Set();

// Default admin credentials (should be configured via environment in production)
const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'adminpw'
};

/**
 * AuthService - Handles user authentication operations
 * 
 * Provides methods for user registration, enrollment, login,
 * logout, and profile management.
 * 
 * @requirement 8.1 - Password hashing with bcrypt
 */
class AuthService {
  constructor() {
    this.walletManager = getWalletManager();
    this.jwtSecret = authConfig.jwt.secret;
    this.jwtExpiresIn = authConfig.jwt.expiresIn;
    this.saltRounds = authConfig.bcrypt.saltRounds;
    
    // Initialize Fabric CA client
    this.ca = new FabricCAServices(
      'https://localhost:7054',
      { trustedRoots: '', verify: false },
      'ca-org1'
    );
  }

  /**
   * Get user from store
   * @param {string} username - Username
   * @returns {Promise<Object|null>} User record or null
   * @private
   */
  async _getUser(username) {
    return await userStore.getUser(username);
  }

  /**
   * Get user profile
   * @param {string} username - Username
   * @returns {Promise<Object|null>} User profile
   */
  async getUserProfile(username) {
    const user = await this._getUser(username);
    if (!user) return null;
    
    // Return safe user object (no password hash or secrets)
    return {
      username: user.username,
      role: user.role,
      studentId: user.studentId || user.username, // Return studentId if exists
      enrolled: user.enrolled,
      createdAt: user.createdAt,
      enrolledAt: user.enrolledAt
    };
  }

  /**
   * Save user to store
   * @param {string} username - Username
   * @param {Object} userData - User data to store
   * @returns {Promise<void>}
   * @private
   */
  async _saveUser(username, userData) {
    await userStore.setUser(username, userData);
  }

  /**
   * Check if user exists
   * @param {string} username - Username
   * @returns {Promise<boolean>} True if user exists
   * @private
   */
  async _userExists(username) {
    return await userStore.hasUser(username);
  }

  /**
   * Generate enrollment secret
   * @returns {string} Random enrollment secret
   * @private
   */
  _generateEnrollmentSecret() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Validate admin credentials
   * @param {string} adminUsername - Admin username
   * @param {string} adminPassword - Admin password
   * @returns {Promise<boolean>} True if valid admin
   * @private
   */
  async _validateAdmin(adminUsername, adminPassword) {
    // Check against default admin or registered admin users
    if (adminUsername === DEFAULT_ADMIN.username && adminPassword === DEFAULT_ADMIN.password) {
      return true;
    }
    
    // Check if user is a registered admin
    const user = await this._getUser(adminUsername);
    if (user && user.role === 'admin' && user.enrolled) {
      // For registered admins, we need to verify password
      return bcrypt.compareSync(adminPassword, user.passwordHash);
    }
    
    return false;
  }

  /**
   * Import admin identity from file system (using .env paths)
   * This is required when running with Test Network to use the pre-generated admin identity
   * instead of enrolling a new one (which requires Fabric CA Client).
   * @returns {Promise<Object>} Result
   */
  async importAdminIdentity() {
    const fs = require('fs').promises;
    
    const certPath = process.env.CERT_PATH;
    const keyPath = process.env.KEY_PATH;
    const mspId = process.env.MSP_ID || 'Org1MSP';
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    if (!certPath || !keyPath) {
      throw new Error('CERT_PATH and KEY_PATH must be defined in .env');
    }

    try {
      // Read certificate and key files
      const certificate = await fs.readFile(certPath, 'utf8');
      const privateKey = await fs.readFile(keyPath, 'utf8');

      // Create identity object
      const identity = {
        certificate,
        privateKey,
        mspId,
        ou: 'admin'
      };

      // Store in wallet
      await this.walletManager.putIdentity(adminUsername, identity);
      
      // Update user store to ensure admin user exists and is marked as enrolled
      // This allows login to work correctly
      const adminPassword = process.env.ADMIN_PASSWORD || 'adminpw';
      const passwordHash = await bcrypt.hash(adminPassword, this.saltRounds);
      
      const userRecord = {
        username: adminUsername,
        passwordHash,
        role: 'admin',
        enrollmentSecret: 'imported-from-file',
        enrolled: true,
        enrolledAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      await this._saveUser(adminUsername, userRecord);

      return {
        success: true,
        username: adminUsername,
        mspId,
        message: 'Admin identity imported successfully from file system'
      };
    } catch (error) {
      console.error('Error importing admin identity:', error);
      throw new Error(`Failed to import admin identity: ${error.message}`);
    }
  }

  /**
   * Register a new user
   * @param {string} adminUsername - Admin username for registration
   * @param {string} adminPassword - Admin password
   * @param {Object} userData - New user data {username, password, role}
   * @returns {Promise<Object>} Enrollment credentials {enrollmentId, enrollmentSecret}
   * @throws {Error} If admin credentials invalid or user already exists
   * @requirement 1.1, 1.2, 8.1
   */
  async registerUser(adminUsername, adminPassword, userData) {
    // Validate admin credentials
    if (!(await this._validateAdmin(adminUsername, adminPassword))) {
      throw new Error('Invalid admin credentials');
    }

    const { username, password, role, studentId } = userData;

    // Validate required fields
    if (!username || !password || !role) {
      throw new Error('Username, password, and role are required');
    }

    // Validate role
    const validRoles = ['admin', 'student', 'client'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check if user already exists
    if (await this._userExists(username)) {
      const error = new Error('User already exists');
      error.code = 'AUTH_USER_EXISTS';
      throw error;
    }

    // Hash password with bcrypt (salt rounds = 10)
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Generate enrollment secret
    const enrollmentSecret = this._generateEnrollmentSecret();

    // Determine OU based on role
    // Admin -> OU=admin, Student -> OU=student
    const ou = role === 'admin' ? 'admin' : 'student';

    // Register user with Fabric CA
    try {
      console.log(`Registering ${username} with Fabric CA (role=${role}, OU=${ou})...`);
      
      // Load admin identity from wallet using fabric-network Wallets API
      const wallet = await Wallets.newFileSystemWallet(authConfig.wallet.path);
      
      // Try multiple admin identities (caadmin, admin, adminorg1, etc.)
      const adminNames = ['admin', 'caadmin-org1msp', 'adminorg1', 'caadmin'];
      let adminIdentity = null;
      let adminName = null;
      
      for (const name of adminNames) {
        adminIdentity = await wallet.get(name);
        if (adminIdentity) {
          adminName = name;
          break;
        }
      }
      
      if (!adminIdentity) {
        throw new Error('Admin identity not found. Please run: node setup-admin.js');
      }

      console.log(`Using admin identity: ${adminName}`);

      // Get admin User context from wallet provider
      const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
      const adminUser = await provider.getUserContext(adminIdentity, adminName);

      // Determine type for CA registration
      // Type 'admin' for admin users, 'client' for students (CA type)
      const caType = role === 'admin' ? 'admin' : 'client';

      // Register with CA using proper User instance
      // Attributes include role for chaincode authorization
      await this.ca.register(
        {
          enrollmentID: username,
          enrollmentSecret: enrollmentSecret,
          role: caType, // CA type: admin or client
          affiliation: 'org1.department1',
          attrs: [
            { name: 'role', value: role, ecert: true }, // Application role
            { name: 'ou', value: ou, ecert: true }, // OU for chaincode checks
            { name: 'studentId', value: studentId || username, ecert: true },
            // Admin-specific attributes
            ...(role === 'admin' ? [
              { name: 'admin', value: 'true', ecert: true },
              { name: 'hf.Registrar.Roles', value: 'client', ecert: true }
            ] : [])
          ]
        },
        adminUser
      );
      
      console.log(`✓ Registered ${username} with CA`);
    } catch (error) {
      // If already registered, continue
      if (error.message && error.message.includes('is already registered')) {
        console.log(`⚠ ${username} already registered with CA`);
      } else {
        console.error(`Failed to register ${username} with CA:`, error.message);
        // Continue anyway - enrollment might still work
      }
    }

    // Create user record with OU mapping
    const userRecord = {
      username,
      passwordHash,
      role, // Application role: admin, student, client
      ou,   // Certificate OU: admin or client
      studentId: studentId || username, // Use provided studentId or fallback to username
      enrollmentSecret,
      enrolled: false,
      createdAt: new Date().toISOString()
    };

    // Save user to store
    await this._saveUser(username, userRecord);

    // Return enrollment credentials for manual enrollment
    return {
      enrollmentId: username,
      enrollmentSecret,
      enrolled: false,
      message: 'User registered successfully. Use enrollment credentials to enroll.'
    };
  }

  /**
   * Generate a self-signed X.509 certificate with OU attribute using EC keys
   * Uses Node.js crypto to create a proper X.509 certificate
   * @param {string} username - Username (CN)
   * @param {string} role - User role (OU)
   * @param {string} mspId - MSP ID (O)
   * @returns {Object} {certificate, privateKey}
   * @private
   */
  _generateMockCertificate(username, role, mspId = 'Org1MSP') {
    // Generate EC key pair with self-signed certificate
    // Node.js v15.6+ supports generating certificates directly
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1', // Same as P-256, OpenSSL name
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // Create certificate using subprocess (requires openssl)
    // For mock/testing, we'll create a minimal certificate structure
    const { execSync } = require('child_process');
    
    try {
      // Try to use openssl if available
      const tempKeyFile = `temp_key_${Date.now()}.pem`;
      const tempCertFile = `temp_cert_${Date.now()}.pem`;
      const fs = require('fs');
      
      // Write private key to temp file
      fs.writeFileSync(tempKeyFile, privateKey);
      
      // Generate certificate with openssl
      const subject = `/CN=${username}/O=${mspId}/OU=${role}`;
      execSync(
        `openssl req -new -x509 -key ${tempKeyFile} -out ${tempCertFile} -days 365 -subj "${subject}"`,
        { stdio: 'pipe' }
      );
      
      // Read certificate
      const certificate = fs.readFileSync(tempCertFile, 'utf8');
      
      // Clean up temp files
      fs.unlinkSync(tempKeyFile);
      fs.unlinkSync(tempCertFile);
      
      return { certificate, privateKey };
    } catch (error) {
      // If openssl not available, create a simple mock certificate
      // This is a fallback for testing environments
      const certificate = this._createSimpleMockCert(username, role, mspId, publicKey);
      return { certificate, privateKey };
    }
  }

  /**
   * Create a simple mock certificate (fallback when openssl not available)
   * @param {string} username - Username
   * @param {string} role - Role
   * @param {string} mspId - MSP ID
   * @param {string} publicKey - Public key PEM
   * @returns {string} Mock certificate PEM
   * @private
   */
  _createSimpleMockCert(username, role, mspId, publicKey) {
    // Create a minimal certificate structure for testing
    // This won't be cryptographically valid but will contain the right metadata
    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setFullYear(notBefore.getFullYear() + 1);
    
    const certData = {
      subject: `CN=${username}, O=${mspId}, OU=${role}`,
      issuer: `CN=${username}, O=${mspId}, OU=${role}`,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      serialNumber: crypto.randomBytes(8).toString('hex'),
      publicKey: publicKey.replace(/\n/g, '\\n')
    };
    
    // Encode as base64
    const certBody = Buffer.from(JSON.stringify(certData)).toString('base64');
    
    return [
      '-----BEGIN CERTIFICATE-----',
      certBody,
      '-----END CERTIFICATE-----'
    ].join('\n');
  }


  /**
   * Enroll a user and store identity in wallet
   * @param {string} username - Username
   * @param {string} enrollmentSecret - Secret from registration
   * @returns {Promise<Object>} User identity info
   * @throws {Error} If enrollment secret invalid or user not found
   * @requirement 1.3, 1.4
   */
  async enrollUser(username, enrollmentSecret) {
    // Get user record
    const user = await this._getUser(username);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Verify enrollment secret
    if (user.enrollmentSecret !== enrollmentSecret) {
      throw new Error('Invalid enrollment secret');
    }

    // Check if already enrolled
    if (user.enrolled) {
      throw new Error('User already enrolled');
    }

    try {
      // Enroll with Fabric CA to get real certificate
      console.log(`Enrolling ${username} with Fabric CA...`);
      const enrollment = await this.ca.enroll({
        enrollmentID: username,
        enrollmentSecret: enrollmentSecret
      });

      console.log(`✓ Successfully enrolled ${username} from CA`);

      const certificate = enrollment.certificate;
      const privateKey = enrollment.key.toBytes();

      // Create identity object with OU attribute
      // OU mapping: admin -> 'admin', student -> 'student'
      const ou = user.ou || (user.role === 'admin' ? 'admin' : 'student');
      
      const identity = {
        certificate,
        privateKey,
        mspId: 'Org1MSP',
        ou // Store mapped OU for chaincode authorization
      };

      // Store identity in wallet
      await this.walletManager.putIdentity(username, identity);

      // Create identity object for user-store (same format as admin)
      const identityForStore = {
        type: 'X.509',
        mspId: 'Org1MSP',
        ou, // Mapped OU: admin or client
        credentials: {
          certificate,
          privateKey
        },
        createdAt: new Date().toISOString()
      };

      // Update user record with identity
      user.enrolled = true;
      user.enrolledAt = new Date().toISOString();
      user.identity = identityForStore;
      await this._saveUser(username, user);

      console.log(`✓ Updated ${username} user record with CA certificate`);

      return {
        success: true,
        username,
        mspId: 'Org1MSP',
        ou: user.role,
        enrolledAt: user.enrolledAt,
        message: 'User enrolled successfully with Fabric CA'
      };
    } catch (error) {
      console.error(`Error enrolling ${username} with CA:`, error);
      throw new Error(`Failed to enroll with Fabric CA: ${error.message}`);
    }
  }

  /**
   * Authenticate user and generate JWT token
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} {token, user}
   * @throws {Error} If credentials invalid or user not enrolled
   * @requirement 2.1, 2.2, 2.3
   */
  async login(username, password) {
    // Get user record
    const user = await this._getUser(username);
    
    if (!user) {
      const error = new Error('Invalid credentials');
      error.code = 'AUTH_INVALID_CREDENTIALS';
      throw error;
    }

    // Support both 'password' and 'passwordHash' field names for backward compatibility
    const storedHash = user.passwordHash || user.password;
    
    if (!storedHash) {
      const error = new Error('User password not found in store');
      error.code = 'AUTH_INVALID_USER_DATA';
      throw error;
    }

    // Verify password with bcrypt
    const passwordValid = await bcrypt.compare(password, storedHash);
    
    if (!passwordValid) {
      const error = new Error('Invalid credentials');
      error.code = 'AUTH_INVALID_CREDENTIALS';
      throw error;
    }

    // Check if user is enrolled
    if (!user.enrolled) {
      const error = new Error('User not enrolled. Please enroll first.');
      error.code = 'AUTH_NOT_ENROLLED';
      throw error;
    }

    // Load identity from wallet
    const identity = await this.walletManager.getIdentity(username);
    
    if (!identity) {
      const error = new Error('Identity not found in wallet');
      error.code = 'AUTH_IDENTITY_NOT_FOUND';
      throw error;
    }

    // Get OU from stored identity (no need to parse certificate)
    const ou = identity.ou || this.walletManager.extractOU(identity.credentials.certificate);

    // Generate JWT access token with user identity information
    const tokenPayload = {
      username,
      mspId: identity.mspId,
      ou
    };

    const accessToken = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      algorithm: authConfig.jwt.algorithm
    });

    // Generate refresh token (longer expiry)
    const refreshToken = jwt.sign(
      { username, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: '7d', algorithm: authConfig.jwt.algorithm }
    );

    return {
      success: true,
      accessToken,
      refreshToken,
      user: {
        username,
        mspId: identity.mspId,
        ou,
        enrolledAt: user.enrolledAt
      }
    };
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   * @throws {Error} If refresh token invalid or expired
   */
  async refreshToken(refreshToken) {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, this.jwtSecret, {
      algorithms: [authConfig.jwt.algorithm]
    });

    // Check if it's a refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token type');
    }

    const username = decoded.username;

    // Get user record
    const user = await this._getUser(username);
    if (!user) {
      throw new Error('User not found');
    }

    // Load identity from wallet
    const identity = await this.walletManager.getIdentity(username);
    if (!identity) {
      throw new Error('Identity not found');
    }

    // Get OU from stored identity
    const ou = identity.ou || this.walletManager.extractOU(identity.credentials.certificate);

    // Generate new access token
    const tokenPayload = {
      username,
      mspId: identity.mspId,
      ou
    };

    const newAccessToken = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      algorithm: authConfig.jwt.algorithm
    });

    // Generate new refresh token
    const newRefreshToken = jwt.sign(
      { username, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: '7d', algorithm: authConfig.jwt.algorithm }
    );

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  /**
   * Invalidate user session by adding token to blacklist
   * @param {string} token - JWT token to invalidate
   * @returns {Promise<Object>} Logout result
   * @requirement 2.5
   */
  async logout(token) {
    if (!token) {
      throw new Error('Token is required');
    }

    // Add token to blacklist
    tokenBlacklist.add(token);

    return {
      success: true,
      message: 'Logged out successfully'
    };
  }

  /**
   * Check if a token is blacklisted
   * @param {string} token - JWT token to check
   * @returns {boolean} True if token is blacklisted
   */
  isTokenBlacklisted(token) {
    return tokenBlacklist.has(token);
  }

  /**
   * Get user profile from wallet
   * @param {string} username - Username
   * @returns {Promise<Object>} User profile with certificate info
   * @throws {Error} If user not found
   * @requirement 7.5
   */
  async getProfile(username) {
    // Get user record
    const user = await this._getUser(username);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Get identity from wallet
    const identity = await this.walletManager.getIdentity(username);
    
    if (!identity) {
      return {
        username,
        role: user.role,
        enrolled: false,
        createdAt: user.createdAt
      };
    }

    // Extract certificate info (pass full identity to get stored OU)
    const certInfo = this.walletManager.extractCertificateInfo(identity);

    return {
      username,
      role: user.role,
      enrolled: user.enrolled,
      mspId: identity.mspId,
      ou: identity.ou || certInfo?.ou,
      certificateInfo: {
        cn: certInfo?.cn,
        validFrom: certInfo?.validFrom,
        validTo: certInfo?.validTo,
        serialNumber: certInfo?.serialNumber
      },
      createdAt: user.createdAt,
      enrolledAt: user.enrolledAt
    };
  }

  /**
   * Verify a JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   * @throws {Error} If token is invalid or expired
   */
  verifyToken(token) {
    if (!token) {
      const error = new Error('No token provided');
      error.code = 'AUTH_NO_TOKEN';
      throw error;
    }

    // Check if token is blacklisted
    if (this.isTokenBlacklisted(token)) {
      const error = new Error('Token has been invalidated');
      error.code = 'AUTH_TOKEN_INVALID';
      throw error;
    }

    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: [authConfig.jwt.algorithm]
      });
      return decoded;
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        const error = new Error('Token expired');
        error.code = 'AUTH_TOKEN_EXPIRED';
        throw error;
      }
      const error = new Error('Invalid token');
      error.code = 'AUTH_TOKEN_INVALID';
      throw error;
    }
  }

  /**
   * Delete a user (admin only)
   * @param {string} adminUsername - Admin username
   * @param {string} adminPassword - Admin password
   * @param {string} targetUsername - Username to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteUser(adminUsername, adminPassword, targetUsername) {
    // Validate admin credentials
    if (!(await this._validateAdmin(adminUsername, adminPassword))) {
      throw new Error('Invalid admin credentials');
    }

    // Check if user exists
    if (!(await this._userExists(targetUsername))) {
      throw new Error('User not found');
    }

    // Remove identity from wallet
    await this.walletManager.removeIdentity(targetUsername);

    // Remove user from store
    await userStore.deleteUser(targetUsername);

    return {
      success: true,
      message: `User ${targetUsername} deleted successfully`
    };
  }

  /**
   * List all users (admin only)
   * @param {string} adminUsername - Admin username
   * @param {string} adminPassword - Admin password
   * @returns {Promise<Array>} List of users
   */
  async listUsers(adminUsername, adminPassword) {
    // Validate admin credentials
    if (!(await this._validateAdmin(adminUsername, adminPassword))) {
      throw new Error('Invalid admin credentials');
    }

    const allUsers = await userStore.getAllUsers();
    const users = [];
    
    for (const [username, user] of allUsers) {
      users.push({
        username,
        role: user.role,
        enrolled: user.enrolled,
        createdAt: user.createdAt,
        enrolledAt: user.enrolledAt
      });
    }

    return users;
  }

  /**
   * Enroll user with Fabric CA
   * Registers user with CA (using admin) and enrolls to get certificate
   * @param {string} username - Username to enroll
   * @param {string} enrollmentSecret - Enrollment secret/password
   * @param {string} role - User role (admin, student, client)
   * @returns {Promise<void>}
   * @private
   */

}

// Singleton instance
let authServiceInstance = null;

/**
 * Get singleton instance of AuthService
 * @returns {AuthService} AuthService instance
 */
function getAuthService() {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

/**
 * Reset singleton instance and clear stores (for testing purposes)
 */
async function resetAuthService() {
  authServiceInstance = null;
  await userStore.clear();
  tokenBlacklist.clear();
}

/**
 * Get token blacklist (for testing purposes)
 * @returns {Set} Token blacklist
 */
function getTokenBlacklist() {
  return tokenBlacklist;
}

/**
 * Get user store (for testing purposes)
 * @returns {UserStore} User store instance
 */
function getUserStoreInstance() {
  return userStore;
}

module.exports = {
  AuthService,
  getAuthService,
  resetAuthService,
  getTokenBlacklist,
  getUserStore: getUserStoreInstance
};
