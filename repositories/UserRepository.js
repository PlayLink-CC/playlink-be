import connectDB from "../config/dbconnection.js";

// Get all users
export const findAll = async () => {
  const sql = `SELECT user_id, full_name, email, phone, account_type, created_at, updated_at FROM users`;
  const [rows] = await connectDB.execute(sql);
  return rows;
};

// Find user by email (for login)
export const findByEmail = async (email) => {
  const sql = `SELECT * FROM users WHERE email = ?`;
  const [rows] = await connectDB.execute(sql, [email]);
  return rows[0]; // first user or undefined
};
