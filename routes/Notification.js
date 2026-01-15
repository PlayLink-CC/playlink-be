import express from "express";
import * as NotificationController from "../controllers/NotificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All notification routes are protected
router.use(authenticate);

router.get("/", NotificationController.getMyNotifications);
router.put("/all-read", NotificationController.markAllRead);
router.put("/:id/read", NotificationController.markRead);

export default router;
