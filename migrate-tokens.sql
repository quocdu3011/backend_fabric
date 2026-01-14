-- Migration: Add refresh_tokens and token_blacklist tables
-- Execute this manually in your PostgreSQL database

-- =============================================================================
-- TABLE: refresh_tokens
-- Stores refresh tokens for JWT rotation
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    device_info VARCHAR(500),
    ip_address VARCHAR(50),
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason VARCHAR(255),
    
    -- Index for token lookup
    CONSTRAINT idx_refresh_tokens_token_hash UNIQUE (token_hash)
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_username ON refresh_tokens(username);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Index for active tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(username, is_revoked, expires_at) 
    WHERE is_revoked = FALSE;

COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for JWT rotation and session management';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA256 hash of the refresh token (never store plaintext)';
COMMENT ON COLUMN refresh_tokens.device_info IS 'Optional device fingerprint for security';

-- =============================================================================
-- TABLE: token_blacklist
-- Stores revoked/invalidated access tokens (for logout)
-- =============================================================================
CREATE TABLE IF NOT EXISTS token_blacklist (
    id SERIAL PRIMARY KEY,
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255),
    
    -- Index for JTI lookup (most common query)
    CONSTRAINT idx_token_blacklist_jti UNIQUE (token_jti)
);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires_at ON token_blacklist(expires_at);

COMMENT ON TABLE token_blacklist IS 'Stores revoked JWT tokens to prevent replay attacks';
COMMENT ON COLUMN token_blacklist.token_jti IS 'JWT ID (jti claim) - unique identifier for each token';
