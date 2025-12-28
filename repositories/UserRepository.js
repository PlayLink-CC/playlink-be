/**
 * User Repository
 *
 * Data access layer for user-related database operations.
 * Uses parameterized queries to prevent SQL injection.
 *
 * Responsibilities:
 * - Direct database queries for user data
 * - Returning raw database results
 * - Query parameterization for security
 *
 * @module repositories/UserRepository
 */

import connectDB from "../config/dbconnection.js";

/**
 * Fetch all users from the database
 *
 * Retrieves complete user records excluding sensitive data
 * like password hashes.
 *
 * @async
 * @returns {Promise<Object[]>} Array of user records from database
 * @returns {number} rows[].user_id - User ID
 * @returns {string} rows[].full_name - User full name
 * @returns {string} rows[].email - User email address
 * @returns {string} rows[].phone - User phone number
 * @returns {string} rows[].account_type - User account type
 * @returns {string} rows[].created_at - Account creation timestamp
 * @returns {string} rows[].updated_at - Last update timestamp
 * @throws {Error} Database connection error
 */
export const findAll = async () => {
  const sql = `SELECT user_id, full_name, email, phone, account_type, created_at, updated_at FROM users`;
  const [rows] = await connectDB.execute(sql);
  return rows;
};

/**
 * Find a single user by email address
 *
 * Retrieves complete user record including password hash
 * for authentication purposes.
 *
 * @async
 * @param {string} email - Email address to search for
 * @returns {Promise<Object|undefined>} User record if found, undefined otherwise
 * @returns {number} rows[].user_id - User ID
 * @returns {string} rows[].email - User email address
 * @returns {string} rows[].password_hash - Bcrypt password hash
 * @returns {string} rows[].full_name - User full name
 * @returns {string} rows[].phone - User phone number
 * @returns {string} rows[].account_type - User account type
 * @throws {Error} Database connection error
 */
export const findByEmail = async (email) => {
  const sql = `SELECT * FROM users WHERE email = ?`;
  const [rows] = await connectDB.execute(sql, [email]);
  return rows[0]; // first user or undefined
};

/**
 * Create a new user in the database
 *
 * Inserts a new user row and returns the created record.
 *
 * @async
 * @param {Object} data
 * @param {string} data.fullName
 * @param {string} data.email
 * @param {string} data.passwordHash
 * @param {string} [data.phone]
 * @param {string} data.accountType
 * @returns {Promise<Object>} Newly created user record
 * @throws {Error} Database connection error
 */
export const createUser = async ({
  fullName,
  email,
  passwordHash,
  phone,
  accountType,
}) => {
  const insertSql = `
    INSERT INTO users (full_name, email, password_hash, phone, account_type)
    VALUES (?, ?, ?, ?, ?)
  `;

  const [result] = await connectDB.execute(insertSql, [
    fullName,
    email,
    passwordHash,
    phone ?? null,
    accountType,
  ]);

  const newUserId = result.insertId;

  const selectSql = `
    SELECT user_id, full_name, email, phone, account_type, created_at, updated_at
    FROM users
    WHERE user_id = ?
  `;

  const [rows] = await connectDB.execute(selectSql, [newUserId]);

  return rows[0];
};

/**
 * Search users by name or email
 * 
 * @async
 * @param {string} query 
 * @returns {Promise<Object[]>}
 */
export const searchUsers = async (query) => {
  const searchTerm = `%${query}%`;
  const sql = `
    SELECT user_id, full_name, email 
    FROM users 
    WHERE (full_name LIKE ? OR email LIKE ?)
    AND account_type = 'PLAYER' -- Only invite players
    LIMIT 10
  `;
  const [rows] = await connectDB.execute(sql, [searchTerm, searchTerm]);
  return rows;
};

/**
 * Find User IDs by Emails
 * 
 * @async
 * @param {string[]} emails 
 * @returns {Promise<Object[]>} Array of objects {user_id, email}
 */
export const findIdsByEmails = async (emails) => {
  if (emails.length === 0) return [];

  // Create placeholders ?,?,?
  const placeholders = emails.map(() => '?').join(',');
  const sql = `SELECT user_id, email FROM users WHERE email IN (${placeholders})`;

  const [rows] = await connectDB.execute(sql, emails);
  return rows;
};
