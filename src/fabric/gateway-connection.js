/**
 * Gateway Connection Manager for Hyperledger Fabric
 * 
 * This module manages the connection to Hyperledger Fabric Gateway using the
 * @hyperledger/fabric-gateway SDK. It implements the Singleton Pattern to ensure
 * only one connection instance exists throughout the application lifecycle.
 * 
 * Supports dynamic identity switching for authenticated users.
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */

const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs').promises;
const { getWalletManager } = require('../services/wallet-manager');
const forge = require('node-forge');

/**
 * Load certificate from file system
 * @param {string} certPath - Path to certificate file
 * @returns {Promise<Buffer>} Certificate content
 */
async function loadCertificate(certPath) {
  try {
    const certContent = await fs.readFile(certPath);
    return certContent;
  } catch (error) {
    throw new Error(`Failed to load certificate from ${certPath}: ${error.message}`);
  }
}

/**
 * Load private key from file system
 * @param {string} keyPath - Path to private key file
 * @returns {Promise<Buffer>} Private key content
 */
async function loadPrivateKey(keyPath) {
  try {
    const keyContent = await fs.readFile(keyPath);
    return keyContent;
  } catch (error) {
    throw new Error(`Failed to load private key from ${keyPath}: ${error.message}`);
  }
}

/**
 * Load TLS root certificate from file system
 * @param {string} tlsCertPath - Path to TLS root certificate file
 * @returns {Promise<Buffer>} TLS certificate content
 */
async function loadTlsRootCertificate(tlsCertPath) {
  try {
    const tlsCertContent = await fs.readFile(tlsCertPath);
    return tlsCertContent;
  } catch (error) {
    throw new Error(`Failed to load TLS certificate from ${tlsCertPath}: ${error.message}`);
  }
}

/**
 * Create Identity object with MSP ID and credentials
 * @param {string} mspId - Organization MSP ID
 * @param {Buffer} certificate - User certificate
 * @returns {Object} Identity object
 */
function createIdentity(mspId, certificate) {
  return {
    mspId: mspId,
    credentials: certificate
  };
}

/**
 * Create Signer object from private key
 * Supports both ECDSA and RSA private keys
 * @param {Buffer} privateKey - Private key content
 * @returns {Object} Signer object
 */
function createSigner(privateKey) {
  try {
    // Try to create private key object to determine type
    const keyObject = crypto.createPrivateKey(privateKey);
    const keyType = keyObject.asymmetricKeyType;
    
    // If it's ECDSA (ec), use the built-in signer
    if (keyType === 'ec') {
      return signers.newPrivateKeySigner(keyObject);
    }
    
    // If it's RSA, create custom signer
    if (keyType === 'rsa' || keyType === 'rsa-pss') {
      console.log('Using RSA key - creating custom signer');
      return createRSASigner(privateKey);
    }
    
    throw new Error(`Unsupported key type: ${keyType}`);
  } catch (error) {
    console.error('Error creating signer:', error.message);
    throw error;
  }
}

/**
 * Create custom signer for RSA private keys
 * @param {Buffer} privateKeyPem - RSA private key in PEM format
 * @returns {Object} Signer object compatible with Fabric Gateway
 */
function createRSASigner(privateKeyPem) {
  // Parse PEM to forge private key
  const privateKeyForge = forge.pki.privateKeyFromPem(privateKeyPem.toString());
  
  return async (digest) => {
    try {
      // Create message digest
      const md = forge.md.sha256.create();
      md.update(forge.util.binary.raw.encode(new Uint8Array(digest)));
      
      // Sign using RSA-SHA256
      const signature = privateKeyForge.sign(md);
      
      // Convert signature to Buffer
      return Buffer.from(signature, 'binary');
    } catch (error) {
      throw new Error(`Failed to sign with RSA key: ${error.message}`);
    }
  };
}

/**
 * Create gRPC client with TLS credentials
 * @param {string} peerEndpoint - Peer endpoint address (e.g., peer0.org1.example.com:7051)
 * @param {Buffer} tlsRootCert - TLS root certificate
 * @returns {Object} gRPC client instance
 */
function createGrpcClient(peerEndpoint, tlsRootCert) {
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials);
}

/**
 * Connect to Fabric Gateway
 * @param {Object} client - gRPC client instance
 * @param {Object} identity - Identity object with mspId and credentials
 * @param {Object} signer - Signer object
 * @returns {Promise<Object>} Gateway instance
 */
async function connectToGateway(client, identity, signer) {
  try {
    const gateway = await connect({
      client,
      identity,
      signer,
      // Don't specify hash - let SDK use default (crypto.createHash)
      // Specifying custom hash function causes issues with some Node.js versions
      evaluateOptions: () => {
        return { deadline: Date.now() + 5000 }; // 5 second timeout
      },
      endorseOptions: () => {
        return { deadline: Date.now() + 15000 }; // 15 second timeout
      },
      submitOptions: () => {
        return { deadline: Date.now() + 5000 }; // 5 second timeout
      },
      commitStatusOptions: () => {
        return { deadline: Date.now() + 60000 }; // 60 second timeout
      }
    });
    
    return gateway;
  } catch (error) {
    throw new Error(`Failed to connect to Fabric Gateway: ${error.message}`);
  }
}

/**
 * Gateway Connection Manager - Singleton Pattern
 * 
 * Manages a single Gateway connection instance throughout the application lifecycle.
 * This ensures efficient resource usage and prevents multiple unnecessary connections.
 * 
 * Supports dynamic identity switching for authenticated users.
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */
class GatewayConnectionManager {
  // Static instance property for Singleton Pattern
  static instance = null;

  constructor() {
    this.gateway = null;
    this.client = null;
    this.isConnected = false;
    // Cache for user-specific gateways to support concurrent requests
    // Key: username, Value: { gateway, lastUsed }
    this.userGateways = new Map();
  }

  /**
   * Get singleton instance of GatewayConnectionManager
   * Thread-safe implementation for concurrent access
   * @returns {Promise<GatewayConnectionManager>} Singleton instance
   */
  static async getInstance() {
    // If instance doesn't exist, create it
    if (!GatewayConnectionManager.instance) {
      GatewayConnectionManager.instance = new GatewayConnectionManager();
      await GatewayConnectionManager.instance.connect();
    }

    // Return existing instance
    return GatewayConnectionManager.instance;
  }

  /**
   * Establish connection to Fabric Gateway
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      console.log('Gateway already connected');
      return;
    }

    try {
      const config = require('../config/fabric-config');

      console.log(`Connecting to Fabric Gateway at ${config.PEER_ENDPOINT}...`);

      // Load certificates and keys
      const certificate = await loadCertificate(config.CERT_PATH);
      const privateKey = await loadPrivateKey(config.KEY_PATH);
      const tlsRootCert = await loadTlsRootCertificate(config.TLS_CERT_PATH);

      // Create identity and signer
      const identity = createIdentity(config.MSP_ID, certificate);
      const signer = createSigner(privateKey);

      // Create gRPC client with TLS
      this.client = createGrpcClient(config.PEER_ENDPOINT, tlsRootCert);

      // Connect to Gateway
      this.gateway = await connectToGateway(this.client, identity, signer);

      this.isConnected = true;
      console.log(`Successfully connected to Fabric Gateway at ${config.PEER_ENDPOINT}`);
    } catch (error) {
      console.error('Failed to connect to Fabric Gateway:', error.message);
      throw error;
    }
  }

  /**
   * Get contract instance for a specific channel and chaincode
   * @param {string} channelName - Channel name
   * @param {string} chaincodeName - Chaincode name
   * @returns {Object} Contract instance
   */
  getContract(channelName, chaincodeName) {
    if (!this.isConnected || !this.gateway) {
      throw new Error('Gateway is not connected. Call connect() first.');
    }

    try {
      const network = this.gateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName);
      return contract;
    } catch (error) {
      throw new Error(`Failed to get contract: ${error.message}`);
    }
  }

  /**
   * Disconnect from Fabric Gateway and clean up resources
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected && this.userGateways.size === 0) {
      console.log('Gateway is not connected');
      return;
    }

    try {
      console.log('Disconnecting from Fabric Gateway...');

      // Close all user gateway connections first
      await this.disconnectAllUserGateways();

      // Close main gateway connection
      if (this.gateway) {
        this.gateway.close();
        this.gateway = null;
      }

      // Close gRPC client
      if (this.client) {
        this.client.close();
        this.client = null;
      }

      this.isConnected = false;
      console.log('Successfully disconnected from Fabric Gateway');
    } catch (error) {
      console.error('Error during disconnect:', error.message);
      throw error;
    }
  }

  /**
   * Check if gateway is connected
   * @returns {boolean} Connection status
   */
  isGatewayConnected() {
    return this.isConnected;
  }

  /**
   * Connect to Fabric Gateway using a specific user's identity from wallet
   * 
   * This method loads the user's certificate and private key from the wallet
   * and creates a new gateway connection with that identity.
   * 
   * @param {string} username - Username to load identity for
   * @returns {Promise<Object>} Gateway instance for the user
   * @throws {Error} If user identity not found in wallet
   * @requirement 6.1, 6.2, 6.4
   */
  async connectWithUserIdentity(username) {
    if (!username) {
      throw new Error('Username is required for user identity connection');
    }

    // Check if we already have a gateway for this user
    const cachedGateway = this.userGateways.get(username);
    if (cachedGateway) {
      cachedGateway.lastUsed = Date.now();
      return cachedGateway.gateway;
    }

    try {
      const config = require('../config/fabric-config');
      const walletManager = getWalletManager();

      // Load user identity from wallet
      const identity = await walletManager.getIdentity(username);
      
      if (!identity) {
        const error = new Error(`Identity for user ${username} not found in wallet`);
        error.code = 'AUTH_IDENTITY_NOT_FOUND';
        throw error;
      }

      console.log(`Connecting to Fabric Gateway with identity for user ${username}...`);

      // Load TLS certificate for peer connection
      const tlsRootCert = await loadTlsRootCertificate(config.TLS_CERT_PATH);

      // Create identity and signer from wallet data
      const userIdentity = createIdentity(
        identity.mspId,
        Buffer.from(identity.credentials.certificate)
      );
      const userSigner = createSigner(
        Buffer.from(identity.credentials.privateKey)
      );

      // Create gRPC client with TLS
      const userClient = createGrpcClient(config.PEER_ENDPOINT, tlsRootCert);

      // Connect to Gateway with user identity
      const userGateway = await connectToGateway(userClient, userIdentity, userSigner);

      // Cache the gateway for this user
      this.userGateways.set(username, {
        gateway: userGateway,
        client: userClient,
        lastUsed: Date.now()
      });

      console.log(`Successfully connected to Fabric Gateway with identity for user ${username}`);

      return userGateway;

    } catch (error) {
      console.error(`Failed to connect with user identity ${username}:`, error.message);
      throw error;
    }
  }

  /**
   * Get contract instance using a specific user's identity
   * 
   * This method ensures that chaincode operations are performed with the
   * authenticated user's identity, allowing chaincode to verify the caller's
   * MSP ID and OU attributes via ctx.clientIdentity.
   * 
   * @param {string} channelName - Channel name
   * @param {string} chaincodeName - Chaincode name
   * @param {string} username - Username to use for identity (optional, uses default if not provided)
   * @returns {Promise<Object>} Contract instance
   * @throws {Error} If user identity not found or connection fails
   * @requirement 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async getContractWithUserIdentity(channelName, chaincodeName, username) {
    if (!username) {
      // Fall back to default admin identity
      return this.getContract(channelName, chaincodeName);
    }

    try {
      // Get or create gateway for this user
      const userGateway = await this.connectWithUserIdentity(username);

      // Get network and contract
      const network = userGateway.getNetwork(channelName);
      const contract = network.getContract(chaincodeName);

      return contract;

    } catch (error) {
      console.error(`Failed to get contract for user ${username}:`, error.message);
      throw error;
    }
  }

  /**
   * Disconnect a specific user's gateway connection
   * 
   * @param {string} username - Username to disconnect
   * @returns {Promise<void>}
   */
  async disconnectUserGateway(username) {
    const cached = this.userGateways.get(username);
    if (cached) {
      try {
        if (cached.gateway) {
          cached.gateway.close();
        }
        if (cached.client) {
          cached.client.close();
        }
        this.userGateways.delete(username);
        console.log(`Disconnected gateway for user ${username}`);
      } catch (error) {
        console.error(`Error disconnecting gateway for user ${username}:`, error.message);
      }
    }
  }

  /**
   * Disconnect all user gateways
   * 
   * @returns {Promise<void>}
   */
  async disconnectAllUserGateways() {
    for (const [username] of this.userGateways) {
      await this.disconnectUserGateway(username);
    }
  }

  /**
   * Clean up stale user gateway connections
   * Removes connections that haven't been used for more than maxAge milliseconds
   * 
   * @param {number} maxAge - Maximum age in milliseconds (default: 30 minutes)
   * @returns {Promise<number>} Number of connections cleaned up
   */
  async cleanupStaleConnections(maxAge = 30 * 60 * 1000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [username, cached] of this.userGateways) {
      if (now - cached.lastUsed > maxAge) {
        await this.disconnectUserGateway(username);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} stale gateway connections`);
    }

    return cleanedCount;
  }
}

module.exports = {
  GatewayConnectionManager,
  // Export helper functions for testing purposes
  loadCertificate,
  loadPrivateKey,
  loadTlsRootCertificate,
  createIdentity,
  createSigner,
  createGrpcClient,
  connectToGateway
};
