import * as WalletRepository from "../repositories/WalletRepository.js";

/**
 * GET /api/wallet/my-balance
 * Returns the current user's wallet balance
 */
export const getMyBalance = async (req, res) => {
    const userId = req.user.id;
    try {
        const balance = await WalletRepository.getWalletBalance(userId);
        res.json({ balance });
    } catch (err) {
        console.error("Error fetching balance:", err);
        res.status(500).json({ message: "Server error fetching balance" });
    }
};
