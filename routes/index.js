import express from "express";
import userRoutes from "./User.js";

const router = express.Router();

// All user-related routes will be under /api/users/...
router.use("/users", userRoutes);

// Later you can add more route groups:
// import venueRoutes from "./Venue.js";
// router.use("/venues", venueRoutes);

export default router;
