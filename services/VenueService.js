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
import * as BookingRepository from "../repositories/BookingRepository.js";
import { createISTDate, toMySQLDateTime } from "../utils/dateUtil.js";

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
 * Get all available amenities
 */
export const getAllAmenities = async () => {
  return await venueRepository.getAllAmenities();
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
  return venues;
};

/**
 * Create a new venue
 *
 * Validates and passes data to repository.
 *
 * @async
 * @param {Object} data - Venue data from controller
 * @returns {Promise<Object>} Created venue details or ID
 */
export const createVenue = async (data) => {
  const { name, ownerId, pricePerHour } = data;
  if (!name || !name.trim() || !ownerId || !pricePerHour) {
    throw new Error("Missing required fields");
  }

  const venueId = await venueRepository.createVenue(data);
  return { venueId, ...data };
};

/**
 * Update venue details
 */
export const updateVenue = async (venueId, updates) => {
  if (updates.name !== undefined && (!updates.name || !updates.name.trim())) {
    throw new Error("Venue name cannot be empty");
  }
  if (updates.address !== undefined && (!updates.address || !updates.address.trim())) {
    throw new Error("Address cannot be empty");
  }
  if (updates.city !== undefined && (!updates.city || !updates.city.trim())) {
    throw new Error("City cannot be empty");
  }
  if (updates.description !== undefined && (!updates.description || !updates.description.trim())) {
    throw new Error("Description cannot be empty");
  }
  return await venueRepository.updateVenue(venueId, updates);
};

/**
 * Block a venue slot
 */
/**
 * Block a venue slot (Single or Recurring)
 */
export const blockVenueSlot = async (venueId, userId, dateStr, startTime, endTime, reason, recurrence) => {
  let blockedCount = 0;
  let conflictCount = 0;

  // Function to process a single slot
  const processSlot = async (currentDateStr) => {
    const start = createISTDate(currentDateStr, startTime);
    const end = createISTDate(currentDateStr, endTime);
    const sSql = toMySQLDateTime(start);
    const eSql = toMySQLDateTime(end);

    const hasConflict = await BookingRepository.hasBookingConflict(venueId, sSql, eSql);
    if (!hasConflict) {
      await BookingRepository.createBlock(venueId, userId, sSql, eSql, reason);
      return true;
    }
    return false;
  };

  if (!recurrence || recurrence.type === 'single') {
    const success = await processSlot(dateStr);
    if (!success) throw new Error("Slot already booked or blocked");
    return { blocked: 1, conflicts: 0 };
  }

  // Recurring Logic
  const { daysOfWeek, untilDate } = recurrence; // daysOfWeek: [0-6], 0=Sun
  const startObj = new Date(dateStr);
  const endObj = new Date(untilDate);
  const MAX_RECURRENCE_MONTHS = 6;

  // Safety check: Don't allow infinite loops or too far future
  const maxDate = new Date(startObj);
  maxDate.setMonth(maxDate.getMonth() + MAX_RECURRENCE_MONTHS);
  if (endObj > maxDate) {
    throw new Error(`Cannot block more than ${MAX_RECURRENCE_MONTHS} months in advance`);
  }

  let cursor = new Date(startObj);
  while (cursor <= endObj) {
    // Check if current day (0-6) is in selected days
    if (daysOfWeek.includes(cursor.getDay())) {
      const currentIsoDate = cursor.toISOString().split('T')[0];
      const success = await processSlot(currentIsoDate);
      if (success) blockedCount++;
      else conflictCount++;
    }
    // Next day
    cursor.setDate(cursor.getDate() + 1);
  }

  return { blocked: blockedCount, conflicts: conflictCount };
};

/**
 * Calculate dynamic price based on rules
 */
export const calculateDynamicPrice = async (venue, date, time, hours) => {
  // Base price
  let total = Number(venue.price_per_hour) * Number(hours);

  // Fetch rules
  const rules = await BookingRepository.getPricingRules(venue.venue_id);

  // Simple logic: check if booking time overlaps with rule
  const bookingStartHour = parseInt(time.split(':')[0]);

  let maxMultiplier = 1.0;

  for (const rule of rules) {
    const ruleStart = parseInt(rule.start_time.split(':')[0]);
    const ruleEnd = parseInt(rule.end_time.split(':')[0]);

    if (bookingStartHour >= ruleStart && bookingStartHour < ruleEnd) {
      if (Number(rule.multiplier) > maxMultiplier) {
        maxMultiplier = Number(rule.multiplier);
      }
    }
  }

  return total * maxMultiplier;
};

/**
 * Get venues for a specific owner
 */
export const getVenuesByOwner = async (ownerId) => {
  return await venueRepository.findVenuesByOwner(ownerId);
};

/**
 * Get venue details by ID
 */
export const getVenueById = async (venueId) => {
  const venue = await venueRepository.findVenueById(venueId);
  if (!venue) {
    throw new Error("Venue not found");
  }
  return venue;
};

/**
 * Delete a venue
 */
export const deleteVenue = async (venueId) => {
  // 1. Check for active bookings
  const activeCount = await BookingRepository.countActiveBookings(venueId);
  if (activeCount > 0) {
    throw new Error("Cannot delete venue with active (Confirmed, Pending, or Blocked) bookings. Please cancel or unblock them first.");
  }

  // 2. Delete history (Cancelled/Completed bookings) to satisfy foreign keys
  // The user requested: "If it's cancelled then allow deletion" imply we should clear them.
  await BookingRepository.deleteVenueBookings(venueId);

  // 3. Delete the venue
  return await venueRepository.deleteVenue(venueId);
};

/**
 * Get reviews for a venue
 */
export const getVenueReviews = async (venueId) => {
  return await venueRepository.findReviewsByVenueId(venueId);
};

/**
 * Reply to a review
 */
export const replyToReview = async (reviewId, reply) => {
  return await venueRepository.updateReviewReply(reviewId, reply);
};
