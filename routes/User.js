import express from "express";
import {
  getAllUsers,
  login,
  authenticateUser,
} from "../controllers/UserController.js";
import { authenticate as authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Public: login
router.post("/login", login);

// Public: check current session via cookie
router.get("/authenticate", authenticateUser);

// Protected: example route to get current logged-in user info from token
router.get("/me", authMiddleware, (req, res) => {
  // req.user is the payload from the token
  res.json({ user: req.user });
});

// Protected: get all users (if you want it protected)
router.get("/", authMiddleware, getAllUsers);

export default router;
