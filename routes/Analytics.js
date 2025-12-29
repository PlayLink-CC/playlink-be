import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import { getOwnerSummary } from "../controllers/AnalyticsController.js";

const router = express.Router();

router.get("/owner/summary", authMiddleware, getOwnerSummary);

export default router;
