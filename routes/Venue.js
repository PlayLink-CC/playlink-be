import express from "express";
import {
  fetchAllVenues,
  fetchTopWeeklyVenues,
} from "../controllers/VenueController.js";

const router = express.Router();

// GET /api/venues - for fetching all venues & search
router.get("/", fetchAllVenues);

// GET /api/venues/top-weekly
router.get("/top-weekly", fetchTopWeeklyVenues);

export default router;
