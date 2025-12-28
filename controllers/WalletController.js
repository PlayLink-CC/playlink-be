import * as WalletRepository from "../repositories/WalletRepository.js";
import * as WalletService from "../services/WalletService.js"; // Import Service

/**
 * GET /api/wallet/my-balance
 * Returns the current user's wallet balance
 */
export const getMyBalance = async (req, res) => {
    const userId = req.user.id;
    try {
        const balance = await WalletRepository.getWalletBalance(userId);
        return res.json({ balance });
    } catch (err) {
        console.error("Error fetching wallet balance", err);
        return res.status(500).json({ message: "Server error" });
    }
};

export const getMySummary = async (req, res) => {
    const userId = req.user.id;
    try {
        const summary = await WalletService.getWalletSummary(userId);
        return res.json(summary);
    } catch (err) {
        console.error("Error fetching wallet summary", err);
        return res.status(500).json({ message: "Server error" });
    }
};
