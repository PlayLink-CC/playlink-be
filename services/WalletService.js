import * as WalletRepository from "../repositories/WalletRepository.js";
import pool from "../config/dbconnection.js"; // Direct pool access for simple queries if needed

export const getWalletSummary = async (userId) => {
    // 1. Get Balance
    const balance = await WalletRepository.getWalletBalance(userId);

    // 2. Get Transaction History
    const transactions = await WalletRepository.getTransactionsWithDetails(userId);

    // 3. Format/Enrich Transactions
    // (Optional: If we wanted to "fake" the Payer Name by parsing description or complex logic, we'd do it here)
    // For now, we pass the rich data (Venue Name) through.

    return {
        balance,
        transactions
    };
};
