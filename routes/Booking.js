import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import {
  createCheckoutSession,
  handleCheckoutSuccess,
  getMyBookings,
  getBookedSlots,
} from "../controllers/BookingController.js";

const router = express.Router();

// Stripe checkout
router.post("/checkout-session", authMiddleware, createCheckoutSession);
router.get("/checkout-success", authMiddleware, handleCheckoutSuccess);

router.get("/my", authMiddleware, getMyBookings);

// Get booked slots for a venue on a specific date
router.get("/booked-slots/:venueId", getBookedSlots);

export default router;
