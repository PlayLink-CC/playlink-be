import express from "express";
import * as EmployeeController from "../controllers/EmployeeController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

/**
 * @route GET /api/employee/today-summary
 * @desc Get dashboard stats for the logged-in employee (Today's bookings, Next Arrival, Court Status)
 * @access Private (Employee only)
 */
router.get("/today-summary", authenticate, authorize(['EMPLOYEE']), EmployeeController.getTodaySummary);

export default router;
