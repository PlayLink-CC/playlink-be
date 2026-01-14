/**
 * Split Payment Service
 *
 * Encapsulates core business logic for split payments and Playlink Points.
 *
 * Responsibilities:
 * - Calculate split shares
 * - Orchestrate booking participants setup
 * - Handle reimbursement to initiator logic
 */

import * as BookingRepository from "../repositories/BookingRepository.js";
import * as UserRepository from "../repositories/UserRepository.js";
import * as WalletRepository from "../repositories/WalletRepository.js";
import pool from "../config/dbconnection.js";

/**
 * Calculate equal share amount
 * 
 * @param {number} totalAmount 
 * @param {number} participantCount - Number of invited friends (excluding initiator)
 * @returns {number} Share per person including initiator
 */
export const calculateShares = (totalAmount, participantCount) => {
    if (participantCount <= 0) return totalAmount;
    // total people = invitees + initiator
    const totalPeople = participantCount + 1;
    // Round to 2 decimal places
    return Math.round((totalAmount / totalPeople) * 100) / 100;
};

import { randomUUID } from 'crypto';
import * as EmailUtil from "../utils/emailUtil.js";

/**
 * Setup Booking Splits
 * 
 * Adds invited users as participants to the booking.
 * Handles both registered users and guest invites.
 * 
 * @param {number} bookingId 
 * @param {number} initiatorId 
 * @param {string[]} inviteeEmails 
 * @param {number} shareAmount 
 */
export const setupBookingSplits = async (bookingId, initiatorId, inviteeEmails, shareAmount, externalConn = null) => {
    if (!inviteeEmails || inviteeEmails.length === 0) return;

    const conn = externalConn || await pool.getConnection();

    try {
        if (!externalConn) {
            await conn.beginTransaction();
        }

        // 1. Resolve Emails to User IDs
        const existingUsers = await UserRepository.findIdsByEmails(inviteeEmails);
        const existingEmails = new Set(existingUsers.map(u => u.email));

        // 2. Add Existing Users
        for (const user of existingUsers) {
            if (user.user_id === initiatorId) continue;

            await BookingRepository.addBookingParticipant(conn, {
                bookingId,
                userId: user.user_id,
                shareAmount: shareAmount,
                isInitiator: 0
            });
        }

        // 3. Handle Guest Users (Emails not found in DB)
        const guestEmails = inviteeEmails.filter(email => !existingEmails.has(email));

        for (const email of guestEmails) {
            const token = randomUUID(); // Generate unique token

            await BookingRepository.addBookingParticipant(conn, {
                bookingId,
                userId: null,
                shareAmount: shareAmount,
                isInitiator: 0,
                guestEmail: email,
                inviteToken: token
            });

            // Send Invitation Email
            // Note: Sending email inside transaction/loop might be slow but ensuring DB consistency first is key.
            // Ideally should queue this, but for now we await or fire-and-forget?
            // User requested "Trigger an email invitation".
            // We'll fire and forget to not block transaction too much, or await if critical.
            // Let's await for reliability in this scope.
            try {
                // Get initiator name for better email context? We only have ID here.
                // We'll pass generic name or fetch it? 
                // For performance, let's just pass "A friend" or fetch it once above if needed.
                // But simplified:
                await EmailUtil.sendInvitationEmail(email, token);
            } catch (e) {
                console.error(`Failed to send invite email to ${email}`, e);
                // Continue transaction? Yes, participant is added.
            }
        }

        // 4. Update Initiator's share amount
        await conn.execute(
            "UPDATE booking_participants SET share_amount = ? WHERE booking_id = ? AND user_id = ?",
            [shareAmount, bookingId, initiatorId]
        );

        if (!externalConn) {
            await conn.commit();
        }
    } catch (err) {
        if (!externalConn) {
            await conn.rollback();
        }
        console.error("Error setting up booking splits:", err);
        throw err;
    } finally {
        if (!externalConn) {
            conn.release();
        }
    }
};

/**
 * Execute Reimbursement
 * 
 * Logic:
 * 1. Verify participant payment (handled by caller/BookingController usually, but we check here too if needed).
 * 2. Mark participant as PAID.
 * 3. Credit Initiator's wallet.
 * 4. Record Transaction.
 * 
 * @param {number} participantUserId 
 * @param {number} bookingId 
 * @param {number} amountPaid 
 */
export const executeReimbursement = async (participantUserId, bookingId, amountPaid) => {
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Get Booking & Initiator Info
        // We need to find who the initiator is for this booking
        // We can query booking_participants where is_initiator = 1
        const [rows] = await conn.execute(
            "SELECT user_id FROM booking_participants WHERE booking_id = ? AND is_initiator = 1",
            [bookingId]
        );

        if (rows.length === 0) throw new Error("Booking initiator not found");
        const initiatorId = rows[0].user_id;

        // 2. Update Participant Status to PAID
        await conn.execute(
            "UPDATE booking_participants SET payment_status = 'PAID' WHERE booking_id = ? AND user_id = ?",
            [bookingId, participantUserId]
        );

        // 3. Credit Initiator Wallet
        await WalletRepository.updateWalletBalance(conn, initiatorId, amountPaid);

        // Fetch Payer Name for Description
        const [payerRows] = await conn.execute("SELECT full_name FROM users WHERE user_id = ?", [participantUserId]);
        const payerName = payerRows[0] ? payerRows[0].full_name : "Participant";

        // 4. Record Transaction for Initiator (Credit from Split)
        await WalletRepository.createTransaction(conn, {
            userId: initiatorId,
            amount: amountPaid,
            type: "CREDIT",
            description: `Reimbursement from ${payerName} (Booking #${bookingId})`,
            referenceType: "BOOKING_REIMBURSEMENT",
            referenceId: bookingId
        });

        await conn.commit();
        return true;
    } catch (err) {
        await conn.rollback();
        console.error("Error executing reimbursement:", err);
        throw err;
    } finally {
        conn.release();
    }
};
