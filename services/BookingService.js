import * as BookingRepository from "../repositories/BookingRepository.js";
import * as WalletRepository from "../repositories/WalletRepository.js";
import * as DateUtil from "../utils/dateUtil.js";
import { toMySQLDateTime } from "../utils/dateUtil.js";

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

    if (booking.created_by !== userId) {
        throw new Error("Unauthorized: Only the booking creator can cancel.");
    }

    if (booking.status === 'CANCELLED') {
        throw new Error("Booking is already cancelled");
    }

    // Policy Check
    const now = new Date();
    const start = new Date(booking.booking_start);
    const hoursRemaining = (start - now) / (1000 * 60 * 60);

    if (hoursRemaining <= 0) {
        throw new Error("Cannot cancel a booking that has already started.");
    }

    // FIX: Use total_amount as the base for refund calculation.
    // In split payments or point payments, 'paid_amount' might be partial or 0 (if valid points logic wasn't fully capturing value).
    // The refund should be based on the VALUE of the booking.
    const baseAmount = Number(booking.total_amount);
    const policyHours = booking.hours_before_start || 0; // Default 0 if no policy
    const refundPct = booking.refund_percentage || 0;

    console.log(`[CancelBooking] ID:${bookingId} BaseAmount:${baseAmount} PolicyHours:${policyHours} RefundPct:${refundPct} HoursRemaining:${hoursRemaining}`);

    let playerRefund = 0;
    let ownerRevenueCut = 0;

    // Step B: The Math
    if (hoursRemaining > policyHours) {
        // Full Refund
        playerRefund = baseAmount;
        ownerRevenueCut = 0;
    } else {
        // Partial Refund (e.g. 90%)
        // Partial Refund (e.g. 90%)
        // player_refund = bookings.total_amount * (refund_percentage / 100)
        // owner_revenue_cut = bookings.total_amount * (1 - (refund_percentage / 100))
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
            await WalletRepository.updateWalletBalance(conn, userId, initiatorRefund);
            await WalletRepository.createTransaction(conn, {
                userId,
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

    const start = new Date(`${newDate}T${newTime}:00`);
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
    const hasConflict = await BookingRepository.hasBookingConflict(booking.venue_id, newStartStr, newEndStr);

    // Note: hasBookingConflict counts *all* confirmed/pending bookings.
    // It might count *this* booking itself as a conflict if we don't exclude it?
    // The current query in Repository logic:
    // SELECT COUNT(*) ... WHERE ... (booking_start < ? AND booking_end > ?) ...
    // If we are *changing* the time, the *old* time slot is in the DB.
    // If the *new* time slot overlaps with the *old* time slot of the *same* booking, is that a conflict?
    // Yes, essentially. BUT we are updating this booking. 
    // Wait, if it overlaps with *itself*, we should ignore *itself*.
    // BookingRepository.hasBookingConflict DOES NOT exclude current bookingId.
    // This is a potential bug if rescheduling to an overlapping time (e.g. shift by 1 hour).
    // We should fix hasBookingConflict or create a variant that excludes a bookingId.
    // For now, let's assume we can add an optional excludeBookingId param to Repo?
    // Or we just check. If `hasConflict` returns true, we dig deeper?
    // NO, let's modify `BookingRepository.js` logic for `hasBookingConflict` to accept `excludeBookingId`.

    // I will assume I'll update Repo first or pass it. 
    // To proceed without blocking, I'll rely on the standard check. If user moves to a completely different slot, it works.
    // If they shift slightly (overlap old self), it fails. This is an edge case but acceptable for MVP?
    // No, "I want to move it 1 hour later" is a common use case.
    // I NEED to exclude `bookingId`.
    // I'll update `BookingRepository.js` to accept `excludeBookingId`.

    if (hasConflict) {
        // We'll trust the repo check for now, but I really should exclude self.
        // Let's see if I can do it in the next step.
        // For now, let's use the repo as is.
        // Wait, if I can't change repo signature easily without breaking others...
        // `hasBookingConflict` is used in Controller too.
        // I'll add `excludeBookingId` as optional param.
    }

    const conn = await BookingRepository.getPool().getConnection();
    try {
        await conn.beginTransaction();

        // We should ideally lock the row or re-check conflict inside transaction with "exclude self".
        // Let's implement a specific query here if Repo update is too much context switch?
        // No, using Repo is better.

        // Let's blindly check conflict again but excluding self.
        const [rows] = await conn.execute(
            `SELECT COUNT(*) AS conflict_count
             FROM bookings
             WHERE venue_id = ?
             AND status IN ('CONFIRMED', 'PENDING', 'BLOCKED')
             AND booking_id != ? 
             AND (
               (booking_start < ? AND booking_end > ?) OR
               (booking_start >= ? AND booking_start < ?) OR
               (booking_end > ? AND booking_end <= ?)
             )`,
            [booking.venue_id, bookingId, newEndStr, newStartStr, newStartStr, newEndStr, newStartStr, newEndStr]
        );

        if (rows[0].conflict_count > 0) {
            throw new Error("Time slot unavailable");
        }

        await BookingRepository.updateBookingDates(conn, bookingId, newStartStr, newEndStr);
        await conn.commit();

        return { success: true, message: "Booking rescheduled successfully" };

    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
};
