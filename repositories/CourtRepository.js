import pool from "../config/dbconnection.js";

/**
 * Get all courts for a venue
 * @param {number} venueId 
 */
export const getCourtsByVenue = async (venueId) => {
    const [rows] = await pool.execute(
        "SELECT * FROM courts WHERE venue_id = ? AND is_active = 1",
        [venueId]
    );
    return rows;
};

/**
 * Get courts for a venue that support a specific sport
 * @param {number} venueId 
 * @param {number} sportId 
 */
export const getCourtsByVenueAndSport = async (venueId, sportId) => {
    const [rows] = await pool.execute(
        `SELECT c.* 
     FROM courts c
     JOIN court_sports cs ON c.court_id = cs.court_id
     WHERE c.venue_id = ? AND cs.sport_id = ? AND c.is_active = 1`,
        [venueId, sportId]
    );
    return rows;
};

/**
 * Get available sports for a venue (based on its courts)
 * @param {number} venueId 
 */
export const getSportsByVenue = async (venueId) => {
    const [rows] = await pool.execute(
        `SELECT DISTINCT s.* 
     FROM sports s
     JOIN court_sports cs ON s.sport_id = cs.sport_id
     JOIN courts c ON cs.court_id = c.court_id
     WHERE c.venue_id = ? AND c.is_active = 1`,
        [venueId]
    );
    return rows;
};
