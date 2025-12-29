import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import {
  createCheckoutSession,
  handleCheckoutSuccess,
  getMyBookings,
  getBookedSlots,
  getOwnerBookings,
  paySplitShare,
  cancelBooking,
  rescheduleBooking,
} from "../controllers/BookingController.js";

const router = express.Router();

// Stripe checkout
router.post("/checkout-session", authMiddleware, createCheckoutSession);
router.get("/checkout-success", authMiddleware, handleCheckoutSuccess);
router.post("/pay-split-share", authMiddleware, paySplitShare);
router.patch("/:id/cancel", authMiddleware, cancelBooking);
router.patch("/:id/reschedule", authMiddleware, rescheduleBooking);

router.get("/my", authMiddleware, getMyBookings);
router.get("/owner", authMiddleware, getOwnerBookings);

// Get booked slots for a venue on a specific date
router.get("/booked-slots/:venueId", getBookedSlots);

export default router;
