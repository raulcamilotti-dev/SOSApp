-- Migration: Password Reset Tokens
-- Purpose: Enable password reset functionality for all users
-- Created: 2026-03-01

-- Table for password reset tokens
-- Tokens expire after 24 hours
-- One token per user at a time (prevents token spam)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id) WHERE deleted_at IS NULL AND used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at) WHERE deleted_at IS NULL AND used_at IS NULL;
