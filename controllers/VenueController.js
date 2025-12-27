/**
 * Venue Controller
 *
 * Handles all venue-related HTTP requests including listing,
 * searching, and retrieving trending venues.
 *
 * Responsibilities:
 * - Request validation and parameter extraction
 * - Service layer orchestration
 * - HTTP response formatting
 * - Error handling and logging
 *
 * @module controllers/VenueController
 */

import {
  getAllVenues,
  findMostBookedVenuesThisWeek,
  searchVenues,
  createVenue,
  updateVenue as updateVenueService,
  blockVenueSlot,
  getVenuesByOwner,
  getVenueById,
} from "../services/VenueService.js";
import * as VenueRepository from "../repositories/VenueRepository.js";
import * as BookingRepository from "../repositories/BookingRepository.js";

/**
 * Fetch all venues or search by query parameter
 *
 * Returns all venues if no search term provided, otherwise
 * returns venues matching the search criteria (name, location, sports).
 *
 * @async
 * @route GET /api/venues
 * @access Public
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search] - Optional search term
 * @param {Object} res - Express response object
 * @returns {Object[]} Array of venue objects with details
 * @returns {number} res.status - 200 on success, 500 on error
 */
export const fetchAllVenues = async (req, res) => {
  try {
    const { search } = req.query;

    let venues;
    if (search && search.trim()) {
      // If search query parameter exists, perform search
      venues = await searchVenues(search.trim());
    } else {
      // Otherwise fetch all venues
      venues = await getAllVenues();
    }

    res.json(venues);
  } catch (err) {
    console.error("Error fetching venues:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Fetch top 4 most booked venues from the past 7 days
 *
 * Returns venues sorted by booking count for the current week.
 * Useful for displaying trending venues to users.
 *
 * @async
 * @route GET /api/venues/top-weekly
 * @access Public
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object[]} Array of top 4 venue objects with booking counts
 * @returns {number} res.status - 200 on success, 500 on error
 */
export const fetchTopWeeklyVenues = async (req, res) => {
  try {
    const venues = await findMostBookedVenuesThisWeek();
    res.json(venues);
  } catch (err) {
    console.error("Error fetching top weekly venues:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create a new venue
 *
 * @async
 * @route POST /api/venues
 * @access Protected (Venue Owner)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Created venue object
 * @returns {number} res.status - 201 on success, 500 on error
 */
export const create = async (req, res) => {
  try {
    const ownerId = req.user.id; // From auth middleware
    const venueData = { ...req.body, ownerId };

    const result = await createVenue(venueData);
    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating venue:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/venues/:id/reviews
 * 
 * Submit a review for a venue. User must have a completed booking.
 */
export const addReview = async (req, res) => {
  const venueId = req.params.id;
  const userId = req.user.id;
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Invalid rating (1-5)" });
  }

  try {
    // 1. Verify completed booking
    const hasCompleted = await BookingRepository.hasUserCompletedBooking(userId, venueId);
    if (!hasCompleted) {
      return res.status(403).json({
        message: "You can only review venues you have stayed at (completed booking required)."
      });
    }

    // 2. Create review
    await VenueRepository.createReview({
      venueId,
      userId,
      rating,
      comment
    });

    res.status(201).json({ message: "Review submitted successfully" });
  } catch (err) {
    console.error("Error creating review:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update a venue
 * PUT /api/venues/:id
 */
export const update = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const success = await updateVenueService(id, updates);
    if (!success) {
      return res.status(404).json({ message: "Venue not found or no changes made" });
    }
    res.json({ message: "Venue updated successfully" });
  } catch (err) {
    console.error("Error updating venue:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Manually block a time slot
 * POST /api/venues/:id/block
 */
export const blockSlot = async (req, res) => {
  const { id } = req.params;
  const { date, time, hours, reason } = req.body;

  if (!date || !time || !hours) {
    return res.status(400).json({ message: "Missing blocking details" });
  }

  try {
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);

    // Check conflicts
    const bookingStart = start.toISOString().slice(0, 19).replace('T', ' ');
    const bookingEnd = end.toISOString().slice(0, 19).replace('T', ' ');

    const hasConflict = await BookingRepository.hasBookingConflict(id, bookingStart, bookingEnd);
    if (hasConflict) {
      return res.status(409).json({ message: "Slot already booked or blocked" });
    }

    await blockVenueSlot(id, bookingStart, bookingEnd, reason);
    res.status(201).json({ message: "Slot blocked successfully" });
  } catch (err) {
    console.error("Error blocking slot:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Fetch venues owned by the authenticated user
 * GET /api/venues/my-venues
 */
export const fetchMyVenues = async (req, res) => {
  const ownerId = req.user.id;
  try {
    const venues = await getVenuesByOwner(ownerId);
    res.json(venues);
  } catch (err) {
    console.error("Error fetching my venues:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Fetch venue details by ID
 * GET /api/venues/:id
 */
export const fetchVenueById = async (req, res) => {
  const { id } = req.params;
  try {
    const venue = await getVenueById(id);
    res.json(venue);
  } catch (err) {
    console.error("Error fetching venue by ID:", err);
    if (err.message === "Venue not found") {
      return res.status(404).json({ message: "Venue not found" });
    }
    res.status(500).json({ message: "Server error" });
  }
};
