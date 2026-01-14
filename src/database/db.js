/**
 * PostgreSQL Database Connection Pool
 * 
 * Provides connection pool management for PostgreSQL database
 * Optimized for serverless databases like Neon
 */

const { Pool } = require('pg');
const config = require('../config/database-config');

let pool = null;

/**
 * Get or create PostgreSQL connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    const dbConfig = config.postgres;
    
    // Use connection string if available (for cloud databases)
    const poolConfig = dbConfig.connectionString ? {
      connectionString: dbConfig.connectionString,
      max: dbConfig.pool.max,
      min: dbConfig.pool.min,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      query_timeout: dbConfig.query_timeout,
      statement_timeout: dbConfig.statement_timeout,
      ssl: dbConfig.ssl || { rejectUnauthorized: false },
      // Keep connections alive for serverless databases
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    } : {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: dbConfig.pool.max,
      min: dbConfig.pool.min,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      query_timeout: dbConfig.query_timeout,
      statement_timeout: dbConfig.statement_timeout,
      ssl: dbConfig.ssl,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    };
    
    pool = new Pool(poolConfig);

    // Handle pool errors - don't exit process, just recreate pool
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client:', err.message);
      // Mark pool as null to force recreation on next query
      pool = null;
    });

    // Handle pool connection
    pool.on('connect', (client) => {
      console.log('New client connected to PostgreSQL');
    });

    // Handle pool removal
    pool.on('remove', (client) => {
      console.log('Client removed from pool');
    });

    const connectionInfo = dbConfig.connectionString 
      ? 'Cloud Database (connection string)' 
      : `${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
    console.log(`PostgreSQL pool created: ${connectionInfo}`);
  }

  return pool;
}

/**
 * Execute a query with parameters
 * Includes automatic retry for connection errors
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  let currentPool = getPool();
  let retries = 2;
  
  while (retries > 0) {
    try {
      const res = await currentPool.query(text, params);
      const duration = Date.now() - start;
      
      if (process.env.LOG_QUERIES === 'true') {
        console.log('Executed query', { text, duration, rows: res.rowCount });
      }
      
      return res;
    } catch (error) {
      // Check if it's a connection error that might be recoverable
      if (error.message.includes('Connection terminated') || 
          error.message.includes('connection refused') ||
          error.message.includes('timeout') ||
          error.code === 'ECONNRESET') {
        retries--;
        console.warn(`Database connection error, retrying... (${retries} retries left)`);
        
        // Force pool recreation
        pool = null;
        currentPool = getPool();
        
        if (retries === 0) {
          console.error('Database query failed after retries:', error.message);
          throw error;
        }
        
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Non-connection error, throw immediately
        console.error('Database query error:', error.message);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
      }
    }
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<PoolClient>} Database client
 */
async function getClient() {
  const pool = getPool();
  return await pool.connect();
}

/**
 * Close the connection pool
 * @returns {Promise<void>}
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('PostgreSQL pool closed');
  }
}

/**
 * Check database connection
 * @returns {Promise<boolean>} True if connected
 */
async function checkConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

/**
 * Initialize database schema
 * @returns {Promise<void>}
 */
async function initializeSchema() {
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    await query(schema);
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error.message);
    throw error;
  }
}

module.exports = {
  getPool,
  query,
  getClient,
  close,
  checkConnection,
  initializeSchema
};
