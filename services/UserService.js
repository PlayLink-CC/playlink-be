/**
 * User Service
 *
 * Contains business logic for user-related operations.
 * Orchestrates between controllers and repositories.
 * Handles data validation and transformation.
 *
 * Responsibilities:
 * - User authentication and password verification
 * - User data retrieval and formatting
 * - Business rule enforcement
 *
 * @module services/UserService
 */

import * as userRepository from "../repositories/UserRepository.js";
import bcrypt from "bcryptjs";

/**
 * Retrieve all users from the database
 *
 * Fetches all users and transforms database columns to
 * application property names.
 *
 * @async
 * @returns {Promise<Object[]>} Array of formatted user objects
 * @returns {number} user.id - User ID
 * @returns {string} user.fullName - User full name
 * @returns {string} user.email - User email address
 * @returns {string} user.phone - User phone number
 * @returns {string} user.accountType - User account type
 * @returns {string} user.createdAt - Account creation timestamp
 * @returns {string} user.updatedAt - Last update timestamp
 * @throws {Error} Database connection error
 */
export const getUsers = async () => {
  const users = await userRepository.findAll();

  return users.map((u) => ({
    id: u.userid,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    accountType: u.account_type,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  }));
};

/**
 * Authenticate user with email and password
 *
 * Finds user by email, verifies password hash, and returns
 * user data. Throws error if credentials are invalid.
 *
 * @async
 * @param {string} email - User email address
 * @param {string} plainPassword - Plain text password to verify
 * @returns {Promise<Object>} Authenticated user object
 * @returns {number} user.id - User ID
 * @returns {string} user.fullName - User full name
 * @returns {string} user.email - User email address
 * @returns {string} user.phone - User phone number
 * @returns {string} user.accountType - User account type
 * @returns {string} user.createdAt - Account creation timestamp
 * @returns {string} user.updatedAt - Last update timestamp
 * @throws {Error} 'Invalid credentials' - User not found or password mismatch
 */
export const logInUser = async (email, plainPassword) => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Compare plain password with stored hash
  const isMatch = await bcrypt.compare(plainPassword, user.password_hash);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  return {
    id: user.userid,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    accountType: user.account_type,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
};
