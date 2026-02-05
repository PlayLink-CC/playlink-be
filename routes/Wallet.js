import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import { getMyBalance, getMySummary, topup, confirmTopup } from "../controllers/WalletController.js";

const router = express.Router();
// /api/wallet
router.get("/my-balance", authMiddleware, getMyBalance);
router.get("/summary", authMiddleware, getMySummary);
router.post("/topup", authMiddleware, topup);
router.post("/confirm-topup", authMiddleware, confirmTopup);

export default router;
