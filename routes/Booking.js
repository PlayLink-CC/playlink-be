import express from "express";
import { authenticate as authMiddleware, authorize } from "../middleware/auth.js";
import {
  createCheckoutSession,
  handleCheckoutSuccess,
  getMyBookings,
  getBookedSlots,
  getOwnerBookings,
  paySplitShare,
  cancelBooking,
  rescheduleBooking,
  getAvailableTimeSlots,
} from "../controllers/BookingController.js";

const router = express.Router();

// Stripe checkout - Players only
router.post("/checkout-session", authMiddleware, authorize(['PLAYER']), createCheckoutSession);
router.get("/checkout-success", authMiddleware, authorize(['PLAYER']), handleCheckoutSuccess);
router.post("/pay-split-share", authMiddleware, authorize(['PLAYER']), paySplitShare);

// Booking Management - Players
router.patch("/:id/cancel", authMiddleware, authorize(['PLAYER', 'VENUE_OWNER']), cancelBooking);
router.patch("/:id/reschedule", authMiddleware, authorize(['PLAYER']), rescheduleBooking);

router.get("/my", authMiddleware, authorize(['PLAYER']), getMyBookings);

// Booking Management - Owners
router.get("/owner", authMiddleware, authorize(['VENUE_OWNER']), getOwnerBookings);

// Get booked slots for a venue on a specific date
router.get("/booked-slots/:venueId", getBookedSlots);

// Get available slots
router.get("/available-slots/:venueId", getAvailableTimeSlots);

export default router;
