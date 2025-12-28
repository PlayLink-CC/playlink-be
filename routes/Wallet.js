import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import { getMyBalance } from "../controllers/WalletController.js";

const router = express.Router();

router.get("/my-balance", authMiddleware, getMyBalance);

export default router;
