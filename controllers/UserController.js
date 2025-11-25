/**
 * User Controller
 *
 * Handles all user-related HTTP requests including authentication,
 * session validation, and user profile retrieval.
 *
 * Responsibilities:
 * - Request validation
 * - Token generation and verification
 * - HTTP response formatting
 * - Error handling
 *
 * @module controllers/UserController
 */

import { getUsers, logInUser } from "../services/UserService.js";
import { createToken, verifyToken } from "../utils/authUtil.js";

/**
 * Retrieve all users from the database
 *
 * @async
 * @route GET /api/users
 * @access Protected - Requires valid JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object[]} Array of user objects
 * @returns {number} res.status - 200 on success, 500 on error
 */
export const getAllUsers = async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Authenticate user and create session token
 *
 * Validates email and password, compares password hash, and creates
 * a signed JWT token stored in an httpOnly cookie.
 *
 * @async
 * @route POST /api/users/login
 * @access Public
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User email address
 * @param {string} req.body.password - Plain text password
 * @param {Object} res - Express response object
 * @returns {Object} User object (excluding password)
 * @returns {number} res.status - 200 on success, 400/401/500 on error
 * @throws {Error} 400 - Missing email or password
 * @throws {Error} 401 - Invalid credentials
 */
// controllers/UserController.js
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await logInUser(email, password);

    const token = createToken(user);

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60,
      signed: true,
      sameSite: "Lax",
      path: "/",
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    if (err.message === "Invalid credentials") {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.status(500).json({ message: "Server error" });
  }
};


/**
 * Validate current session without middleware
 *
 * Checks if a valid authToken cookie exists and verifies the JWT.
 * Used to determine if user is still logged in.
 *
 * @async
 * @route GET /api/users/authenticate
 * @access Public
 * @param {Object} req - Express request object
 * @param {Object} req.signedCookies - Signed cookies from request
 * @param {Object} res - Express response object
 * @returns {Object} User payload from token
 * @returns {number} res.status - 200 on success, 403 on error
 * @throws {Error} 403 - Session expired or invalid token
 */
export const authenticateUser = async (req, res) => {
  try {
    const token = req.signedCookies.authToken;

    if (!token) {
      return res
        .status(403)
        .json({ error: "Session expired or user not logged in" });
    }

    const payload = verifyToken(token);

    res.json({ user: payload });
  } catch (err) {
    console.error(err);
    res.status(403).json({ error: "Token is invalid or expired" });
  }
};

// controllers/UserController.js

export const logout = (req, res) => {
  res.clearCookie("authToken", {
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    signed: true,
    path: "/",
  });

  console.log(res);

  return res.json({ message: "Logged out" });
};
