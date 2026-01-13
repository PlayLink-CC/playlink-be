import express from "express";
import { authenticate as authMiddleware } from "../middleware/auth.js";
import { getOwnerSummary, getOwnerDetailedAnalytics } from "../controllers/AnalyticsController.js";

const router = express.Router();

router.get("/owner/summary", authMiddleware, getOwnerSummary);
router.get("/owner/detailed", authMiddleware, getOwnerDetailedAnalytics);

export default router;
