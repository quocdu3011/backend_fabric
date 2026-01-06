/**
 * PostgreSQL Database Connection Pool
 * 
 * Provides connection pool management for PostgreSQL database
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
      ssl: dbConfig.ssl || { rejectUnauthorized: true }
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
      ssl: dbConfig.ssl
    };
    
    pool = new Pool(poolConfig);

    // Handle pool errors
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
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
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  const pool = getPool();
  
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.LOG_QUERIES === 'true') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    
    return res;
  } catch (error) {
    console.error('Database query error:', error.message);
    console.error('Query:', text);
    console.error('Params:', params);
    throw error;
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
