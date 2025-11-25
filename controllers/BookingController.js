import pool from "../config/dbconnection.js";
import stripe from "../config/stripe.js";

/**
 * Helper: format Date -> "YYYY-MM-DD HH:MM:SS" for MySQL
 */
const toMySQLDateTime = (dateObj) => {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  const mm = pad(dateObj.getMonth() + 1);
  const dd = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mi = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

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
    const conn = await pool.getConnection();
    try {
      // 1) Get venue price & cancellation policy
      const [venueRows] = await conn.execute(
        "SELECT venue_id, name, price_per_hour, cancellation_policy_id FROM venues WHERE venue_id = ?",
        [venueId]
      );

      if (venueRows.length === 0) {
        conn.release();
        return res.status(404).json({ message: "Venue not found" });
      }

      const venue = venueRows[0];

      // 2) Compute start/end times
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + Number(hours) * 60 * 60 * 1000);

      const bookingStart = toMySQLDateTime(start);
      const bookingEnd = toMySQLDateTime(end);

      // 3) Compute total amount (LKR)
      const pricePerHour = Number(venue.price_per_hour);
      const totalAmount = pricePerHour * Number(hours); // e.g. 2500 * 2
      const amountInMinor = Math.round(totalAmount * 100); // Stripe wants cents

      await conn.beginTransaction();

      // 4) Create booking (status = PENDING)
      const [bookingResult] = await conn.execute(
        `INSERT INTO bookings
         (venue_id, created_by, booking_start, booking_end, total_amount, status, cancellation_policy_id)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
        [
          venue.venue_id,
          userId,
          bookingStart,
          bookingEnd,
          totalAmount,
          venue.cancellation_policy_id,
        ]
      );

      const bookingId = bookingResult.insertId;

      // 5) Add initiator as participant
      await conn.execute(
        `INSERT INTO booking_participants
         (booking_id, user_id, share_amount, is_initiator, invite_status, payment_status)
         VALUES (?, ?, ?, 1, 'ACCEPTED', 'PENDING')`,
        [bookingId, userId, totalAmount]
      );

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
      await conn.execute(
        `INSERT INTO payments
         (booking_id, payer_id, amount, currency, payment_source, status, provider_reference)
         VALUES (?, ?, ?, ?, 'CARD', 'PENDING', ?)`,
        [bookingId, userId, totalAmount, "LKR", session.id]
      );

      await conn.commit();
      conn.release();

      return res.json({ checkoutUrl: session.url });
    } catch (err) {
      await pool.query("ROLLBACK");
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

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // 2) Update payment & booking statuses
      await conn.execute(
        "UPDATE payments SET status = 'SUCCEEDED' WHERE provider_reference = ?",
        [session.id]
      );

      await conn.execute(
        "UPDATE bookings SET status = 'CONFIRMED' WHERE booking_id = ?",
        [bookingId]
      );

      await conn.execute(
        "UPDATE booking_participants SET payment_status = 'PAID' WHERE booking_id = ?",
        [bookingId]
      );

      // 3) Return booking summary with venue info
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

      await conn.commit();
      conn.release();

      if (!rows.length) {
        return res
          .status(404)
          .json({ message: "Booking not found after payment" });
      }

      return res.json({ booking: rows[0] });
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("Error confirming checkout session", err);
    return res.status(500).json({ message: "Server error" });
  }
};
