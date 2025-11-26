/**
 * Venue Repository
 *
 * Data access layer for venue-related database operations.
 * Handles complex queries for venue data with related information
 * like sports, amenities, and images.
 *
 * Uses parameterized queries to prevent SQL injection.
 * Utilizes GROUP_CONCAT for efficient data aggregation.
 *
 * Responsibilities:
 * - Complex venue queries with JOINs
 * - Search functionality
 * - Trending venues calculation
 *
 * @module repositories/VenueRepository
 */

import connectDB from "../config/dbconnection.js";

/**
 * Fetch all venues with complete details
 *
 * Retrieves all venues with aggregated information:
 * - Associated sports (court types)
 * - Primary venue image
 * - Available amenities
 * - Description
 *
 * @async
 * @returns {Promise<Object[]>} Array of venue objects
 * @returns {number} rows[].venue_id - Venue ID
 * @returns {string} rows[].venue_name - Venue name
 * @returns {string} rows[].location - Address and city
 * @returns {string} rows[].court_types - Comma-separated sports
 * @returns {number} rows[].price_per_hour - Hourly rate
 * @returns {string} rows[].primary_image - URL of main image
 * @returns {string} rows[].amenities - Comma-separated amenity list
 * @returns {string} rows[].description - Venue description
 * @throws {Error} Database connection error
 */
export const findAllVenues = async () => {
  const sql = `
    SELECT 
        v.venue_id,
        v.name AS venue_name,
        CONCAT_WS(', ', v.address, v.city) AS location,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name) AS court_types,
        v.price_per_hour,
        vi.image_url AS primary_image,
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS amenities,
        v.description
    FROM venues v
    LEFT JOIN venue_sports vs 
        ON vs.venue_id = v.venue_id
    LEFT JOIN sports s 
        ON s.sport_id = vs.sport_id
    LEFT JOIN venue_images vi 
        ON vi.venue_id = v.venue_id
       AND vi.is_primary = 1
    LEFT JOIN venue_amenities va 
        ON va.venue_id = v.venue_id
    LEFT JOIN amenities a 
        ON a.amenity_id = va.amenity_id
    GROUP BY 
        v.venue_id,
        v.name,
        location,
        v.price_per_hour,
        vi.image_url,
        v.description
  `;

  const [rows] = await connectDB.execute(sql);
  return rows;
};

/**
 * Fetch top 4 most booked venues from the past 7 days
 *
 * Retrieves only active venues with booking counts from the
 * last 7 days, ordered by popularity (most booked first).
 *
 * Considers only confirmed and completed bookings.
 *
 * @async
 * @returns {Promise<Object[]>} Array of top 4 venues
 * @returns {number} rows[].venue_id - Venue ID
 * @returns {string} rows[].venue_name - Venue name
 * @returns {string} rows[].location - Address and city
 * @returns {number} rows[].price_per_hour - Hourly rate
 * @returns {string} rows[].primary_image - URL of main image
 * @returns {string} rows[].amenities - Comma-separated amenity list
 * @returns {string} rows[].court_types - Comma-separated sports
 * @returns {string} rows[].description - Venue description
 * @returns {number} rows[].bookings_this_week - Number of bookings
 * @throws {Error} Database connection error
 */
export const findMostBookedVenuesThisWeek = async () => {
  const sql = `
    SELECT 
        v.venue_id,
        v.name AS venue_name,
        CONCAT(v.address, ', ', v.city) AS location,
        v.price_per_hour,
        vi.image_url AS primary_image,
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS amenities,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS court_types,
        v.description,
        COUNT(b.booking_id) AS bookings_this_week
    FROM venues v
    LEFT JOIN bookings b 
        ON b.venue_id = v.venue_id
       AND b.booking_start >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       AND b.booking_start < NOW()
       AND b.status IN ('CONFIRMED', 'COMPLETED')
    LEFT JOIN venue_images vi
        ON vi.venue_id = v.venue_id
       AND vi.is_primary = 1
    LEFT JOIN venue_amenities va 
        ON va.venue_id = v.venue_id
    LEFT JOIN amenities a 
        ON a.amenity_id = va.amenity_id
    LEFT JOIN venue_sports vs 
        ON vs.venue_id = v.venue_id
    LEFT JOIN sports s 
        ON s.sport_id = vs.sport_id
    WHERE v.is_active = 1
    GROUP BY 
        v.venue_id,
        v.name,
        v.address,
        v.city,
        v.price_per_hour,
        vi.image_url,
        v.description
    ORDER BY bookings_this_week DESC
    LIMIT 4;
  `;

  const [rows] = await connectDB.execute(sql);
  return rows;
};

/**
 * Search venues by multiple criteria
 *
 * Performs LIKE search across venue name, address, city,
 * and associated sports. Returns matching venues with all
 * related information.
 *
 * Uses parameterized queries to prevent SQL injection.
 * Case-insensitive search using LIKE operator.
 *
 * @async
 * @param {string} searchText - Search query string
 * @returns {Promise<Object[]>} Array of matching venue objects
 * @returns {number} rows[].venue_id - Venue ID
 * @returns {string} rows[].venue_name - Venue name
 * @returns {string} rows[].location - Address and city
 * @returns {string} rows[].court_types - Comma-separated sports
 * @returns {number} rows[].price_per_hour - Hourly rate
 * @returns {string} rows[].primary_image - URL of main image
 * @returns {string} rows[].amenities - Comma-separated amenity list
 * @returns {string} rows[].description - Venue description
 * @throws {Error} Database connection error
 */
export const findVenuesBySearch = async (searchText) => {
  const sql = `
    SELECT 
        v.venue_id,
        v.name AS venue_name,
        CONCAT_WS(', ', v.address, v.city) AS location,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name) AS court_types,
        v.price_per_hour,
        vi.image_url AS primary_image,
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS amenities,
        v.description
    FROM venues v
    LEFT JOIN venue_sports vs 
        ON vs.venue_id = v.venue_id
    LEFT JOIN sports s 
        ON s.sport_id = vs.sport_id
    LEFT JOIN venue_images vi 
        ON vi.venue_id = v.venue_id
       AND vi.is_primary = 1
    LEFT JOIN venue_amenities va 
        ON va.venue_id = v.venue_id
    LEFT JOIN amenities a 
        ON a.amenity_id = va.amenity_id
    WHERE v.name LIKE ? 
       OR v.address LIKE ? 
       OR v.city LIKE ? 
       OR s.name LIKE ?
    GROUP BY 
        v.venue_id,
        v.name,
        location,
        v.price_per_hour,
        vi.image_url,
        v.description
  `;

  const searchPattern = `%${searchText}%`;
  const [rows] = await connectDB.execute(sql, [
    searchPattern,
    searchPattern,
    searchPattern,
    searchPattern,
  ]);
  return rows;
};
