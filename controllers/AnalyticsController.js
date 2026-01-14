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

        // Calculate date range for peak hours (Last 30 Days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 30);

        const peakHours = await BookingRepository.getPeakBookingHours(userId, startDate.toISOString(), endDate.toISOString());

        res.json({ ...stats, peakHours });
    } catch (err) {
        console.error("Error fetching detailed analytics:", err);
        res.status(500).json({ message: "Server error" });
    }
};

export const getRevenueReport = async (req, res) => {
    const userId = req.user.id;
    const { interval, venueId, startDate, endDate } = req.query;

    if (!['daily', 'weekly', 'monthly'].includes(interval)) {
        return res.status(400).json({ message: "Invalid interval. Use daily, weekly, or monthly." });
    }

    try {
        const report = await BookingRepository.getRevenueReport(userId, {
            interval,
            venueId: venueId ? Number(venueId) : null,
            startDate,
            endDate
        });
        res.json(report);
    } catch (err) {
        console.error("Error fetching revenue report:", err);
        res.status(500).json({ message: "Server error" });
    }
};
