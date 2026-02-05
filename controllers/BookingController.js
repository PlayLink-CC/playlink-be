import stripe from "../config/stripe.js";
import {
  toMySQLDateTime,
  isValid15MinInterval,
  isWithinBookingWindow,
  doesBookingFitInWindow,
  getTimeValidationError,
  createISTDate
} from "../utils/dateUtil.js";
import * as BookingRepository from "../repositories/BookingRepository.js";
import * as WalletRepository from "../repositories/WalletRepository.js";
import * as SplitPaymentService from "../services/SplitPaymentService.js";
import * as BookingService from "../services/BookingService.js";
import { calculateDynamicPrice } from "../services/VenueService.js";
import * as CourtRepository from "../repositories/CourtRepository.js";


// Helper to group contiguous 1-hour slots
const groupContiguousSlots = (slots) => {
  if (!slots || !slots.length) return [];
  // Ensure slots are unique and sorted
  const uniqueSlots = [...new Set(slots)];
  const sorted = uniqueSlots.sort();
  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const [prevH, prevM] = prev.split(':').map(Number);
    const [currH, currM] = curr.split(':').map(Number);

    if (currH * 60 + currM === prevH * 60 + prevM + 60) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);
  return groups.map(group => ({
    time: group[0],
    hours: group.length
  }));
};

/**
 * POST /api/bookings/checkout-session
 *
 * Body: { venueId, date: "YYYY-MM-DD", slots: ["HH:MM", ...], invites: ["email1", ...], useWallet: boolean }
 */
export const createCheckoutSession = async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;

  const { venueId, date, slots, sportId, invites: rawInvites = [], useWallet = false } = req.body;
  const invites = rawInvites.filter(email => email !== userEmail);

  if (!venueId || !date || !slots || !slots.length) {
    return res.status(400).json({ message: "Missing booking details (venue, date, or slots)" });
  }

  try {
    const venue = await BookingRepository.getVenueById(venueId);
    if (!venue) return res.status(404).json({ message: "Venue not found" });

    const groups = groupContiguousSlots(slots);
    const bookingDetails = [];
    let totalAmount = 0;

    for (const group of groups) {
      const { time, hours } = group;

      const timeError = getTimeValidationError(time, hours);
      if (timeError) {
        return res.status(400).json({ message: `Invalid time for slot ${time}: ${timeError}` });
      }

      const start = createISTDate(date, time);
      const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
      const startStr = toMySQLDateTime(start);
      const endStr = toMySQLDateTime(end);

      const availableCourtId = await BookingService.findAvailableCourt(venueId, startStr, endStr, sportId);
      if (!availableCourtId) {
        return res.status(409).json({ message: `Slot ${time} (${hours}h) is no longer available.` });
      }

      const amount = await calculateDynamicPrice(venue, date, time, hours);
      totalAmount += amount;

      bookingDetails.push({
        time,
        hours,
        startStr,
        endStr,
        courtId: availableCourtId,
        amount
      });
    }

    const shareAmount = SplitPaymentService.calculateShares(totalAmount, invites.length);

    let pointsUsed = 0;
    let stripeAmount = totalAmount;

    if (useWallet) {
      const walletBalance = await WalletRepository.getWalletBalance(userId);
      if (walletBalance > 0) {
        pointsUsed = Math.min(walletBalance, totalAmount);
        stripeAmount = totalAmount - pointsUsed;
      }
    }

    // If fully covered by points, handle internally
    if (stripeAmount <= 0) {
      const pool = BookingRepository.getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Deduct Points
        await WalletRepository.updateWalletBalance(conn, userId, -totalAmount);
        await WalletRepository.createTransaction(conn, {
          userId,
          amount: -totalAmount,
          type: "DEBIT",
          description: `Multi-slot Booking payment (Points) for ${venue.name}`,
          referenceType: "BOOKING_PAYMENT_FULL"
        });

        const bookingIds = [];
        for (const b of bookingDetails) {
          const bookingId = await BookingRepository.createBooking(conn, {
            venueId,
            courtId: b.courtId,
            sportId: sportId,
            userId,
            bookingStart: b.startStr,
            bookingEnd: b.endStr,
            totalAmount: b.amount,
            cancellationPolicyId: venue.cancellation_policy_id,
            customCancellationPolicy: venue.custom_cancellation_policy,
            customRefundPercentage: venue.custom_refund_percentage,
            customHoursBeforeStart: venue.custom_hours_before_start,
            pointsUsed: b.amount,
            paidAmount: 0
          });

          await BookingRepository.addBookingParticipant(conn, {
            bookingId, userId, shareAmount: b.amount / (invites.length + 1), isInitiator: 1, paymentStatus: 'PAID'
          });

          await SplitPaymentService.setupBookingSplits(bookingId, userId, invites, b.amount / (invites.length + 1), conn);
          await BookingRepository.updateBookingStatus(conn, bookingId, "CONFIRMED");

          await BookingRepository.createPayment(conn, {
            bookingId, payerId: userId, amount: b.amount, currency: "LKR", providerReference: `POINTS_FULL_${Date.now()}`
          });

          bookingIds.push(bookingId);
        }

        // Credit Owner
        if (venue.owner_id) {
          await WalletRepository.updateWalletBalance(conn, venue.owner_id, totalAmount);
          await WalletRepository.createTransaction(conn, {
            userId: venue.owner_id, amount: totalAmount, type: 'CREDIT',
            description: `Revenue from Multi-slot Booking. IDs: ${bookingIds.join(',')}`,
            referenceType: 'BOOKING_REVENUE',
            referenceId: bookingIds[0]
          });
        }

        await conn.commit();
        return res.json({ success: true, bookingIds, message: "Bookings confirmed with Points!" });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }

    // Stripe Session for Remainder
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [{
        price_data: {
          currency: "lkr",
          product_data: { name: `Booking at ${venue.name} (Partial Payment)` },
          unit_amount: Math.round(stripeAmount * 100),
        },
        quantity: 1,
      }],
      metadata: {
        type: 'MULTI_BOOKING',
        venue_id: String(venueId),
        user_id: String(userId),
        group_data: JSON.stringify(bookingDetails.map(b => ({
          t: b.time, h: b.hours, c: b.courtId, a: b.amount, s: b.startStr, e: b.endStr
        }))),
        sport_id: String(sportId),
        invites: JSON.stringify(invites),
        total_amount: String(totalAmount),
        points_used: String(pointsUsed),
        owner_id: String(venue.owner_id)
      },
      success_url: `${process.env.FRONTEND_URL}/booking-summary?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/create-booking`, // Redirect back to create booking
    });

    return res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Error creating checkout session", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const handleCheckoutSuccess = async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ message: "Missing session_id" });

  try {
    // 0) Idempotency Check
    const existing = await BookingRepository.getBookingByPaymentReference(session_id);
    if (existing) {
      const fullBooking = await BookingRepository.getBookingWithVenue(BookingRepository.getPool(), existing.booking_id);
      return res.json({ success: true, booking: fullBooking });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== "paid") return res.status(400).json({ message: "Payment not completed" });

    const { type, venue_id, user_id, owner_id, sport_id, group_data, invites, total_amount, booking_id, points_used } = session.metadata;

    const pool = BookingRepository.getPool();
    const conn = await pool.getConnection();

    // === HANDLE SHARE PAYMENT ===
    if (type === 'SHARE_PAYMENT') {
      try {
        await SplitPaymentService.executeReimbursement(Number(user_id), Number(booking_id), Number(session.amount_total) / 100);
        await BookingRepository.createPayment(conn, {
          bookingId: Number(booking_id),
          payerId: Number(user_id),
          amount: Number(session.amount_total) / 100,
          currency: "LKR",
          providerReference: session.id,
        });
        await BookingRepository.updatePaymentStatus(conn, session.id, 'SUCCEEDED');
        conn.release();
        return res.json({ success: true, message: "Share paid via Stripe" });
      } catch (err) {
        console.error("Error processing share payment", err);
        conn.release();
        return res.status(500).json({ message: "Error processing payment" });
      }
    }

    // === HANDLE MULTI BOOKING ===
    if (type === 'MULTI_BOOKING') {
      const groups = JSON.parse(group_data);
      const inviteeList = invites ? JSON.parse(invites) : [];

      try {
        await conn.beginTransaction();
        const venue = await BookingRepository.getVenueById(venue_id);
        const bookingIds = [];

        for (const g of groups) {
          // Double check if a booking for this specific slot-start already exists for this session
          const [check] = await conn.execute(
            "SELECT 1 FROM bookings b JOIN payments p ON b.booking_id = p.booking_id WHERE p.provider_reference = ? AND b.booking_start = ?",
            [session.id, g.s]
          );
          if (check.length > 0) continue;

          // Calculate approximate points/cash per booking for record
          const ratio = Number(g.a) / Number(total_amount);
          const pointsForThis = (points_used ? Number(points_used) : 0) * ratio;
          const cashForThis = Number(g.a) - pointsForThis;

          const bookingId = await BookingRepository.createBooking(conn, {
            venueId: Number(venue_id),
            courtId: Number(g.c),
            sportId: Number(sport_id),
            userId: Number(user_id),
            bookingStart: g.s,
            bookingEnd: g.e,
            totalAmount: Number(g.a),
            cancellationPolicyId: venue.cancellation_policy_id,
            customCancellationPolicy: venue.custom_cancellation_policy,
            customRefundPercentage: venue.custom_refund_percentage,
            customHoursBeforeStart: venue.custom_hours_before_start,
            pointsUsed: pointsForThis,
            paidAmount: cashForThis
          });

          const share = Number(g.a) / (inviteeList.length + 1);
          await BookingRepository.addBookingParticipant(conn, {
            bookingId, userId: Number(user_id), shareAmount: share, isInitiator: 1, paymentStatus: 'PAID'
          });

          await SplitPaymentService.setupBookingSplits(bookingId, user_id, inviteeList, share, conn);
          await BookingRepository.updateBookingStatus(conn, bookingId, "CONFIRMED");
          await BookingRepository.createPayment(conn, {
            bookingId, payerId: user_id, amount: Number(g.a), currency: "LKR", providerReference: session.id
          });
          bookingIds.push(bookingId);
        }

        const pointsUsedVal = points_used ? Number(points_used) : 0;
        const totalAmountVal = Number(total_amount);

        // Deduct points if used
        if (pointsUsedVal > 0) {
          // Check balance first? For robustness, assume validation happened at creation, but race condition possible.
          // If fail, we still have stripe payment... complex.
          // Let's deduct.
          await WalletRepository.updateWalletBalance(conn, Number(user_id), -pointsUsedVal);
          await WalletRepository.createTransaction(conn, {
            userId: Number(user_id),
            amount: -pointsUsedVal,
            type: "DEBIT",
            description: `Part-payment (Points) for Booking IDs: ${bookingIds.join(',')}`,
            referenceType: "BOOKING_PAYMENT_PARTIAL",
            referenceId: bookingIds[0]
          });
        }

        if (owner_id) {
          await WalletRepository.updateWalletBalance(conn, Number(owner_id), totalAmountVal);
          await WalletRepository.createTransaction(conn, {
            userId: Number(owner_id), amount: totalAmountVal, type: 'CREDIT',
            description: `Revenue from Multi-slot Booking. IDs: ${bookingIds.join(',')}`,
            referenceType: 'BOOKING_REVENUE',
            referenceId: bookingIds[0] // Link to first for ref
          });
        }

        await conn.commit();
        const firstBooking = await BookingRepository.getBookingWithVenue(conn, bookingIds[0]);
        conn.release();
        return res.json({ success: true, bookingIds, booking: firstBooking });
      } catch (err) {
        await conn.rollback();
        conn.release();
        throw err;
      }
    }

    conn.release();
    return res.json({ message: "Processed" });
  } catch (err) {
    console.error("Checkout Success error", err);
    return res.status(500).json({ message: err.message });
  }
};



export const createPaymentIntent = async (req, res) => {
  const userId = req.user.id;
  const userEmail = req.user.email;
  const { venueId, date, slots, sportId, invites: rawInvites = [], useWallet = false } = req.body;
  const invites = rawInvites.filter(email => email !== userEmail);

  if (!venueId || !date || !slots || !slots.length) {
    return res.status(400).json({ message: "Missing booking details" });
  }

  try {
    const venue = await BookingRepository.getVenueById(venueId);
    if (!venue) return res.status(404).json({ message: "Venue not found" });

    const groups = groupContiguousSlots(slots);
    const bookingDetails = [];
    let totalAmount = 0;

    for (const group of groups) {
      const { time, hours } = group;

      const timeError = getTimeValidationError(time, hours);
      if (timeError) return res.status(400).json({ message: timeError });

      const start = createISTDate(date, time);
      const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
      const startStr = toMySQLDateTime(start);
      const endStr = toMySQLDateTime(end);

      const availableCourtId = await BookingService.findAvailableCourt(venueId, startStr, endStr, sportId);
      if (!availableCourtId) {
        return res.status(409).json({ message: `Slot ${time} (${hours}h) no longer available` });
      }

      const amount = await calculateDynamicPrice(venue, date, time, hours);
      totalAmount += amount;

      bookingDetails.push({
        time, hours, startStr, endStr, courtId: availableCourtId, amount
      });
    }

    let pointsUsed = 0;
    let stripeAmount = totalAmount;

    if (useWallet) {
      const walletBalance = await WalletRepository.getWalletBalance(userId);
      if (walletBalance > 0) {
        pointsUsed = Math.min(walletBalance, totalAmount);
        stripeAmount = totalAmount - pointsUsed;
      }
    }

    // If fully covered by points, frontend should call confirmBookingWithPoints, but if they call this, we can signal it.
    if (stripeAmount <= 0) {
      return res.json({
        clientSecret: null,
        amount: 0,
        pointsUsed: totalAmount,
        message: "Full payment covered by points",
        fullyCovered: true
      });
    }

    // Create PaymentIntent for the remainder
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(stripeAmount * 100),
      currency: "lkr",
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'MULTI_BOOKING',
        venue_id: String(venueId),
        user_id: String(userId),
        group_data: JSON.stringify(bookingDetails.map(b => ({
          t: b.time, h: b.hours, c: b.courtId, a: b.amount, s: b.startStr, e: b.endStr
        }))),
        sport_id: String(sportId),
        invites: JSON.stringify(invites),
        total_amount: String(totalAmount),
        points_used: String(pointsUsed), // Store points used
        owner_id: String(venue.owner_id)
      }
    });

    res.json({ clientSecret: paymentIntent.client_secret, amount: stripeAmount, pointsUsed, fullyCovered: false });

  } catch (err) {
    console.error("Error creating PaymentIntent", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const confirmBookingWithIntent = async (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) return res.status(400).json({ message: "Missing paymentIntentId" });

  try {
    // 1. Retrieve Intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ message: "Payment not succeeded yet" });
    }

    const { type, venue_id, user_id, start_str, end_str, court_id, sport_id, total_amount, group_data, invites, owner_id, points_used, booking_id } = paymentIntent.metadata;

    const pointsUsedVal = points_used ? Number(points_used) : 0;
    const totalAmountVal = Number(total_amount);

    // Idempotency: Check if booking exists for this PI
    const existing = await BookingRepository.getBookingByPaymentReference(paymentIntent.id);
    if (existing) {
      return res.json({ success: true, message: "Booking already confirmed" });
    }

    const pool = BookingRepository.getPool();
    const conn = await pool.getConnection();

    // === HANDLE SHARE PAYMENT ===
    if (type === 'SHARE_PAYMENT') {
      try {
        await SplitPaymentService.executeReimbursement(Number(user_id), Number(booking_id), paymentIntent.amount / 100);
        await BookingRepository.createPayment(conn, {
          bookingId: Number(booking_id),
          payerId: Number(user_id),
          amount: paymentIntent.amount / 100,
          currency: "LKR",
          providerReference: paymentIntent.id,
        });
        await BookingRepository.updatePaymentStatus(conn, paymentIntent.id, 'SUCCEEDED');
        conn.release();
        return res.json({ success: true, message: "Share paid via Stripe" });
      } catch (err) {
        console.error("Error processing share payment", err);
        conn.release();
        return res.status(500).json({ message: "Error processing payment" });
      }
    }

    try {
      await conn.beginTransaction();
      const venue = await BookingRepository.getVenueById(venue_id);
      const bookingIds = [];

      const groups = JSON.parse(group_data);
      const inviteeList = invites ? JSON.parse(invites) : [];
      const numberOfBookings = groups.length;

      // Distribute points usage across bookings (proportional)
      // Or simpler: Assign all points to first booking? No, proportional is safer for refunds.
      // Actually, let's just create them. `createBooking` accepts `pointsUsed`.
      // We can distribute points equally per LKR amount.

      // Total calculated from groups might differ slightly from total_amount due to rounding? 
      // Use total_amount from metadata as source of truth.

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const ratio = Number(g.a) / totalAmountVal;
        const pointsForThis = pointsUsedVal * ratio;
        const cashForThis = Number(g.a) - pointsForThis;

        const bookingId = await BookingRepository.createBooking(conn, {
          venueId: Number(venue_id),
          courtId: Number(g.c),
          sportId: Number(sport_id),
          userId: Number(user_id),
          bookingStart: g.s,
          bookingEnd: g.e,
          totalAmount: Number(g.a),
          cancellationPolicyId: venue.cancellation_policy_id,
          customCancellationPolicy: venue.custom_cancellation_policy,
          customRefundPercentage: venue.custom_refund_percentage,
          customHoursBeforeStart: venue.custom_hours_before_start,
          pointsUsed: pointsForThis,
          paidAmount: cashForThis
        });

        const share = Number(g.a) / (inviteeList.length + 1);
        await BookingRepository.addBookingParticipant(conn, {
          bookingId, userId: Number(user_id), shareAmount: share, isInitiator: 1, paymentStatus: 'PAID'
        });

        await SplitPaymentService.setupBookingSplits(bookingId, Number(user_id), inviteeList, share, conn);
        await BookingRepository.updateBookingStatus(conn, bookingId, "CONFIRMED");
        await BookingRepository.createPayment(conn, {
          bookingId, payerId: Number(user_id), amount: cashForThis, currency: "LKR", providerReference: paymentIntent.id
        });
        bookingIds.push(bookingId);
      }

      // Deduct points if used
      if (pointsUsedVal > 0) {
        await WalletRepository.updateWalletBalance(conn, Number(user_id), -pointsUsedVal);
        await WalletRepository.createTransaction(conn, {
          userId: Number(user_id),
          amount: -pointsUsedVal,
          type: "DEBIT",
          description: `Part-payment (Points) for Booking IDs: ${bookingIds.join(',')}`,
          referenceType: "BOOKING_PAYMENT_PARTIAL"
        });
      }

      if (owner_id) {
        await WalletRepository.updateWalletBalance(conn, Number(owner_id), Number(total_amount));
        await WalletRepository.createTransaction(conn, {
          userId: Number(owner_id), amount: Number(total_amount), type: 'CREDIT',
          description: `Revenue from Multi-slot Booking. IDs: ${bookingIds.join(',')}`,
          referenceType: 'BOOKING_REVENUE',
          referenceId: bookingIds[0]
        });
      }

      await conn.commit();
      res.json({ success: true, bookingIds });

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

  } catch (err) {
    console.error("Error confirming booking", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const confirmBookingWithPoints = async (req, res) => {
  const userId = req.user.id;
  const { venueId, date, slots, sportId, invites: rawInvites = [] } = req.body;
  const invites = rawInvites.filter(email => email !== req.user.email);

  if (!venueId || !date || !slots || !slots.length) {
    return res.status(400).json({ message: "Missing booking details" });
  }

  try {
    const conn = await BookingRepository.getPool().getConnection();
    try {
      await conn.beginTransaction();

      const venue = await BookingRepository.getVenueById(venueId);
      const groups = groupContiguousSlots(slots);
      let totalAmount = 0;
      const bookingDetails = [];

      // 1. Calculate and Reserve
      for (const group of groups) {
        const { time, hours } = group;
        const start = createISTDate(date, time);
        const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
        const startStr = toMySQLDateTime(start);
        const endStr = toMySQLDateTime(end);

        // Availability check
        const availableCourtId = await BookingService.findAvailableCourt(venueId, startStr, endStr, sportId);
        if (!availableCourtId) {
          await conn.rollback();
          return res.status(409).json({ message: `Slot ${time} unavailable.` });
        }

        const amount = await calculateDynamicPrice(venue, date, time, hours);
        totalAmount += amount;
        bookingDetails.push({ time, hours, startStr, endStr, courtId: availableCourtId, amount });
      }

      // 2. Check Balance
      const walletBalance = await WalletRepository.getWalletBalance(userId);
      if (walletBalance < totalAmount) {
        await conn.rollback();
        return res.status(400).json({ message: "Insufficient points balance." });
      }

      // 3. Deduct Points
      await WalletRepository.updateWalletBalance(conn, userId, -totalAmount);
      await WalletRepository.createTransaction(conn, {
        userId, amount: -totalAmount, type: 'DEBIT',
        description: `Booking Payment (Points) for ${venue.name}`, referenceType: 'BOOKING_PAYMENT_FULL'
      });

      // 4. Create Bookings
      const bookingIds = [];
      for (const b of bookingDetails) {
        const bookingId = await BookingRepository.createBooking(conn, {
          venueId, courtId: b.courtId, sportId: Number(sportId), userId,
          bookingStart: b.startStr, bookingEnd: b.endStr,
          totalAmount: b.amount,
          cancellationPolicyId: venue.cancellation_policy_id,
          customCancellationPolicy: venue.custom_cancellation_policy,
          customRefundPercentage: venue.custom_refund_percentage,
          customHoursBeforeStart: venue.custom_hours_before_start,
          pointsUsed: b.amount,
          paidAmount: 0 // Cash paid is 0
        });

        const share = b.amount / (invites.length + 1);
        await BookingRepository.addBookingParticipant(conn, {
          bookingId, userId, shareAmount: share, isInitiator: 1, paymentStatus: 'PAID'
        });
        await SplitPaymentService.setupBookingSplits(bookingId, userId, invites, share, conn);
        await BookingRepository.updateBookingStatus(conn, bookingId, "CONFIRMED");
        await BookingRepository.createPayment(conn, {
          bookingId, payerId: userId, amount: b.amount, currency: "LKR", providerReference: `POINTS_FULL_${Date.now()}`
        });
        bookingIds.push(bookingId);
      }

      // 5. Credit Owner
      if (venue.owner_id) {
        await WalletRepository.updateWalletBalance(conn, venue.owner_id, totalAmount);
        await WalletRepository.createTransaction(conn, {
          userId: venue.owner_id, amount: totalAmount, type: 'CREDIT',
          description: `Revenue (Points) Booking IDs: ${bookingIds.join(',')}`,
          referenceType: 'BOOKING_REVENUE', referenceId: bookingIds[0]
        });
      }

      await conn.commit();
      res.json({ success: true, bookingIds });

    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/bookings/pay-split-share
 * 
 * Body: { bookingId, useWallet: boolean } // If false, use Stripe logic?
 * For MVP, we'll implement Wallet Pay first. Stripe for Split Share would require new session.
 */
export const paySplitShare = async (req, res) => {
  const userId = req.user.id;
  const { bookingId, useWallet } = req.body;

  if (!bookingId) return res.status(400).json({ message: "Missing booking ID" });

  try {
    const conn = await BookingRepository.getPool().getConnection();

    // Check if user is participant and pending
    const [rows] = await conn.execute(
      "SELECT * FROM booking_participants WHERE booking_id = ? AND user_id = ?",
      [bookingId, userId]
    );
    const participant = rows[0];

    if (!participant) return res.status(404).json({ message: "Participant not found" });
    if (participant.payment_status === 'PAID') return res.status(400).json({ message: "Already paid" });

    const amountToPay = Number(participant.share_amount);

    if (useWallet) {
      const walletBalance = await WalletRepository.getWalletBalance(userId);
      if (walletBalance < amountToPay) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      // Execute Reimbursement
      // Deduct from Participant
      const pool = BookingRepository.getPool();
      // Need transaction manually here? executeReimbursement handles transaction internally?
      // No, executeReimbursement handles transaction.
      // But we need to deduct wallet here first? Or inside?
      // Better to wrap all in one transaction or use service.

      // Let's do it here:
      try {
        // Deduct Participant Wallet
        await WalletRepository.updateWalletBalance(conn, userId, -amountToPay);
        await WalletRepository.createTransaction(conn, {
          userId,
          amount: -amountToPay,
          type: "DEBIT",
          description: `Split Share Payment for Booking #${bookingId}`,
          referenceType: "BOOKING_SPLIT_PAYMENT",
          referenceId: bookingId
        });

        conn.release(); // release, service uses its own pool/connection logic? 
        // Service uses pool.getConnection().
      } catch (e) {
        conn.release();
        throw e;
      }

      // Call Service
      await SplitPaymentService.executeReimbursement(userId, bookingId, amountToPay);

      return res.json({ success: true, message: "Share paid successfully" });

    } else {
      // Stripe flow for split share - Use Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: req.user.email,
        line_items: [
          {
            price_data: {
              currency: "lkr",
              product_data: {
                name: `Share Payment for Booking #${bookingId}`,
              },
              unit_amount: Math.round(amountToPay * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'SHARE_PAYMENT',
          booking_id: String(bookingId),
          user_id: String(userId),
        },
        success_url: `${process.env.FRONTEND_URL}/booking-summary?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/booking-summary?cancelled=true`,
      });

      conn.release();
      return res.json({ checkoutUrl: session.url });
    }

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
}



export const getBookedSlots = async (req, res) => {
  const { venueId } = req.params;
  const { date, sportId } = req.query;

  if (!venueId || !date) {
    return res.status(400).json({ message: "Missing venueId or date parameter" });
  }

  try {
    let slots = await BookingRepository.getBookedSlotsForDate(venueId, date);

    // If sportId provided, only return slots that block this sport
    if (sportId) {
      const targetSportId = Number(sportId);
      const courts = await CourtRepository.getCourtsByVenueAndSport(venueId, targetSportId);
      const courtIds = courts.map(c => Number(c.court_id));

      // A slot blocks the sport if it's venue-wide (null) OR on one of the sport's courts
      slots = slots.filter(s => s.court_id === null || courtIds.includes(Number(s.court_id)));
    }

    return res.json({ slots });
  } catch (err) {
    console.error("Error fetching booked slots:", err);
    return res.status(500).json({ message: "Server error while fetching booked slots" });
  }
};

export const getMyBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const bookings = await BookingRepository.getUserBookings(userId);
    return res.json({ bookings });
  } catch (err) {
    console.error("Error fetching user bookings:", err);
    return res
      .status(500)
      .json({ message: "Server error while fetching bookings" });
  }
};

export const getOwnerBookings = async (req, res) => {
  const userId = req.user.id;

  try {
    const bookings = await BookingRepository.getOwnerBookings(userId);
    return res.json({ bookings });
  } catch (err) {
    console.error("Error fetching owner bookings:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


export const cancelBooking = async (req, res) => {
  const bookingId = Number(req.params.id);
  const userId = req.user.id; // Corrected: req.user.id from middleware

  console.log(`[CancelBooking] Request received for BookingID: ${bookingId}, UserID: ${userId}`);

  try {
    const result = await BookingService.cancelBooking(bookingId, userId);
    console.log(`[CancelBooking] Success`);
    return res.json(result);
  } catch (err) {
    console.error("[CancelBooking] Error:", err);
    return res.status(400).json({ message: err.message });
  }
};

export const rescheduleBooking = async (req, res) => {
  const bookingId = Number(req.params.id);
  const userId = req.user.id;
  const { date, time, hours } = req.body;

  if (!date || !time || !hours) {
    return res.status(400).json({ message: "Date, time, and hours are required" });
  }

  try {
    const result = await BookingService.rescheduleBooking(bookingId, userId, date, time, hours);
    return res.json(result);
  } catch (err) {
    console.error("Reschedule Error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * POST /api/bookings/calculate-price
 */
export const calculatePrice = async (req, res) => {
  const { venueId, date, slots, time, hours } = req.body;
  if (!venueId || !date) {
    return res.status(400).json({ message: "Missing details" });
  }

  try {
    const venue = await BookingRepository.getVenueById(venueId);
    if (!venue) return res.status(404).json({ message: "Venue not found" });

    let totalAmount = 0;

    if (slots && Array.isArray(slots)) {
      const groups = groupContiguousSlots(slots);
      for (const group of groups) {
        totalAmount += await calculateDynamicPrice(venue, date, group.time, group.hours);
      }
    } else if (time && hours) {
      totalAmount = await calculateDynamicPrice(venue, date, time, hours);
    }

    res.json({ totalAmount });
  } catch (err) {
    console.error("Error calculating price:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/bookings/available-slots/:venueId
 * Query: date (YYYY-MM-DD), hours (number)
 */
export const getAvailableTimeSlots = async (req, res) => {
  const { venueId } = req.params;
  const { date, hours, sportId } = req.query;

  if (!venueId || !date || !hours || !sportId) {
    return res.status(400).json({ message: "Missing required parameters (venueId, date, hours, sportId)" });
  }

  try {
    const availableSlots = await BookingService.getAvailableTimeSlots(venueId, date, hours, Number(sportId));
    return res.json({ slots: availableSlots });
  } catch (err) {
    console.error("Error fetching available slots:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/bookings/venue/:venueId/calendar
 * Query: start (YYYY-MM-DD), end (YYYY-MM-DD)
 */
export const getVenueCalendarBookings = async (req, res) => {
  const { venueId } = req.params;
  const { start, end } = req.query;

  if (!venueId || !start || !end) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    // Append end of day time to ensure range covers the full end date
    const endDateWithTime = `${end} 23:59:59`;
    const bookings = await BookingRepository.getBookingsForRange(venueId, start, endDateWithTime);
    return res.json({ bookings });
  } catch (err) {
    console.error("Error fetching calendar bookings:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const createWalkInBooking = async (req, res) => {
  const { venueId } = req.params;
  const { date, time, hours, notes, type, customerName, customerEmail, sportId, totalAmount } = req.body; // type: 'WALK_IN' or 'BLOCK'
  const userId = req.user.id;

  if (!venueId || !date || !time || !hours) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  if (totalAmount < 0) {
    return res.status(400).json({ message: "Amount cannot be negative" });
  }

  try {
    const start = createISTDate(date, time);
    const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);
    const startStr = toMySQLDateTime(start);
    const endStr = toMySQLDateTime(end);

    // Find a court if sportId is provided, otherwise it's a legacy venue-wide block
    const availableCourtId = sportId ? await BookingService.findAvailableCourt(venueId, startStr, endStr, sportId) : null;

    if (sportId && !availableCourtId) {
      return res.status(409).json({ message: "No courts available for this sport at the selected time" });
    }

    // Double check conflict on specific court (or venue-wide)
    const hasConflict = await BookingRepository.hasBookingConflict(venueId, startStr, endStr, availableCourtId);
    if (hasConflict) {
      return res.status(409).json({ message: "Slot already booked" });
    }

    let bookingId;

    if (type === 'WALK_IN') {
      const pool = BookingRepository.getPool();
      const conn = await pool.getConnection();

      try {
        await conn.beginTransaction();

        const venue = await BookingRepository.getVenueById(venueId);

        bookingId = await BookingRepository.createBooking(conn, {
          venueId,
          userId,
          courtId: availableCourtId,
          sportId: sportId || null,
          bookingStart: startStr,
          bookingEnd: endStr,
          totalAmount: totalAmount || 0,
          cancellationPolicyId: venue?.cancellation_policy_id || 1,
          pointsUsed: 0,
          paidAmount: totalAmount || 0,
          guestName: customerName,
          guestEmail: customerEmail
        });

        // Set status to CONFIRMED
        await BookingRepository.updateBookingStatus(conn, bookingId, 'CONFIRMED');

        // Add minimal participant info (Owner?) or maybe a placeholder "Walk-in Customer" if we supported non-user participants.
        // Currently DB enforces user_id foreign key? 
        // If system requires user_id, we use the owner's ID (initiator).
        // Maybe store customerName/Email in notes or a separate meta table if needed.
        // For now, simple owner attribution is fine.

        await BookingRepository.addBookingParticipant(conn, {
          bookingId,
          userId,
          shareAmount: totalAmount || 0,
          isInitiator: 1
        });

        await BookingRepository.updateParticipantsPaymentStatus(conn, bookingId, 'PAID'); // Assume paid externally

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }

    } else {
      // Default to BLOCK
      bookingId = await BookingRepository.createBlock(venueId, userId, startStr, endStr, availableCourtId, sportId);
    }

    return res.json({ success: true, bookingId, message: type === 'WALK_IN' ? "Walk-in booking created" : "Slot blocked successfully" });

  } catch (err) {
    console.error("Error creating walk-in/block:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
