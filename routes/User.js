/**
 * User Routes
 *
 * Defines endpoints for user authentication, session management,
 * and user data retrieval.
 *
 * Public Routes:
 * - POST /users/register - User registration
 * - POST /users/login - User authentication
 * - GET /users/authenticate - Session validation
 *
 * Protected Routes (require valid JWT token):
 * - GET /users/me - Get current user profile
 * - GET /users - List all users
 *
 * @module routes/User
 */

import express from "express";
import {
  getAllUsers,
  login,
  authenticateUser,
  logout,
  register,
  search,
} from "../controllers/UserController.js";
import { authenticate as authMiddleware, authorize } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /users/register
 * Public endpoint for user registration
 */
router.post("/register", register);

/**
 * POST /users/login
 * Public endpoint for user authentication
 */
router.post("/login", login);

/**
 * POST /users/logout
 * Public endpoint to clear auth cookie and end session
 */
router.post("/logout", logout);

/**
 * GET /users/authenticate
 * Public endpoint to check current session from cookie
 */
router.get("/authenticate", authenticateUser);

/**
 * GET /users/me
 * Protected endpoint to get current logged-in user info from token
 */
router.get("/me", authMiddleware, (req, res) => {
  // req.user is the payload from the token
  res.json({ user: req.user });
});

/**
 * GET /users/search?query=...
 * Protected endpoint to search users
 */
router.get("/search", authMiddleware, search);

/**
 * GET /users
 * Protected endpoint to get all users
 */
router.get("/", authMiddleware, getAllUsers);

/**
 * GET /users/venue-owner-test
 * Protected endpoint accessible ONLY by Venue Owners
 */
router.get(
  "/venue-owner-test",
  authMiddleware,
  authorize(["VENUE_OWNER"]), // Only allow VENUE_OWNER
  (req, res) => {
    res.json({
      message: "Success! You are seeing this because you are a Venue Owner.",
      user: req.user
    });
  }
);

export default router;
