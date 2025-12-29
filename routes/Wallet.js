import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import { getMyBalance, getMySummary } from "../controllers/WalletController.js";

const router = express.Router();
// /api/wallet
router.get("/my-balance", authMiddleware, getMyBalance);
router.get("/summary", authMiddleware, getMySummary);

export default router;
