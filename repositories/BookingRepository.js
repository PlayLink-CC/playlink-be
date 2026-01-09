/**
 * Booking Repository
 *
 * Data access layer for booking-related database operations.
 * Uses parameterized queries to prevent SQL injection.
 *
 * Responsibilities:
 * - Direct database queries for booking data
 * - Booking creation and status updates
 * - Payment and participant management
 * - Returning raw database results
 * - Query parameterization for security
 *
 * @module repositories/BookingRepository
 */

import pool from "../config/dbconnection.js";

/**
 * Get venue details by venue ID
 *
 * Retrieves venue pricing and cancellation policy information
 * needed for booking creation.
 *
 * @async
 * @param {number} venueId - The venue ID to fetch
 * @returns {Promise<Object|null>} Venue object or null if not found
 * @returns {number} venue.venue_id - Venue ID
 * @returns {string} venue.name - Venue name
 * @returns {number} venue.price_per_hour - Price per hour
 * @returns {number} venue.cancellation_policy_id - Cancellation policy ID
 * @returns {number} venue.owner_id - Owner User ID
 * @throws {Error} Database connection error
 */
export const getVenueById = async (venueId) => {
  const [rows] = await pool.execute(
    "SELECT venue_id, name, price_per_hour, cancellation_policy_id, owner_id, custom_cancellation_policy, custom_refund_percentage, custom_hours_before_start FROM venues WHERE venue_id = ?",
    [venueId]
  );
  return rows[0] || null;
};

/**
 * Create a new booking with transaction support
 *
 * Creates a booking record with initial PENDING status.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {Object} data - Booking data
 * @param {number} data.venueId - Venue ID
 * @param {number} data.userId - User ID (creator)
 * @param {string} data.bookingStart - Start datetime (YYYY-MM-DD HH:MM:SS)
 * @param {string} data.bookingEnd - End datetime (YYYY-MM-DD HH:MM:SS)
 * @param {number} data.totalAmount - Total booking amount in LKR
 * @param {number} data.cancellationPolicyId - Cancellation policy ID
 * @returns {Promise<number>} The inserted booking ID
 * @throws {Error} Database query error
 */
export const createBooking = async (conn, {
  venueId,
  userId,
  bookingStart,
  bookingEnd,
  totalAmount,
  cancellationPolicyId,
  customCancellationPolicy,
  customRefundPercentage,
  customHoursBeforeStart,
  pointsUsed = 0,
  paidAmount = 0
}) => {
  const [result] = await conn.execute(
    `INSERT INTO bookings
     (venue_id, created_by, booking_start, booking_end, total_amount, status, cancellation_policy_id, custom_cancellation_policy, custom_refund_percentage, custom_hours_before_start, points_used, paid_amount)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
    [venueId, userId, bookingStart, bookingEnd, totalAmount, cancellationPolicyId, customCancellationPolicy || null, customRefundPercentage || null, customHoursBeforeStart || null, pointsUsed || 0, paidAmount || 0]
  );

  return result.insertId;
};

/**
 * Add a participant to a booking
 *
 * Adds a user as a booking participant with specified share amount.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {Object} data - Participant data
 * @param {number} data.bookingId - Booking ID
 * @param {number} data.userId - User ID
 * @param {number} data.shareAmount - Share amount in LKR
 * @param {number} [data.isInitiator=0] - Whether this is the booking initiator (1 or 0)
 * @returns {Promise<void>}
 * @throws {Error} Database query error
 */
export const addBookingParticipant = async (conn, {
  bookingId,
  userId,
  shareAmount,
  isInitiator = 0,
}) => {
  await conn.execute(
    `INSERT INTO booking_participants
     (booking_id, user_id, share_amount, is_initiator, invite_status, payment_status)
     VALUES (?, ?, ?, ?, 'ACCEPTED', 'PENDING')`,
    [bookingId, userId, shareAmount, isInitiator]
  );
};

/**
 * Create a payment record
 *
 * Records a payment entry with Stripe session reference.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {Object} data - Payment data
 * @param {number} data.bookingId - Booking ID
 * @param {number} data.payerId - Payer user ID
 * @param {number} data.amount - Payment amount in LKR
 * @param {string} data.currency - Currency code (e.g., 'LKR')
 * @param {string} data.providerReference - Stripe session ID
 * @returns {Promise<void>}
 * @throws {Error} Database query error
 */
export const createPayment = async (conn, {
  bookingId,
  payerId,
  amount,
  currency,
  providerReference,
}) => {
  await conn.execute(
    `INSERT INTO payments
     (booking_id, payer_id, amount, currency, payment_source, status, provider_reference)
     VALUES (?, ?, ?, ?, 'CARD', 'PENDING', ?)`,
    [bookingId, payerId, amount, currency, providerReference]
  );
};

/**
 * Update payment status
 *
 * Updates payment status for a given Stripe session.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {string} providerReference - Stripe session ID
 * @param {string} status - New payment status
 * @returns {Promise<void>}
 * @throws {Error} Database query error
 */
export const updatePaymentStatus = async (conn, providerReference, status) => {
  await conn.execute(
    "UPDATE payments SET status = ? WHERE provider_reference = ?",
    [status, providerReference]
  );
};

/**
 * Update booking status
 *
 * Updates booking status to confirmed or other states.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {number} bookingId - Booking ID
 * @param {string} status - New booking status
 * @returns {Promise<void>}
 * @throws {Error} Database query error
 */
export const updateBookingStatus = async (conn, bookingId, status) => {
  await conn.execute(
    "UPDATE bookings SET status = ? WHERE booking_id = ?",
    [status, bookingId]
  );
};

/**
 * Update booking participants payment status
 *
 * Updates payment status for all participants of a booking.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection with transaction support
 * @param {number} bookingId - Booking ID
 * @param {string} status - New payment status
 * @returns {Promise<void>}
 * @throws {Error} Database query error
 */
export const updateParticipantsPaymentStatus = async (conn, bookingId, status) => {
  await conn.execute(
    "UPDATE booking_participants SET payment_status = ? WHERE booking_id = ?",
    [status, bookingId]
  );
};

/**
 * Get booking details with venue information
 *
 * Fetches a complete booking record including associated venue details.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection
 * @param {number} bookingId - Booking ID
 * @returns {Promise<Object|null>} Booking object or null if not found
 * @returns {number} booking.booking_id - Booking ID
 * @returns {number} booking.venue_id - Venue ID
 * @returns {string} booking.booking_start - Start datetime
 * @returns {string} booking.booking_end - End datetime
 * @returns {number} booking.total_amount - Total amount
 * @returns {string} booking.status - Booking status
 * @returns {string} booking.venue_name - Venue name
 * @returns {string} booking.address - Venue address
 * @returns {string} booking.city - Venue city
 * @throws {Error} Database query error
 */
export const getBookingWithVenue = async (conn, bookingId) => {
  const [rows] = await conn.execute(
    `SELECT
      b.*,
      v.name AS venue_name,
      v.address,
      v.city
     FROM bookings b
     JOIN venues v ON b.venue_id = v.venue_id
     WHERE b.booking_id = ?`,
    [bookingId]
  );

  return rows[0] || null;
};

/**
 * Get booking with cancellation policy details
 *
 * @async
 * @param {number} bookingId
 * @returns {Promise<Object|null>}
 */
export const getBookingWithPolicy = async (bookingId) => {
  const [rows] = await pool.execute(
    `SELECT b.*,
            v.venue_id, v.owner_id,
            v.custom_cancellation_policy AS venue_custom_policy,
            v.custom_refund_percentage AS venue_refund_percentage,
            v.custom_hours_before_start AS venue_hours_before_start,
            cp.policy_id, cp.name as policy_name, cp.refund_percentage, cp.hours_before_start
     FROM bookings b
     JOIN venues v ON b.venue_id = v.venue_id
     LEFT JOIN cancellation_policies cp ON cp.policy_id = COALESCE(b.cancellation_policy_id, v.cancellation_policy_id)
     WHERE b.booking_id = ?`,
    [bookingId]
  );
  return rows[0] || null;
};

/**
 * Update booking cancellation status and time
 * 
 * @async
 * @param {Object} conn
 * @param {number} bookingId 
 * @param {string} cancellationTime
 */
export const updateBookingCancellation = async (conn, bookingId, cancellationTime) => {
  await conn.execute(
    "UPDATE bookings SET status = 'CANCELLED', cancellation_time = ? WHERE booking_id = ?",
    [cancellationTime, bookingId]
  );
};

/**
 * Update booking dates (Reschedule)
 * 
 * @async
 * @param {Object} conn
 * @param {number} bookingId
 * @param {string} start
 * @param {string} end
 */
export const updateBookingDates = async (conn, bookingId, start, end) => {
  await conn.execute(
    "UPDATE bookings SET booking_start = ?, booking_end = ? WHERE booking_id = ?",
    [start, end, bookingId]
  );
};

/**
 * Get all bookings for a user
 *
 * Fetches all bookings where user is a participant, with venue details.
 *
 * @async
 * @param {number} userId - User ID
 * @returns {Promise<Object[]>} Array of booking objects
 * @returns {number} bookings[].booking_id - Booking ID
 * @returns {string} bookings[].booking_start - Start datetime
 * @returns {string} bookings[].booking_end - End datetime
 * @returns {number} bookings[].total_amount - Total amount
 * @returns {string} bookings[].status - Booking status
 * @returns {string} bookings[].venue_name - Venue name
 * @returns {string} bookings[].venue_city - Venue city
 * @returns {string} bookings[].venue_address - Venue address
 * @returns {number} bookings[].share_amount - User's share amount
 * @returns {string} bookings[].payment_status - User's payment status
 * @returns {number} bookings[].is_initiator - Whether user is initiator (0 or 1)
 * @throws {Error} Database connection error
 */
export const getUserBookings = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT
       b.booking_id,
       b.booking_start,
       b.booking_end,
       b.total_amount,
       b.status,
       b.points_used,
       b.paid_amount,
       b.custom_refund_percentage,
       b.custom_hours_before_start,
       v.name   AS venue_name,
       v.city   AS venue_city,
       v.address AS venue_address,
       cp.refund_percentage,
       cp.hours_before_start,
       bp.share_amount,
       bp.payment_status,
       bp.is_initiator
     FROM booking_participants bp
     JOIN bookings b ON b.booking_id = bp.booking_id
     JOIN venues   v ON v.venue_id  = b.venue_id
     LEFT JOIN cancellation_policies cp ON COALESCE(b.cancellation_policy_id, v.cancellation_policy_id) = cp.policy_id
     WHERE bp.user_id = ?
     ORDER BY b.booking_start DESC`,
    [userId]
  );

  return rows;
};

export const createBlock = async (venueId, userId, startTime, endTime) => {
  const sql = `
        INSERT INTO bookings (venue_id, created_by, booking_start, booking_end, total_amount, status, cancellation_policy_id)
        VALUES (?, ?, ?, ?, 0, 'BLOCKED', 1)
    `;
  const [result] = await pool.execute(sql, [venueId, userId, startTime, endTime]);
  return result.insertId;
};

export const getPricingRules = async (venueId) => {
  const sql = `SELECT * FROM venue_pricing_rules WHERE venue_id = ?`;
  const [rows] = await pool.execute(sql, [venueId]);
  return rows;
};

/**
 * Check for booking conflicts in a time slot
 *
 * Checks if there are any CONFIRMED bookings that overlap
 * with the requested time slot for a specific venue.
 *
 * @async
 * @param {number} venueId - Venue ID
 * @param {string} startDateTime - Start datetime (YYYY-MM-DD HH:MM:SS)
 * @param {string} endDateTime - End datetime (YYYY-MM-DD HH:MM:SS)
 * @returns {Promise<boolean>} True if there's a conflict, false otherwise
 * @throws {Error} Database query error
 */
export const hasBookingConflict = async (venueId, startDateTime, endDateTime) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS conflict_count
     FROM bookings
     WHERE venue_id = ?
     AND status IN ('CONFIRMED', 'PENDING', 'BLOCKED')
     AND (
       (booking_start < ? AND booking_end > ?) OR
       (booking_start >= ? AND booking_start < ?) OR
       (booking_end > ? AND booking_end <= ?)
     )`,
    [venueId, endDateTime, startDateTime, startDateTime, endDateTime, startDateTime, endDateTime]
  );

  return rows[0].conflict_count > 0;
};

/**
 * Get all booked slots for a venue on a specific date
 *
 * Retrieves all confirmed and pending bookings for a venue
 * on a given date, useful for displaying availability calendar.
 *
 * @async
 * @param {number} venueId - Venue ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object[]>} Array of booking slots
 * @returns {string} slots[].booking_start - Start datetime
 * @returns {string} slots[].booking_end - End datetime
 * @returns {string} slots[].status - Booking status
 * @throws {Error} Database query error
 */
export const getBookedSlotsForDate = async (venueId, date) => {
  const [rows] = await pool.execute(
    `SELECT booking_start, booking_end, status
     FROM bookings
     WHERE venue_id = ?
     AND DATE(booking_start) = ?
     AND status IN ('CONFIRMED', 'PENDING', 'BLOCKED')
     ORDER BY booking_start ASC`,
    [venueId, date]
  );

  return rows;
};


/**
 * Get booking by payment provider reference (Stripe Session ID)
 *
 * Checks if a booking already exists for a given payment session.
 * Used for idempotency to prevent duplicate bookings.
 *
 * @async
 * @param {string} providerRef - Stripe session ID
 * @returns {Promise<Object|null>} Booking object if found
 */
export const getBookingByPaymentReference = async (providerRef) => {
  const [rows] = await pool.execute(
    `SELECT b.* 
     FROM bookings b
     JOIN payments p ON b.booking_id = p.booking_id
     WHERE p.provider_reference = ?
     LIMIT 1`,
    [providerRef]
  );
  return rows[0] || null;
};

/**
 * Get all bookings for an owner's venues
 *
 * Fetches all bookings for venues owned by the specified user
 *
 * @async
 * @param {number} ownerId - Owner User ID
 * @returns {Promise<Object[]>} Array of booking objects
 */
export const getOwnerBookings = async (ownerId) => {
  const [rows] = await pool.execute(
    `SELECT
       b.booking_id,
       b.booking_start,
       b.booking_end,
       b.total_amount,
       b.status,
       b.created_at,
       v.name AS venue_name,
       u.full_name AS customer_name,
       u.email AS customer_email
     FROM bookings b
     JOIN venues v ON b.venue_id = v.venue_id
     LEFT JOIN users u ON b.created_by = u.user_id
     WHERE v.owner_id = ?
     ORDER BY b.booking_start DESC`,
    [ownerId]
  );
  return rows;
};

/**
 * Get analytics summary for an owner
 *
 * Aggregates statistics for owner's venues:
 * - Total Bookings
 * - Total Revenue
 * - Active Venues Count
 *
 * @async
 * @param {number} ownerId - Owner User ID
 * @returns {Promise<Object>} Analytics summary object
 */
export const getOwnerAnalytics = async (ownerId) => {
  const [bookingStats] = await pool.execute(
    `SELECT
       COUNT(*) AS total_bookings,
       COALESCE(SUM(total_amount), 0) AS total_revenue
     FROM bookings b
     JOIN venues v ON b.venue_id = v.venue_id
     WHERE v.owner_id = ?
     AND b.status IN ('CONFIRMED', 'COMPLETED')`,
    [ownerId]
  );

  const [venueStats] = await pool.execute(
    `SELECT COUNT(*) AS active_venues
     FROM venues
     WHERE owner_id = ? AND is_active = 1`,
    [ownerId]
  );

  const [walletStats] = await pool.execute(
    `SELECT balance AS total_revenue 
     FROM wallets 
     WHERE user_id = ?`,
    [ownerId]
  );

  return {
    ...bookingStats[0],
    ...venueStats[0],
    total_revenue: Number(walletStats[0]?.total_revenue || 0)
  };
};

/**
 * Check if user has a completed booking for a venue
 *
 * @async
 * @param {number} userId - User ID
 * @param {number} venueId - Venue ID
 * @returns {Promise<boolean>} True if user has completed booking
 */
export const hasUserCompletedBooking = async (userId, venueId) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM bookings
     WHERE created_by = ?
     AND venue_id = ?
     AND status = 'COMPLETED'`, // Assuming 'COMPLETED' is the status for past bookings
    [userId, venueId]
  );
  return rows[0].count > 0;
};

/**
 * Get database pool connection
 *
 * Returns the connection pool for transaction management.
 * This allows the caller to manage transactions when needed.
 *
 * @returns {Object} Database connection pool
 */
export const getPool = () => {
  return pool;
};

/**
 * Get a booking participant record
 *
 * Checks if a user is already a participant in a booking.
 * Should be called within a transaction if lock is needed, but here we just read.
 *
 * @async
 * @param {Object} conn - Database connection
 * @param {number} bookingId - Booking ID
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Participant record or null
 */
export const getBookingParticipant = async (conn, bookingId, userId) => {
  const [rows] = await conn.execute(
    "SELECT * FROM booking_participants WHERE booking_id = ? AND user_id = ?",
    [bookingId, userId]
  );
  return rows[0] || null;
};

/**
 * Get all participants for a booking
 * 
 * @param {number} bookingId 
 * @returns {Promise<Array>} List of participants with share and status
 */
export const getBookingParticipants = async (bookingId) => {
  const [rows] = await pool.execute(
    `SELECT user_id, share_amount, is_initiator, payment_status 
     FROM booking_participants 
     WHERE booking_id = ?`,
    [bookingId]
  );
  return rows;
};
/**
 * Count active bookings for a venue
 * Status: CONFIRMED, PENDING, BLOCKED
 * 
 * @param {number} venueId 
 * @returns {Promise<number>}
 */
export const countActiveBookings = async (venueId) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count 
     FROM bookings 
     WHERE venue_id = ? 
     AND status IN ('CONFIRMED', 'PENDING')
     AND booking_end > NOW()`,
    [venueId]
  );
  return rows[0].count;
};

/**
 * Delete all bookings for a venue (Cleanup)
 * 
 * Deletes participants and payments first, then bookings.
 * Used when deleting a venue.
 * 
 * @param {number} venueId 
 */
export const deleteVenueBookings = async (venueId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 0. Delete wallet transactions linked to bookings of this venue
    await conn.execute(
      `DELETE wt FROM wallet_transactions wt
       INNER JOIN bookings b ON wt.booking_id = b.booking_id
       WHERE b.venue_id = ?`,
      [venueId]
    );

    // 1. Delete payments linked to bookings of this venue
    await conn.execute(
      `DELETE p FROM payments p
       INNER JOIN bookings b ON p.booking_id = b.booking_id
       WHERE b.venue_id = ?`,
      [venueId]
    );

    // 2. Delete participants linked to bookings of this venue
    await conn.execute(
      `DELETE bp FROM booking_participants bp
       INNER JOIN bookings b ON bp.booking_id = b.booking_id
       WHERE b.venue_id = ?`,
      [venueId]
    );

    // 3. Delete the bookings themselves
    await conn.execute(
      `DELETE FROM bookings WHERE venue_id = ?`,
      [venueId]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
