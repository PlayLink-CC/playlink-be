import express from "express";
import * as PolicyController from "../controllers/PolicyController.js";

const router = express.Router();

/**
 * GET /api/policies
 * Public endpoint to fetch all cancellation policies
 */
router.get("/", PolicyController.fetchAllPolicies);

export default router;
