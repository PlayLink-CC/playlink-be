/**
 * Authentication Utilities
 *
 * High-performance JWT token creation and verification using fast-jwt library.
 * Handles token signing and validation for user authentication.
 *
 * Configuration:
 * - Algorithm: HS256 (HMAC SHA-256)
 * - Expiration: 2 hours
 * - Secret: From JWT_SECRET environment variable
 *
 * Environment Variables:
 * - JWT_SECRET: Secret key for token signing (required in production)
 *
 * @module utils/authUtil
 */

import { createSigner, createVerifier } from "fast-jwt";

/**
 * JWT secret key from environment or development default
 * @type {string}
 */
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-me";

/**
 * Token expiration time
 * @type {string}
 */
const JWT_EXPIRES_IN = "2h";

/**
 * JWT signer instance (created once for performance)
 * @type {Function}
 */
const sign = createSigner({
  key: JWT_SECRET,
  expiresIn: JWT_EXPIRES_IN,
});

/**
 * JWT verifier instance (created once for performance)
 * @type {Function}
 */
const verify = createVerifier({
  key: JWT_SECRET,
});

/**
 * Create a signed JWT token for user authentication
 *
 * Generates a new JWT token containing user ID, email, and account type.
 * Token is valid for 2 hours.
 *
 * @param {Object} user - User object
 * @param {number} user.id - User ID
 * @param {string} user.email - User email address
 * @param {string} user.accountType - User account type
 * @returns {string} Signed JWT token
 *
 * @example
 * const token = createToken({
 *   id: 1,
 *   email: 'user@example.com',
 *   accountType: 'regular'
 * });
 */
export const createToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
    fullName: user.fullName,
    city: user.city,
  };

  return sign(payload);
};

/**
 * Verify and decode a JWT token
 *
 * Validates token signature and expiration, then returns
 * the decoded payload.
 *
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @returns {number} payload.id - User ID
 * @returns {string} payload.email - User email address
 * @returns {string} payload.accountType - User account type
 * @returns {number} payload.iat - Token issued at timestamp
 * @returns {number} payload.exp - Token expiration timestamp
 * @throws {Error} Token is invalid or expired
 *
 * @example
 * try {
 *   const payload = verifyToken(token);
 *   console.log(payload.id); // User ID
 * } catch (err) {
 *   console.error('Invalid token');
 * }
 */
export const verifyToken = (token) => {
  // Returns full payload we signed above
  const payload = verify(token);
  return payload;
};
