/**
 * Employee Controller
 * 
 * Handles retrieval of dashboard statistics for venue employees.
 */
import pool from "../config/dbconnection.js";

/**
 * Get Today's Summary for the logged-in Employee
 * 
 * Returns:
 * - Total confirmed bookings for today at employee's venue
 * - Next upcoming confirmed booking details
 * - Current status (Free/Occupied) for all courts at the venue
 */
export const getTodaySummary = async (req, res) => {
    // req.user is populated by middleware (EnsureUserIsEmployee or similar authentication)
    const userId = req.user.id;

    try {
        // 1. Identify the Venue assigned to this Employee
        const [venueRows] = await pool.execute(
            "SELECT venue_id FROM employee_venue WHERE user_id = ?",
            [userId]
        );

        if (venueRows.length === 0) {
            return res.status(404).json({ message: "No venue assigned to this employee account." });
        }
        const venueId = venueRows[0].venue_id;

        // 2. Fetch Total Confirmed Bookings for Today
        // We use CURDATE() to compare against the date part of booking_start
        const [countResult] = await pool.execute(
            `SELECT COUNT(*) AS total 
             FROM bookings 
             WHERE venue_id = ? 
               AND status = 'CONFIRMED' 
               AND DATE(booking_start) = CURDATE()`,
            [venueId]
        );
        const totalBookings = countResult[0].total;

        // 3. Fetch Next Upcoming Booking
        // Strictly future bookings needed (booking_start > NOW())
        const [nextBookingResult] = await pool.execute(
            `SELECT b.booking_id, b.booking_start, c.name as court_name, u.full_name as user_name, b.guest_name
             FROM bookings b
             LEFT JOIN courts c ON b.court_id = c.court_id
             LEFT JOIN users u ON b.created_by = u.user_id
             WHERE b.venue_id = ? 
               AND b.status = 'CONFIRMED' 
               AND b.booking_start > NOW()
             ORDER BY b.booking_start ASC 
             LIMIT 1`,
            [venueId]
        );
        
        let nextBooking = null;
        if (nextBookingResult.length > 0) {
            const nb = nextBookingResult[0];
            nextBooking = {
                id: nb.booking_id,
                time: nb.booking_start,
                court: nb.court_name || "Unassigned Court",
                player: nb.user_name || nb.guest_name || "Guest Player"
            };
        }

        // 4. Fetch Current Status of Courts
        // A court is occupied if there is a CONFIRMED booking happening RIGHT NOW.
        // Start <= NOW < End
        const [courts] = await pool.execute(
            `SELECT c.court_id, c.name,
                (SELECT COUNT(*) FROM bookings b 
                 WHERE b.court_id = c.court_id 
                   AND b.status = 'CONFIRMED'
                   AND b.booking_start <= NOW() 
                   AND b.booking_end > NOW()
                ) as is_occupied
             FROM courts c
             WHERE c.venue_id = ? AND c.is_active = 1
             ORDER BY c.name`,
            [venueId]
        );

        const courtStatus = courts.map(c => ({
            id: c.court_id,
            name: c.name,
            status: c.is_occupied > 0 ? "Occupied" : "Free"
        }));

        // Return Consolidated Summary
        res.json({
            venueId,
            totalBookings,
            nextBooking,
            courtStatus
        });

    } catch (error) {
        console.error("Error fetching employee summary:", error);
        res.status(500).json({ message: "Server error fetching summary." });
    }
};
