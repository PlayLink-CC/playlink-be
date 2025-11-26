import stripe from "../config/stripe.js";
import { 
  toMySQLDateTime,
  isValid15MinInterval,
  isWithinBookingWindow,
  doesBookingFitInWindow,
  getTimeValidationError 
} from "../utils/dateUtil.js";
import * as BookingRepository from "../repositories/BookingRepository.js";

/**
 * POST /api/bookings/checkout-session
 *
 * Body: { venueId, date: "YYYY-MM-DD", time: "HH:MM", hours }
 */
export const createCheckoutSession = async (req, res) => {
  const userId = req.user.id; // from auth middleware
  const userEmail = req.user.email;

  const { venueId, date, time, hours } = req.body;

  if (!venueId || !date || !time || !hours) {
    return res.status(400).json({ message: "Missing booking details" });
  }

  try {
    // 0) Validate time format and constraints
    const timeValidationError = getTimeValidationError(time, Number(hours));
    if (timeValidationError) {
      return res.status(400).json({ 
        message: "Invalid booking time",
        details: timeValidationError 
      });
    }

    // 1) Get venue price & cancellation policy
    const venue = await BookingRepository.getVenueById(venueId);

    if (!venue) {
      return res.status(404).json({ message: "Venue not found" });
    }

    // 2) Compute start/end times
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);

    const bookingStart = toMySQLDateTime(start);
    const bookingEnd = toMySQLDateTime(end);

    // 2.5) Check for booking conflicts (double booking prevention)
    const hasConflict = await BookingRepository.hasBookingConflict(
      venueId,
      bookingStart,
      bookingEnd
    );

    if (hasConflict) {
      return res.status(409).json({
        message: "This time slot is already booked. Please select a different time.",
        conflictDetected: true,
      });
    }

    // 3) Compute total amount (LKR)
    const pricePerHour = Number(venue.price_per_hour);
    const totalAmount = pricePerHour * Number(hours); // e.g. 2500 * 2
    const amountInMinor = Math.round(totalAmount * 100); // Stripe wants cents

    const pool = BookingRepository.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 4) Create booking (status = PENDING)
      const bookingId = await BookingRepository.createBooking(conn, {
        venueId: venue.venue_id,
        userId,
        bookingStart,
        bookingEnd,
        totalAmount,
        cancellationPolicyId: venue.cancellation_policy_id,
      });

      // 5) Add initiator as participant
      await BookingRepository.addBookingParticipant(conn, {
        bookingId,
        userId,
        shareAmount: totalAmount,
        isInitiator: 1,
      });

      // 6) Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: "lkr", // or "usd" in test if needed
              product_data: {
                name: `${venue.name} booking`,
              },
              unit_amount: amountInMinor,
            },
            quantity: 1,
          },
        ],
        metadata: {
          booking_id: String(bookingId),
          venue_id: String(venue.venue_id),
          user_id: String(userId),
        },
        success_url: `${process.env.FRONTEND_URL}/booking-summary?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/booking-summary?cancelled=true`,
      });

      // 7) Record payment entry (PENDING)
      await BookingRepository.createPayment(conn, {
        bookingId,
        payerId: userId,
        amount: totalAmount,
        currency: "LKR",
        providerReference: session.id,
      });

      await conn.commit();
      conn.release();

      return res.json({ checkoutUrl: session.url });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    console.error("Error creating checkout session", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/bookings/checkout-success?session_id=cs_test_...
 *
 * Called from BookingSummary page after Stripe redirect.
 */
export const handleCheckoutSuccess = async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ message: "Missing session_id" });
  }

  try {
    // 1) Verify with Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return res
        .status(400)
        .json({ message: "Payment not completed", paymentStatus: session.payment_status });
    }

    const bookingId = session.metadata?.booking_id;
    if (!bookingId) {
      return res.status(400).json({ message: "Missing booking_id in metadata" });
    }

    const pool = BookingRepository.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 2) Update payment & booking statuses
      await BookingRepository.updatePaymentStatus(conn, session.id, "SUCCEEDED");

      await BookingRepository.updateBookingStatus(conn, bookingId, "CONFIRMED");

      await BookingRepository.updateParticipantsPaymentStatus(conn, bookingId, "PAID");

      // 3) Return booking summary with venue info
      const booking = await BookingRepository.getBookingWithVenue(conn, bookingId);

      await conn.commit();
      conn.release();

      if (!booking) {
        return res
          .status(404)
          .json({ message: "Booking not found after payment" });
      }

      return res.json({ booking });
    } catch (err) {
      await conn.rollback();
      conn.release();
      throw err;
    }
  } catch (err) {
    console.error("Error confirming checkout session", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET /api/bookings/booked-slots/:venueId?date=YYYY-MM-DD
 *
 * Fetch all booked slots for a specific venue on a specific date
 */
export const getBookedSlots = async (req, res) => {
  const { venueId } = req.params;
  const { date } = req.query;

  if (!venueId || !date) {
    return res.status(400).json({ message: "Missing venueId or date parameter" });
  }

  try {
    const slots = await BookingRepository.getBookedSlotsForDate(venueId, date);
    return res.json({ slots });
  } catch (err) {
    console.error("Error fetching booked slots:", err);
    return res.status(500).json({ message: "Server error while fetching booked slots" });
  }
};

/**
 * GET /api/bookings/my-bookings
 *
 * Fetch all bookings for the authenticated user
 */
export const getMyBookings = async (req, res) => {
  const userId = req.user.id; // from auth middleware

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
