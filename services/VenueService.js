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
import * as BookingService from "./BookingService.js";
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
export const blockVenueSlot = async (venueId, userId, dateStr, startTime, endTime, reason, recurrence, sportId = null) => {
  let blockedCount = 0;
  let conflictCount = 0;

  // Function to process a single slot
  const processSlot = async (currentDateStr) => {
    const start = createISTDate(currentDateStr, startTime);
    const end = createISTDate(currentDateStr, endTime);
    const sSql = toMySQLDateTime(start);
    const eSql = toMySQLDateTime(end);

    // Find a specific court if sportId is provided
    let availableCourtId = null;
    if (sportId) {
      availableCourtId = await BookingService.findAvailableCourt(venueId, sSql, eSql, sportId);
      if (!availableCourtId) return false; // No available court for this sport
    }

    const hasConflict = await BookingRepository.hasBookingConflict(venueId, sSql, eSql, availableCourtId);
    if (!hasConflict) {
      await BookingRepository.createBlock(venueId, userId, sSql, eSql, availableCourtId, sportId);
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
  const rules = await venueRepository.getPricingRules(venue.venue_id);

  const bookingDateObj = createISTDate(date, "00:00");
  const bookingDay = bookingDateObj.getDay(); // 0-6
  const bookingStartHour = parseInt(time.split(':')[0]);

  let maxMultiplier = 1.0;

  for (const rule of rules) {
    // Check Day
    if (rule.days_of_week) {
      let days = rule.days_of_week;
      if (typeof days === 'string') {
        try {
          days = JSON.parse(days);
        } catch (e) {
          days = [];
        }
      }

      // Ensure days is an array
      if (Array.isArray(days)) {
        // If days array is empty, it means "Every Day" - so we DON'T skip.
        // Only check inclusion if array is NOT empty.
        if (days.length > 0) {
          const numericDays = days.map(Number);
          if (!numericDays.includes(bookingDay)) {
            continue;
          }
        }
      }
    }

    const ruleStart = parseInt(rule.start_time.split(':')[0]);
    const ruleEnd = parseInt(rule.end_time.split(':')[0]);

    // Simple overlap check (assuming booking is 1 hour blocks or checking start time only)
    // To be more accurate we should check full range overlap, but user asked for "specific time period"
    // Checking if start time falls in range is a good approximation for now or we check if ANY part of booking falls in range.
    // For now, let's stick to start time.
    if (bookingStartHour >= ruleStart && bookingStartHour < ruleEnd) {
      if (Number(rule.multiplier) > maxMultiplier) {
        maxMultiplier = Number(rule.multiplier);
      }
    }
  }

  const finalPrice = total * maxMultiplier;
  return finalPrice;
};

/**
 * Add pricing rule
 */
export const addVenuePricingRule = async (data) => {
  return await venueRepository.addPricingRule(data);
};

/**
 * Get pricing rules
 */
export const getVenuePricingRules = async (venueId) => {
  return await venueRepository.getPricingRules(venueId);
};

/**
 * Delete pricing rule
 */
export const deleteVenuePricingRule = async (ruleId) => {
  return await venueRepository.deletePricingRule(ruleId);
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

/**
 * Delete a review
 */
export const deleteVenueReview = async (reviewId, userId) => {
  const deleted = await venueRepository.deleteReview(reviewId, userId);
  if (!deleted) {
    throw new Error("Review not found or unauthorized");
  }
  return true;
};

export const getAllPolicies = async () => {
  return await VenueRepository.getAllPolicies();
};
