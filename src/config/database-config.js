/**
 * PostgreSQL Database Configuration
 * 
 * Supports both connection string (DATABASE_URL) and individual parameters.
 * CONNECTION_STRING is preferred for cloud databases like Neon, Supabase, etc.
 */

require('dotenv').config();

module.exports = {
  // PostgreSQL connection configuration
  postgres: {
    // Connection string (for cloud databases like Neon)
    // If DATABASE_URL is set, it will override individual parameters
    connectionString: process.env.DATABASE_URL,
    
    // Individual connection parameters (fallback if DATABASE_URL not set)
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'degree_system',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    
    // Connection pool settings
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
      evict: parseInt(process.env.DB_POOL_EVICT || '1000', 10)
    },
    
    // SSL settings (required for cloud databases like Neon)
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    } : false,
    
    // Query timeout
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
    
    // Statement timeout
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
    
    // Connection timeout (increased for cloud databases)
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
    
    // Idle timeout
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10)
  }
};
