/**
 * Authentication Middleware
 *
 * Validates JWT tokens from signed cookies and attaches
 * user information to request object for downstream use.
 *
 * Should be used on protected routes that require authentication.
 *
 * @module middleware/auth
 */

import { verifyToken } from "../utils/authUtil.js";

/**
 * Authenticate request using JWT token from signed cookie
 *
 * Extracts authToken from signed cookies, verifies its validity,
 * and attaches decoded user payload to req.user for use in
 * subsequent middleware and route handlers.
 *
 * @middleware
 * @param {Object} req - Express request object
 * @param {Object} req.signedCookies - Signed cookies from request
 * @param {string} [req.signedCookies.authToken] - JWT token from cookie
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void} Calls next() on success, sends error response on failure
 * @throws {Error} 403 - Token missing, invalid, or expired
 *
 * @example
 * router.get('/protected', authenticate, (req, res) => {
 *   console.log(req.user.id); // User ID from token
 * });
 */
export const authenticate = (req, res, next) => {
  const token = req.signedCookies.authToken;

  if (!token) {
    return res
      .status(403)
      .json({ error: "Session expired or user not logged in" });
  }

  try {
    const payload = verifyToken(token); // { id, email, accountType, ... }
    req.user = payload; // attach to request
    next();
  } catch (err) {
    console.error(err);
    return res.status(403).json({ error: "Token is invalid or expired" });
  }
};
