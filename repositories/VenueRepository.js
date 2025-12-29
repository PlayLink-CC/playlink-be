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
 * Get all cancellation policies
 * 
 * @returns {Promise<Array>} List of polices
 */
export const getAllPolicies = async () => {
    const [rows] = await connectDB.execute("SELECT * FROM cancellation_policies");
    return rows;
};

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

/**
 * Create a new venue with all associated details
 *
 * wraps inserts in a transaction.
 *
 * @async
 * @param {Object} venueData
 * @param {number} venueData.ownerId
 * @param {string} venueData.name
 * @param {string} venueData.description
 * @param {string} venueData.address
 * @param {string} venueData.city
 * @param {number} venueData.pricePerHour
 * @param {number} venueData.cancellationPolicyId
 * @param {number[]} venueData.sportIds
 * @param {number[]} venueData.amenityIds
 * @param {string[]} venueData.imageUrls
 * @returns {Promise<number>} New venue ID
 */
export const createVenue = async (venueData) => {
    const conn = await connectDB.getConnection();
    try {
        await conn.beginTransaction();

        const {
            ownerId,
            name,
            description,
            address,
            city,
            pricePerHour,
            cancellationPolicyId,
            sportIds,
            amenityIds,
            imageUrls,
        } = venueData;

        // 1. Insert Venue
        const [result] = await conn.execute(
            `INSERT INTO venues (owner_id, name, description, address, city, price_per_hour, cancellation_policy_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                ownerId,
                name,
                description,
                address,
                city,
                pricePerHour,
                cancellationPolicyId,
            ]
        );
        const venueId = result.insertId;

        // 2. Insert Sports
        if (sportIds && sportIds.length > 0) {
            const sportValues = sportIds.map((id) => [venueId, id]);
            await conn.query(
                `INSERT INTO venue_sports (venue_id, sport_id) VALUES ?`,
                [sportValues]
            );
        }

        // 3. Insert Amenities
        if (amenityIds && amenityIds.length > 0) {
            const amenityValues = amenityIds.map((id) => [venueId, id]);
            await conn.query(
                `INSERT INTO venue_amenities (venue_id, amenity_id) VALUES ?`,
                [amenityValues]
            );
        }

        // 4. Insert Images
        if (imageUrls && imageUrls.length > 0) {
            const imageValues = imageUrls.map((url, index) => [
                venueId,
                url,
                index === 0 ? 1 : 0,
                index + 1,
            ]);
            await conn.query(
                `INSERT INTO venue_images (venue_id, image_url, is_primary, sort_order) VALUES ?`,
                [imageValues]
            );
        }

        await conn.commit();
        return venueId;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

/**
 * Create a new venue review
 * 
 * @async
 * @param {Object} reviewData
 * @returns {Promise<number>} New review ID
 */
export const createReview = async ({ venueId, userId, rating, comment }) => {
    const [result] = await connectDB.execute(
        `INSERT INTO reviews (venue_id, user_id, rating, comment) VALUES (?, ?, ?, ?)`,
        [venueId, userId, rating, comment]
    );
    return result.insertId;
};

/**
 * Update venue details
 * 
 * @async
 * @param {number} venueId
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} True if updated
 */
export const updateVenue = async (venueId, updates) => {
    const validFields = ['name', 'description', 'price_per_hour', 'address', 'city'];
    const fieldsToUpdate = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
        if (validFields.includes(key)) {
            fieldsToUpdate.push(`${key} = ?`);
            values.push(value);
        }
    }

    if (fieldsToUpdate.length === 0) return false;

    // Add updated_at timestamp
    fieldsToUpdate.push('updated_at = NOW()');
    values.push(venueId);

    const sql = `UPDATE venues SET ${fieldsToUpdate.join(', ')} WHERE venue_id = ?`;

    const [result] = await connectDB.execute(sql, values);
    return result.affectedRows > 0;
};

/**
 * Find venues by owner ID
 * 
 * @async
 * @param {number} ownerId
 * @returns {Promise<Object[]>} Array of venues
 */
export const findVenuesByOwner = async (ownerId) => {
    const sql = `
        SELECT 
            v.venue_id,
            v.name AS venue_name,
            v.address,
            v.city,
            v.price_per_hour,
            v.is_active,
            vi.image_url AS primary_image
        FROM venues v
        LEFT JOIN venue_images vi 
            ON vi.venue_id = v.venue_id
            AND vi.is_primary = 1
        WHERE v.owner_id = ?
        ORDER BY v.created_at DESC
    `;
    const [rows] = await connectDB.execute(sql, [ownerId]);
    return rows;
};

/**
 * Find a specific venue by ID
 * 
 * @async
 * @param {number} venueId
 * @returns {Promise<Object>} Venue object or null
 */
export const findVenueById = async (venueId) => {
    const sql = `
    SELECT 
        v.venue_id,
        v.name AS venue_name,
        v.owner_id,
        v.address,
        v.city,
        CONCAT_WS(', ', v.address, v.city) AS location,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name) AS court_types,
        v.price_per_hour,
        vi.image_url AS primary_image,
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS amenities,
        v.description,
        v.cancellation_policy_id
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
    WHERE v.venue_id = ?
    GROUP BY 
        v.venue_id,
        v.name,
        v.owner_id,
        v.address,
        v.city,
        location,
        v.price_per_hour,
        vi.image_url,
        v.description,
        v.cancellation_policy_id
    `;
    const [rows] = await connectDB.execute(sql, [venueId]);
    return rows[0];
};
