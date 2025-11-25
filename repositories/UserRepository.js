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
