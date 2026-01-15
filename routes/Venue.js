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
import { authenticate, authorize, optionalAuthenticate } from "../middleware/auth.js";

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
 * GET /venues/recommendations
 * Recommends venues based on user's city
 */
router.get("/recommendations", optionalAuthenticate, VenueController.getRecommendations);

/**
 * POST /venues
 * Protected endpoint to create a new venue
 * Only VENUE_OWNER can create a venue
 */
router.post("/", authenticate, authorize(["VENUE_OWNER"]), VenueController.create);
router.get("/my-venues", authenticate, authorize(["VENUE_OWNER"]), VenueController.fetchMyVenues);

router.get("/amenities", VenueController.fetchAmenities);
router.get("/:id", VenueController.fetchVenueById);
router.get("/:id/sports", VenueController.fetchVenueSports);
router.put("/:id", authenticate, authorize(["VENUE_OWNER"]), VenueController.update);
router.delete("/:id", authenticate, authorize(["VENUE_OWNER"]), VenueController.remove);
router.post("/:id/block", authenticate, authorize(["VENUE_OWNER"]), VenueController.blockSlot);

router.get("/:id/reviews", VenueController.fetchVenueReviews);
router.post("/:id/reviews", authenticate, VenueController.addReview);
router.delete("/:id/reviews/:reviewId", authenticate, VenueController.deleteReview);
router.post("/:id/reviews/:reviewId/reply", authenticate, authorize(["VENUE_OWNER"]), VenueController.postReply);
router.delete("/:id/reviews/:reviewId/reply", authenticate, authorize(["VENUE_OWNER"]), VenueController.deleteReply);

// Pricing Rules
router.get("/:id/pricing-rules", VenueController.getPricingRules);
router.post("/:id/pricing-rules", authenticate, authorize(["VENUE_OWNER"]), VenueController.addPricingRule);
router.delete("/:id/pricing-rules/:ruleId", authenticate, authorize(["VENUE_OWNER"]), VenueController.deletePricingRule);

export default router;
