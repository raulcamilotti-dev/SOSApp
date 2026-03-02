/**
 * JWT Token Generation and Verification
 *
 * Implements HS256 (HMAC-SHA256) JWT signing and verification using jose library.
 * Tokens are issued with 24-hour expiration and include user/tenant context.
 *
 * @see REVISAO_GERAL_CODIGO.md - Procedure 2 (B1 - Structural)
 */

import { SignJWT, jwtVerify } from "jose";

/**
 * JWT Payload Structure
 *
 * Generated upon successful password verification.
 * Included in every authenticated request via Authorization header.
 */
export interface JwtPayload {
  /** User ID (UUID) — primary identity */
  sub: string;

  /** Tenant ID (UUID) — enables server-side tenant isolation */
  tenant_id: string;

  /** User role (string) — enables RBAC at worker (foundation for B7) */
  role: string;

  /** Issued at timestamp (Unix epoch) — JWT standard claim */
  iat?: number;

  /** Expiration timestamp (Unix epoch) — set to 24 hours from issuance */
  exp?: number;
}

/**
 * Token expiration duration (24 hours as per security audit)
 */
const EXPIRATION = "24h";

/**
 * Sign a JWT token with the given payload and secret
 *
 * @param payload - Partial JwtPayload (sub, tenant_id, role)
 * @param secret - Signing secret from env.JWT_SECRET (should be 32+ chars)
 * @returns Promise<string> - Signed JWT token (compact serialization)
 *
 * @example
 * const token = await signToken(
 *   { sub: "user-123", tenant_id: "tenant-456", role: "admin" },
 *   env.JWT_SECRET
 * );
 */
export async function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
): Promise<string> {
  try {
    // Convert secret string to UInt8Array for WebCrypto
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secret);

    // Sign the token with 24-hour expiration
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(EXPIRATION)
      .sign(secretBytes);

    return token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`JWT signing failed: ${message}`);
  }
}

/**
 * Verify a JWT token and extract the payload
 *
 * @param token - Compact JWT token (from Authorization header, without "Bearer " prefix)
 * @param secret - Verification secret from env.JWT_SECRET (must match signing secret)
 * @returns Promise<JwtPayload | null> - Decoded payload if valid, null if invalid/expired
 *
 * @example
 * const payload = await verifyToken(token, env.JWT_SECRET);
 * if (payload) {
 *   console.log(`Request from user ${payload.sub} in tenant ${payload.tenant_id}`);
 * }
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    // Convert secret string to UInt8Array for WebCrypto
    const encoder = new TextEncoder();
    const secretBytes = encoder.encode(secret);

    // Verify signature and expiration
    const verified = await jwtVerify<JwtPayload>(token, secretBytes);

    return verified.payload as JwtPayload;
  } catch {
    // Token is invalid, expired, or verification failed
    // Return null instead of throwing to allow fallback to API key
    return null;
  }
}
