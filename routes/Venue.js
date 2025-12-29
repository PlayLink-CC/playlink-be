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
import * as VenueController from "../controllers/VenueController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

/**
 * GET /venues
 * Public endpoint to fetch all venues or search by query parameter
 * Query params: ?search=basketball
 */
router.get("/", VenueController.fetchAllVenues);

/**
 * GET /venues/top-weekly
 * Public endpoint to get the top 4 most booked venues in the last 7 days
 */
router.get("/top-weekly", VenueController.fetchTopWeeklyVenues);

/**
 * POST /venues
 * Protected endpoint to create a new venue
 * Only VENUE_OWNER can create a venue
 */
router.post("/", authenticate, authorize(["VENUE_OWNER"]), VenueController.create);
router.get("/my-venues", authenticate, authorize(["VENUE_OWNER"]), VenueController.fetchMyVenues);

router.get("/:id", VenueController.fetchVenueById);
router.put("/:id", authenticate, authorize(["VENUE_OWNER"]), VenueController.update);
router.delete("/:id", authenticate, authorize(["VENUE_OWNER"]), VenueController.remove);
router.post("/:id/block", authenticate, authorize(["VENUE_OWNER"]), VenueController.blockSlot);

router.post("/:id/reviews", authenticate, VenueController.addReview);

export default router;
