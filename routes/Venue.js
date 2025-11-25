/**
 * Venue Routes
 *
 * Defines public endpoints for venue discovery, including
 * listing all venues, searching, and viewing trending venues.
 *
 * Public Routes:
 * - GET /venues - List all venues or search
 * - GET /venues/top-weekly - Get top 4 most booked venues
 *
 * @module routes/Venue
 */

import express from "express";
import {
  fetchAllVenues,
  fetchTopWeeklyVenues,
} from "../controllers/VenueController.js";

const router = express.Router();

/**
 * GET /venues
 * Public endpoint to fetch all venues or search by query parameter
 * Query params: ?search=basketball
 */
router.get("/", fetchAllVenues);

/**
 * GET /venues/top-weekly
 * Public endpoint to get the top 4 most booked venues in the last 7 days
 */
router.get("/top-weekly", fetchTopWeeklyVenues);

export default router;
