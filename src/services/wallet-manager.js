/**
 * Wallet Manager for User Identity Management
 * 
 * This module manages user identities in PostgreSQL database for storing
 * X.509 certificates and private keys for user authentication with
 * Hyperledger Fabric network.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 1.3, 4.1
 */

const crypto = require('crypto');
const db = require('../database/db');

/**
 * WalletManager - Manages user identities in PostgreSQL database
 * 
 * Provides methods to store, retrieve, and manage X.509 identities
 * for users in the system.
 */
class WalletManager {
  /**
   * Create a new WalletManager instance
   */
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize wallet by checking database connection
   * @returns {Promise<void>}
   * @requirement 3.1
   */
  async getWallet() {
    if (!this.initialized) {
      try {
        // Check database connection
        const connected = await db.checkConnection();
        if (!connected) {
          throw new Error('Failed to connect to database');
        }
        
        console.log('Wallet manager initialized with PostgreSQL');
        this.initialized = true;
      } catch (error) {
        console.error('Error initializing wallet manager:', error.message);
        throw error;
      }
    }
    return 'database';
  }

  /**
   * Store user identity in wallet
   * @param {string} username - Identity label
   * @param {Object} identity - X509 identity {certificate, privateKey, mspId, ou}
   * @returns {Promise<void>}
   * @requirement 3.2
   */
  async putIdentity(username, identity) {
    await this.getWallet();
    
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }
    
    if (!identity || !identity.certificate || !identity.privateKey || !identity.mspId) {
      throw new Error('Identity must contain certificate, privateKey, and mspId');
    }

    try {
      // Check if identity already exists
      const existing = await db.query(
        'SELECT username FROM identities WHERE username = $1',
        [username]
      );
      
      if (existing.rows.length > 0) {
        // Update existing identity
        await db.query(
          `UPDATE identities SET
            type = $2,
            msp_id = $3,
            ou = $4,
            certificate = $5,
            private_key = $6,
            version = version + 1
          WHERE username = $1`,
          [
            username,
            'X.509',
            identity.mspId,
            identity.ou || null,
            identity.certificate,
            identity.privateKey
          ]
        );
      } else {
        // Insert new identity
        await db.query(
          `INSERT INTO identities (username, type, msp_id, ou, certificate, private_key, version)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            username,
            'X.509',
            identity.mspId,
            identity.ou || null,
            identity.certificate,
            identity.privateKey,
            1
          ]
        );
      }
    } catch (error) {
      console.error('Error storing identity:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve user identity from wallet
   * @param {string} username - Identity label
   * @returns {Promise<Object|null>} X509 identity or null if not found
   * @requirement 3.3
   */
  async getIdentity(username) {
    await this.getWallet();
    
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }

    try {
      const result = await db.query(
        'SELECT type, msp_id as "mspId", ou, certificate, private_key as "privateKey", created_at as "createdAt", version FROM identities WHERE username = $1',
        [username]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const identity = result.rows[0];
      
      return {
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
    } catch (error) {
      console.error('Error getting identity:', error.message);
      throw error;
    }
  }

  /**
   * Remove user identity from wallet
   * @param {string} username - Identity label
   * @returns {Promise<boolean>} True if removed, false if not found
   * @requirement 3.4
   */
  async removeIdentity(username) {
    await this.getWallet();
    
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }

    try {
      const result = await db.query(
        'DELETE FROM identities WHERE username = $1',
        [username]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('Error removing identity:', error.message);
      throw error;
    }
  }

  /**
   * List all identities in wallet
   * @returns {Promise<Array>} List of identity labels with metadata
   * @requirement 3.5
   */
  async listIdentities() {
    await this.getWallet();
    
    try {
      const result = await db.query(
        'SELECT username, type, msp_id as "mspId", ou, created_at as "createdAt", version FROM identities ORDER BY created_at DESC'
      );
      
      return result.rows.map(row => ({
        username: row.username,
        mspId: row.mspId,
        ou: row.ou,
        type: row.type,
        createdAt: row.createdAt,
        version: row.version
      }));
    } catch (error) {
      console.error('Error listing identities:', error.message);
      throw error;
    }
  }


  /**
   * Extract OU (Organizational Unit) attribute from identity
   * First tries to get from stored OU field, falls back to parsing certificate
   * @param {string|Object} certificateOrIdentity - PEM encoded certificate or identity object
   * @returns {string|null} OU value (admin, student, client) or null if not found
   * @requirement 1.3, 4.1
   */
  extractOU(certificateOrIdentity) {
    // If it's an identity object with OU field, return it directly
    if (typeof certificateOrIdentity === 'object' && certificateOrIdentity.ou) {
      return certificateOrIdentity.ou;
    }
    
    // Otherwise try to parse as certificate string
    const certificate = typeof certificateOrIdentity === 'string' 
      ? certificateOrIdentity 
      : certificateOrIdentity?.credentials?.certificate;
      
    if (!certificate || typeof certificate !== 'string') {
      return null;
    }

    try {
      // Use Node.js crypto.X509Certificate (supports EC keys)
      const x509 = new crypto.X509Certificate(certificate);
      const subject = x509.subject;
      
      // Extract OU using regex from subject string
      // Subject format: "CN=username, O=Org1MSP, OU=admin"
      const ouMatch = subject.match(/OU=([^,\n]+)/);
      if (ouMatch && ouMatch[1]) {
        return ouMatch[1].trim();
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing certificate for OU:', error.message);
      return null;
    }
  }

  /**
   * Extract MSP ID from X.509 certificate
   * The MSP ID is typically stored in the Organization (O) field
   * @param {string} certificate - PEM encoded certificate
   * @returns {string|null} MSP ID or null if not found
   * @requirement 4.1
   */
  extractMSPID(certificate) {
    if (!certificate || typeof certificate !== 'string') {
      return null;
    }

    try {
      // Use Node.js crypto.X509Certificate (supports EC keys)
      const x509 = new crypto.X509Certificate(certificate);
      const subject = x509.subject;
      
      // Extract O (Organization) using regex from subject string
      // Subject format: "CN=username, O=Org1MSP, OU=admin"
      const orgMatch = subject.match(/O=([^,\n]+)/);
      if (orgMatch && orgMatch[1]) {
        return orgMatch[1].trim();
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing certificate for MSP ID:', error.message);
      return null;
    }
  }

  /**
   * Extract all relevant attributes from X.509 certificate or identity
   * @param {string|Object} certificateOrIdentity - PEM encoded certificate or identity object
   * @returns {Object} Certificate attributes {ou, mspId, cn, validFrom, validTo}
   */
  extractCertificateInfo(certificateOrIdentity) {
    // If it's an identity object, extract OU from it
    const storedOu = typeof certificateOrIdentity === 'object' ? certificateOrIdentity.ou : null;
    
    const certificate = typeof certificateOrIdentity === 'string' 
      ? certificateOrIdentity 
      : certificateOrIdentity?.credentials?.certificate;
      
    if (!certificate || typeof certificate !== 'string') {
      return null;
    }

    try {
      // Use Node.js crypto.X509Certificate (supports EC keys)
      const x509 = new crypto.X509Certificate(certificate);
      const subject = x509.subject;
      
      // Extract CN using regex
      const cnMatch = subject.match(/CN=([^,\n]+)/);
      const cn = cnMatch && cnMatch[1] ? cnMatch[1].trim() : null;
      
      return {
        ou: storedOu || this.extractOU(certificate),
        mspId: this.extractMSPID(certificate),
        cn,
        validFrom: x509.validFrom,
        validTo: x509.validTo,
        serialNumber: x509.serialNumber
      };
    } catch (error) {
      console.error('Error parsing certificate:', error.message);
      return storedOu ? { ou: storedOu } : null;
    }
  }

  /**
   * Check if an identity exists in the wallet
   * @param {string} username - Identity label
   * @returns {Promise<boolean>} True if identity exists
   */
  async identityExists(username) {
    const identity = await this.getIdentity(username);
    return identity !== null;
  }
}

// Singleton instance
let walletManagerInstance = null;

/**
 * Get singleton instance of WalletManager
 * @returns {WalletManager} WalletManager instance
 */
function getWalletManager() {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}

/**
 * Reset singleton instance (for testing purposes)
 */
function resetWalletManager() {
  walletManagerInstance = null;
}

module.exports = {
  WalletManager,
  getWalletManager,
  resetWalletManager
};
