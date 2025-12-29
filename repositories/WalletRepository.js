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
        "SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE",
        [userId]
      );

      // DEBUG: Write to file
      const fs = await import('fs');
      try {
        const rowData = rows.length > 0 ? JSON.stringify(rows[0]) : "NO ROWS";
        fs.appendFileSync('debug_log.txt', `[${new Date().toISOString()}] WalletRepo Check - User: ${userId}, Rows: ${rowData}\n`);
      } catch (e) { console.error("Log fail", e); }

      const currentBalance = Number(rows[0].balance);

      // Floating point safe check (allow -0.01 epsilon)
      if (currentBalance + amount < -0.01) {
        console.error(`Insufficient funds: Balance=${currentBalance}, Amount=${amount}, Result=${currentBalance + amount}`);
        throw new Error(`Insufficient funds: Balance ${currentBalance} < Required ${Math.abs(amount)}`);
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

/**
 * Get rich transaction history for a user
 * 
 * Joins wallet transactions with bookings, venues, and users (for split payments).
 * 
 * @async
 * @param {number} userId 
 * @returns {Promise<Object[]>}
 */
export const getTransactionsWithDetails = async (userId) => {
  // 1. Get wallet_id
  const [wRows] = await pool.execute("SELECT wallet_id FROM wallets WHERE user_id = ?", [userId]);
  if (wRows.length === 0) return [];
  const walletId = wRows[0].wallet_id;

  // 2. Fetch Transactions with Joins
  // We left join bookings and venues to get context for BOOKING_PAYMENT and BOOKING_REIMBURSEMENT.
  // For Payer Name in Reimbursements, we might need to look at who triggered it?
  // Current schema doesn't link transaction -> payer directly. 
  // We can try to get context from description or generic booking info.
  // However, request asked for "From: [User Name]".
  // Since we can't reliably join a specific "Payer" from the transaction log (only booking_id),
  // we will suffice with Booking/Venue details and relying on Description if we enhanced it,
  // OR we can query the 'booking_participants' who are PAID and NOT initiator for that booking?
  // But that gives ALL payers. If I received 3 reimbursements, I have 3 transactions? Yes.
  // But they all point to same booking_id.
  // Limitation: We can't map 1-to-1 transaction to participant without 'related_user_id'.
  // Workaround: We will return the venue details and let frontend format "Split Reimbursement".

  const sql = `
    SELECT 
      wt.transaction_id,
      wt.amount,
      wt.direction,
      wt.transaction_type,
      wt.description,
      wt.created_at,
      b.booking_id,
      v.name AS venue_name,
      v.city AS venue_city
    FROM wallet_transactions wt
    LEFT JOIN bookings b ON wt.booking_id = b.booking_id
    LEFT JOIN venues v ON b.venue_id = v.venue_id
    WHERE wt.wallet_id = ?
    ORDER BY wt.created_at DESC
  `;

  const [rows] = await pool.execute(sql, [walletId]);
  return rows;
};
