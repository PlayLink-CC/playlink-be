/**
 * Wallet Repository
 *
 * Data access layer for wallet-related database operations.
 *
 * Responsibilities:
 * - Manage user wallet balances
 * - Record wallet transactions
 *
 * @module repositories/WalletRepository
 */

import pool from "../config/dbconnection.js";

/**
 * Get wallet balance for a user
 *
 * @async
 * @param {number} userId - User ID
 * @returns {Promise<number>} Current wallet balance (default 0)
 */
export const getWalletBalance = async (userId) => {
  const [rows] = await pool.execute(
    "SELECT balance FROM wallets WHERE user_id = ?",
    [userId]
  );
  return rows[0] ? Number(rows[0].balance) : 0;
};

/**
 * Update wallet balance
 *
 * Updates details for a specific user's wallet.
 * Creates the wallet if it doesn't exist.
 * Should be called within a transaction.
 *
 * @async
 * @param {Object} conn - Database connection/pool
 * @param {number} userId - User ID
 * @param {number} amount - Amount to add (positive) or subtract (negative)
 * @returns {Promise<void>}
 */
export const updateWalletBalance = async (conn, userId, amount) => {
  // Check if wallet exists, if not create it
  const [exists] = await conn.execute(
    "SELECT user_id FROM wallets WHERE user_id = ?",
    [userId]
  );

  if (exists.length === 0) {
    if (amount < 0) throw new Error("Insufficient funds for new wallet");
    await conn.execute(
      "INSERT INTO wallets (user_id, balance) VALUES (?, ?)",
      [userId, amount]
    );
  } else {
    // If debiting, check balance first to prevent negative
    if (amount < 0) {
      const [rows] = await conn.execute(
        "SELECT balance FROM wallets WHERE user_id = ?",
        [userId]
      );
      const currentBalance = Number(rows[0].balance);
      if (currentBalance + amount < 0) {
        throw new Error("Insufficient funds");
      }
    }

    await conn.execute(
      "UPDATE wallets SET balance = balance + ?, updated_at = NOW() WHERE user_id = ?",
      [amount, userId]
    );
  }
};

/**
 * Create a wallet transaction record
 *
 * @async
 * @param {Object} conn - Database connection
 * @param {Object} data
 * @param {number} data.userId
 * @param {number} data.amount
 * @param {string} data.type - 'CREDIT' or 'DEBIT'
 * @param {string} data.description
 * @param {string} [data.referenceType] - e.g., 'BOOKING_SPLIT'
 * @param {string} [data.referenceId] - e.g., Booking ID
 */
export const createTransaction = async (conn, {
  userId,
  amount,
  type,
  description,
  referenceType = null,
  referenceId = null
}) => {
  // 1. Get wallet_id
  const [rows] = await conn.execute(
    "SELECT wallet_id FROM wallets WHERE user_id = ?",
    [userId]
  );

  if (rows.length === 0) {
    throw new Error(`Wallet not found for user ${userId}`);
  }

  const walletId = rows[0].wallet_id;

  // 2. Insert into wallet_transactions
  // Schema: transaction_id, wallet_id, booking_id, transaction_type, direction, amount, description, created_at
  // internal 'type' ("CREDIT"/"DEBIT") -> direction
  // internal 'referenceType' -> transaction_type
  // internal 'referenceId' -> booking_id

  await conn.execute(
    `INSERT INTO wallet_transactions 
     (wallet_id, amount, direction, transaction_type, booking_id, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [walletId, amount, type, referenceType, referenceId, description]
  );
};
