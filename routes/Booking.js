// routes/Booking.js
import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import {
  createCheckoutSession,
  handleCheckoutSuccess,
} from "../controllers/BookingController.js";

const router = express.Router();

// Create Stripe Checkout session + provisional booking
router.post("/checkout-session", authMiddleware, createCheckoutSession);

// Called from BookingSummary page after Stripe redirect
router.get("/checkout-success", authMiddleware, handleCheckoutSuccess);

export default router;
