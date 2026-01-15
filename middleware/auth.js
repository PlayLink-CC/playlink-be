/**
 * Authentication & Authorization Middleware
 *
 * Validates JWT tokens and enforces Role-Based Access Control (RBAC).
 *
 * @module middleware/auth
 */

import { verifyToken } from "../utils/authUtil.js";

/**
 * Authenticate request using JWT token from signed cookie
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
    return res.status(403).json({ error: "Token is invalid or expired" });
  }
};

/**
 * Optional authentication - attaches user to req if token exists
 */
export const optionalAuthenticate = (req, res, next) => {
  const token = req.signedCookies.authToken;
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = payload;
    } catch (err) {
      // ignore invalid tokens for optional auth
    }
  }
  next();
};

/**
 * Authorize user based on allowed roles
 *
 * Checks if the authenticated user's account type matches one of the
 * allowed roles for this route. Must be placed AFTER 'authenticate'.
 *
 * @param {string[]} allowedRoles - Array of allowed account types (e.g. ['VENUE_OWNER', 'ADMIN'])
 * @returns {Function} Express middleware
 */
export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    // 1. Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized: User not authenticated" });
    }

    // 2. Check if user's role is allowed
    // Note: req.user.accountType comes from the JWT payload created in authUtil.js
    if (!allowedRoles.includes(req.user.accountType)) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to perform this action."
      });
    }

    next();
  };
};