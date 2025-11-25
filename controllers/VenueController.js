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
} from "../services/VenueService.js";

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
