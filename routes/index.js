/**
 * Central Route Aggregator
 *
 * Combines all route modules and mounts them under appropriate paths.
 * All routes are prefixed with /api in server.js
 *
 * Route Structure:
 * - /api/users/* → User authentication and management
 * - /api/venues/* → Venue listing and search
 *
 * @module routes/index
 */

import express from "express";
import userRoutes from "./User.js";
import venueRoutes from "./Venue.js";
import bookingRoutes from "./Booking.js";
import analyticsRoutes from "./Analytics.js";

import walletRoutes from "./Wallet.js";

const router = express.Router();

// All user-related routes will be under /api/users/...
router.use("/users", userRoutes);
router.use("/venues", venueRoutes);
router.use("/bookings", bookingRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/wallet", walletRoutes);

export default router;
