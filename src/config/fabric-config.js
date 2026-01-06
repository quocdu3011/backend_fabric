/**
 * Fabric Configuration Module
 * 
 * Loads and validates configuration from environment variables
 * for connecting to Hyperledger Fabric network.
 */

require('dotenv').config();

/**
 * Validate that required configuration values are present
 * @param {Object} config - Configuration object
 * @throws {Error} If required configuration is missing
 */
function validateConfig(config) {
  const requiredFields = [
    'PEER_ENDPOINT',
    'MSP_ID',
    'CHANNEL_NAME',
    'CHAINCODE_NAME',
    'CERT_PATH',
    'KEY_PATH',
    'TLS_CERT_PATH'
  ];

  const missingFields = requiredFields.filter(field => !config[field]);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required configuration: ${missingFields.join(', ')}. ` +
      `Please check your .env file or environment variables.`
    );
  }
}

/**
 * Load configuration from environment variables
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const config = {
    // Fabric Network Configuration
    PEER_ENDPOINT: process.env.PEER_ENDPOINT,
    MSP_ID: process.env.MSP_ID,
    CHANNEL_NAME: process.env.CHANNEL_NAME,
    CHAINCODE_NAME: process.env.CHAINCODE_NAME,

    // Certificate Paths
    CERT_PATH: process.env.CERT_PATH,
    KEY_PATH: process.env.KEY_PATH,
    TLS_CERT_PATH: process.env.TLS_CERT_PATH,

    // Server Configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

// Export configuration object
module.exports = loadConfig();
