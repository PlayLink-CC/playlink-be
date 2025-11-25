/**
 * Venue Service
 *
 * Contains business logic for venue-related operations.
 * Orchestrates between controllers and repositories.
 * Handles data retrieval and transformation.
 *
 * Responsibilities:
 * - Venue data fetching and filtering
 * - Search functionality
 * - Business logic for trending venues
 *
 * @module services/VenueService
 */

import * as venueRepository from "../repositories/VenueRepository.js";

/**
 * Retrieve all venues from the database
 *
 * Fetches complete venue information including sports,
 * amenities, and images.
 *
 * @async
 * @returns {Promise<Object[]>} Array of venue objects
 * @throws {Error} Database connection error
 */
export const getAllVenues = async () => {
  const venues = await venueRepository.findAllVenues();
  return venues;
};

/**
 * Get the top 4 most booked venues from the past 7 days
 *
 * Retrieves trending venues based on booking activity
 * for the current week.
 *
 * @async
 * @returns {Promise<Object[]>} Array of top venues with booking counts
 * @throws {Error} Database connection error
 */
export const findMostBookedVenuesThisWeek = async () => {
  const venues = await venueRepository.findMostBookedVenuesThisWeek();
  return venues;
};

/**
 * Search venues by name, location, or sport type
 *
 * Performs full-text search across venue names, addresses,
 * cities, and associated sports.
 *
 * @async
 * @param {string} searchText - Search query string
 * @returns {Promise<Object[]>} Array of matching venue objects
 * @throws {Error} Database connection error
 */
export const searchVenues = async (searchText) => {
  const venues = await venueRepository.findVenuesBySearch(searchText);
  return venues;
};
