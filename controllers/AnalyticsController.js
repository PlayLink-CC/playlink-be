import * as BookingRepository from "../repositories/BookingRepository.js";

/**
 * GET /api/analytics/owner/summary
 *
 * Returns aggregated stats for the authenticated venue owner:
 * - Total Bookings
 * - Total Revenue
 * - Active Venues Count
 */
export const getOwnerSummary = async (req, res) => {
    const userId = req.user.id;

    try {
        const stats = await BookingRepository.getOwnerAnalytics(userId);
        res.json(stats);
    } catch (err) {
        console.error("Error fetching analytics summary:", err);
        res.status(500).json({ message: "Server error" });
    }
};

export const getOwnerDetailedAnalytics = async (req, res) => {
    const userId = req.user.id;

    try {
        const stats = await BookingRepository.getRevenueAnalytics(userId);
        res.json(stats);
    } catch (err) {
        console.error("Error fetching detailed analytics:", err);
        res.status(500).json({ message: "Server error" });
    }
};
