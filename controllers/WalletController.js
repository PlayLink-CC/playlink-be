import * as WalletRepository from "../repositories/WalletRepository.js";
import * as WalletService from "../services/WalletService.js";
import stripe from "../config/stripe.js";
import pool from "../config/dbconnection.js";

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

/**
 * POST /api/wallet/topup
 * Creates a Stripe PaymentIntent for specified amount
 */
export const topup = async (req, res) => {
    const { amount } = req.body;

    if (!amount || amount < 100) {
        return res.status(400).json({ message: "Minimum top-up amount is LKR 100" });
    }

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents/cents-equivalent
            currency: "lkr",
            metadata: { userId: req.user.id, type: "wallet_topup" },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        console.error("Stripe TopUp Error:", err);
        res.status(500).json({ message: "Payment initialization failed" });
    }
};

/**
 * POST /api/wallet/confirm-topup
 * Finalizes the wallet update after Stripe confirmation
 */
export const confirmTopup = async (req, res) => {
    const userId = req.user.id;
    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || !amount) {
        return res.status(400).json({ message: "Missing required payment details" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Verify PaymentIntent with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({ message: "Payment has not been confirmed by Stripe" });
        }

        // 2. Update Balance
        await WalletRepository.updateWalletBalance(conn, userId, Number(amount));

        // 3. Create Transaction Record
        await WalletRepository.createTransaction(conn, {
            userId,
            amount: Number(amount),
            type: "CREDIT",
            description: `Wallet top-up via Card (Ref: ${paymentIntentId})`,
            referenceType: "TOP_UP",
            referenceId: null
        });

        await conn.commit();
        res.json({ message: "Wallet topped up successfully" });
    } catch (err) {
        await conn.rollback();
        console.error("Confirm TopUp Error:", err);
        res.status(500).json({ message: "Failed to finalize top-up" });
    } finally {
        conn.release();
    }
};
