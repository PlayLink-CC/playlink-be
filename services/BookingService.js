import * as BookingRepository from "../repositories/BookingRepository.js";
import * as WalletRepository from "../repositories/WalletRepository.js";
import * as CourtRepository from "../repositories/CourtRepository.js";
import * as DateUtil from "../utils/dateUtil.js";
import { toMySQLDateTime, createISTDate } from "../utils/dateUtil.js";

/**
 * Booking Service
 * 
 * Handles complex booking logic including cancellation, refunds, and rescheduling.
 */

/**
 * Cancel a booking and process refund if applicable.
 * 
 * @param {number} bookingId 
 * @param {number} userId - The user initiating the cancel (must be creator/initiator)
 * @returns {Promise<Object>} Result with refund amount and message
 */
export const cancelBooking = async (bookingId, userId) => {
    const booking = await BookingRepository.getBookingWithPolicy(bookingId);

    if (!booking) {
        throw new Error("Booking not found");
    }

    const isOwner = booking.owner_id === userId;

    if (booking.created_by !== userId && !isOwner) {
        throw new Error("Unauthorized: Only the booking creator or venue owner can cancel.");
    }

    if (booking.status === 'CANCELLED') {
        throw new Error("Booking is already cancelled");
    }

    // Handle Unblocking (Venue Owner)
    if (booking.status === 'BLOCKED') {
        const pool = BookingRepository.getPool();
        const conn = await pool.getConnection();
        try {
            const cancelTime = toMySQLDateTime(new Date());
            await BookingRepository.updateBookingCancellation(conn, bookingId, cancelTime);
            return { message: "Slot unblocked successfully", refundAmount: 0 };
        } finally {
            conn.release();
        }
    }

    // Policy Check
    const now = new Date();
    const start = new Date(booking.booking_start);
    const hoursRemaining = (start - now) / (1000 * 60 * 60);

    // Only prevent cancellation if it's the PLAYER trying to cancel after start
    if (!isOwner && hoursRemaining <= 0) {
        throw new Error("Cannot cancel a booking that has already started.");
    }

    // FIX: Use total_amount as the base for refund calculation.
    // In split payments or point payments, 'paid_amount' might be partial or 0 (if valid points logic wasn't fully capturing value).
    // The refund should be based on the VALUE of the booking.
    const baseAmount = Number(booking.total_amount);
    // Step B: The Math
    let policyHours = booking.hours_before_start || 0;
    let refundPct = booking.refund_percentage || 0;
    let playerRefund = 0;
    let ownerRevenueCut = 0;

    if (isOwner) {
        refundPct = 100;
        playerRefund = baseAmount;
        ownerRevenueCut = 0;
    } else {
        // PLAYER CANCELLATION
        // Override with custom policy if present on booking (snapshot)
        if (booking.custom_refund_percentage !== null && booking.custom_refund_percentage !== undefined) {
            refundPct = booking.custom_refund_percentage;
            policyHours = booking.custom_hours_before_start || 0;
            console.log(`[CancelBooking] Using Custom Booking Policy: Refund ${refundPct}% if > ${policyHours}hrs`);
        } else if (booking.custom_cancellation_policy) {
            // Fallback for legacy custom text policies (if any exist without structured data)
            console.log(`[CancelBooking] Legacy Custom Policy (Text Only). Defaulting to 0% automated refund.`);
            refundPct = 0;
            policyHours = 0;
        }
    }

    if (hoursRemaining > policyHours) {
        // Full Refund (Before the cut-off window)
        // Actually, wait. Standard Policy logic is:
        // "Refund X% within Y hours".
        // Usually it means:
        // If > Y hours remaining: 100% Refund?
        // Or is the policy "X% refund if cancelled MORE than Y hours before"?
        // Let's check standard policy data.
        // Example: "Refund 50% within 24 hours" usually means if you cancel *within* the last 24h, you get 50%. Before that you get 100%.
        // The previous code had:
        // if (hoursRemaining > policyHours) { playerRefund = baseAmount; } else { ... use refundPct ... }
        // This implies: Outside the window = 100% refund. Inside the window = Policy % refund.

        playerRefund = baseAmount;
        ownerRevenueCut = 0;
    } else {
        // Inside the restricted window
        // Apply the Refund Percentage
        const decimalRefund = Number(refundPct) / 100;
        playerRefund = baseAmount * decimalRefund;
        ownerRevenueCut = baseAmount * (1 - decimalRefund);
    }

    // Atomic Transaction
    const pool = BookingRepository.getPool();
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Update Booking Status
        const cancelTime = toMySQLDateTime(now);
        await BookingRepository.updateBookingCancellation(conn, bookingId, cancelTime);

        // 2. Distribute Refunds
        const participants = await BookingRepository.getBookingParticipants(bookingId);
        let totalRefundPool = playerRefund; // Total amount to be refunded
        let othersRefundTotal = 0;

        for (const p of participants) {
            // Refund non-initiators who have PAID
            if (!p.is_initiator && p.payment_status === 'PAID') {
                const pRefund = Number(p.share_amount) * (hoursRemaining > policyHours ? 1 : Number(refundPct) / 100);

                await WalletRepository.updateWalletBalance(conn, p.user_id, pRefund);
                await WalletRepository.createTransaction(conn, {
                    userId: p.user_id,
                    amount: pRefund,
                    type: 'CREDIT',
                    description: `Refund for Booking #${bookingId} (${hoursRemaining > policyHours ? '100' : refundPct}% policy)`,
                    referenceType: 'REFUND',
                    referenceId: bookingId
                });

                othersRefundTotal += pRefund;
            }
        }

        // 3. Final Initiator Credit (Remainder of the pool)
        const initiatorRefund = totalRefundPool - othersRefundTotal;

        if (initiatorRefund > 0) {
            // FIX: Credit the refund to the Booking Creator (Customer), not necessarily the person cancelling (who might be the Owner)
            const beneficiaryId = booking.created_by;

            await WalletRepository.updateWalletBalance(conn, beneficiaryId, initiatorRefund);
            await WalletRepository.createTransaction(conn, {
                userId: beneficiaryId,
                amount: initiatorRefund,
                type: 'CREDIT',
                description: `Refund for Booking #${bookingId} (Initiator Share)`,
                referenceType: 'REFUND',
                referenceId: bookingId
            });
        }

        // 3.5 Deduct from Venue Owner
        if (booking.owner_id && playerRefund > 0) {
            // Deduct the Player Refund from Owner.
            // Since Owner has 100% of Paid Amount, deducting Player Refund leaves them with Owner Cut.
            // Owner Balance = (Initial + Paid) - PlayerRefund = Initial + OwnerCut.
            await WalletRepository.updateWalletBalance(conn, booking.owner_id, -playerRefund);
            await WalletRepository.createTransaction(conn, {
                userId: booking.owner_id,
                amount: -playerRefund,
                type: 'DEBIT',
                description: `Refund Deduction for Booking #${bookingId}`,
                referenceType: 'REFUND_DEDUCTION',
                referenceId: bookingId
            });
        }

        // 4. Update Participants / Payments Status
        const status = playerRefund > 0 ? 'REFUNDED' : 'CANCELLED';
        await BookingRepository.updateParticipantsPaymentStatus(conn, bookingId, status);
        await conn.execute("UPDATE payments SET status = ? WHERE booking_id = ? AND status = 'SUCCEEDED'", ['REFUNDED', bookingId]);

        await conn.commit();

        return {
            success: true,
            refundAmount: playerRefund,
            message: playerRefund > 0
                ? `Booking cancelled. Refunds processed to wallets.`
                : "Booking cancelled. No refund applicable."
        };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

/**
 * Reschedule a booking to a new time.
 * 
 * @param {number} bookingId 
 * @param {number} userId 
 * @param {string} newDate (YYYY-MM-DD)
 * @param {string} newTime (HH:MM)
 * @param {number} hours 
 */
export const rescheduleBooking = async (bookingId, userId, newDate, newTime, hours) => {
    const booking = await BookingRepository.getBookingWithPolicy(bookingId); // get basic info
    if (!booking) throw new Error("Booking not found");
    if (booking.created_by !== userId) throw new Error("Unauthorized");
    if (booking.status !== 'CONFIRMED') throw new Error("Can only reschedule CONFIRMED bookings");

    const start = createISTDate(newDate, newTime);
    const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);

    // Basic Time Validations
    if (!start) throw new Error("Invalid date or time");

    // Check operating hours (7am-10pm) etc.
    // Re-use `getTimeValidationError` logic but we have separate params here.
    // We can call the helper functions directly:
    if (!DateUtil.isValid15MinInterval(newTime)) {
        throw new Error("Times must be in 15-minute intervals");
    }
    if (!DateUtil.isWithinBookingWindow(newTime)) {
        throw new Error("Booking must start between 7:00 AM and 10:00 PM");
    }
    if (!DateUtil.doesBookingFitInWindow(newTime, hours)) {
        throw new Error("Booking must end by 10:00 PM");
    }

    const now = new Date();

    if (start <= now) throw new Error("New time must be in the future");

    const newStartStr = toMySQLDateTime(start);
    const newEndStr = toMySQLDateTime(end);

    // Conflict Check
    const availableCourtId = await findAvailableCourt(booking.venue_id, newStartStr, newEndStr, booking.sport_id, bookingId);
    if (!availableCourtId) throw new Error("No courts available for this sport.");

    const conn = await BookingRepository.getPool().getConnection();
    try {
        await conn.beginTransaction();
        const hasConflict = await BookingRepository.hasBookingConflict(booking.venue_id, newStartStr, newEndStr, availableCourtId, bookingId);
        if (hasConflict) throw new Error("Slot taken during processing");

        await BookingRepository.updateBookingDetails(conn, bookingId, {
            courtId: availableCourtId,
            bookingStart: newStartStr,
            bookingEnd: newEndStr
        });
        await conn.commit();
        return { success: true, message: "Booking rescheduled successfully", newCourtId: availableCourtId };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};

/**
 * Get available time slots for a venue and sport, considering multiple courts.
 * 
 * @param {number} venueId 
 * @param {string} date (YYYY-MM-DD)
 * @param {number} hours 
 * @param {number} sportId 
 */
export const getAvailableTimeSlots = async (venueId, date, hours, sportId) => {
    const duration = Number(hours);

    // 1. Get all courts supporting this sport at this venue
    const courts = await CourtRepository.getCourtsByVenueAndSport(venueId, sportId);
    if (courts.length === 0) {
        return []; // No courts support this sport
    }

    // 2. Get ALL booked slots for these courts on this date
    const allSlots = await BookingRepository.getBookedSlotsForDate(venueId, date);

    // Define operating hours (7 AM to 10 PM)
    const openTime = 7 * 60;
    const closeTime = 22 * 60;
    const step = 60; // 1 hour intervals

    const availableSlots = [];
    const now = new Date();

    // 3. Generate all possible start times
    for (let time = openTime; time <= closeTime - (duration * 60); time += step) {
        const h = Math.floor(time / 60);
        const m = time % 60;
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

        const startDateTime = new Date(`${date}T${timeStr}:00`);
        const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);

        if (startDateTime <= now) {
            availableSlots.push({ time: timeStr, available: false });
            continue;
        }

        // A slot is available if AT LEAST ONE court is free
        let isAnyCourtFree = false;

        for (const court of courts) {
            // Check if THIS specific court is free
            const courtConflicts = allSlots.filter(s =>
                (s.court_id === court.court_id || s.court_id === null) &&
                (startDateTime < new Date(s.booking_end) && endDateTime > new Date(s.booking_start))
            );

            if (courtConflicts.length === 0) {
                isAnyCourtFree = true;
                break;
            }
        }

        availableSlots.push({ time: timeStr, available: isAnyCourtFree });
    }

    return availableSlots;
};

/**
 * Find an available court for a specific time and sport.
 * Useful for assigning a court during booking creation.
 * 
 * @param {number} venueId 
 * @param {string} startStr (MySQL DateTime)
 * @param {string} endStr (MySQL DateTime)
 * @param {number} sportId 
 * @param {number} excludeBookingId (Optional)
 * @returns {Promise<number|null>} Court ID or null if none available
 */
export const findAvailableCourt = async (venueId, startStr, endStr, sportId, excludeBookingId = null) => {
    const courts = await CourtRepository.getCourtsByVenueAndSport(venueId, sportId);
    if (courts.length === 0) return null;

    const start = new Date(startStr);
    const end = new Date(endStr);

    const allSlots = await BookingRepository.getBookedSlotsForDate(venueId, startStr.split(' ')[0]);

    for (const court of courts) {
        const courtConflicts = allSlots.filter(s =>
            (s.court_id === court.court_id || s.court_id === null) &&
            (s.booking_id !== excludeBookingId) &&
            (start < new Date(s.booking_end) && end > new Date(s.booking_start))
        );

        if (courtConflicts.length === 0) {
            return court.court_id;
        }
    }

    return null;
};
