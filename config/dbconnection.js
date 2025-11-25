/**
 * Database Connection Pool Configuration
 *
 * Establishes a MySQL connection pool using mysql2/promise for
 * high-performance, connection-pooled database operations.
 *
 * Environment Variables Required:
 * - DB_HOST: MySQL server hostname
 * - DB_USER: MySQL username
 * - DB_PASSWORD: MySQL password
 * - DB_NAME: Database name
 * - DB_PORT: MySQL port (default 3306)
 *
 * @module config/dbconnection
 */

import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

/**
 * MySQL connection pool configured with credentials from environment variables.
 * Uses connection pooling to reuse connections efficiently across the application.
 *
 * @type {mysql.Pool}
 */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

export default pool;
