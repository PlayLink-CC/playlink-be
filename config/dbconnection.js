import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: ".env.local" });

// Create and test connection
async function connectDB() {
  try {
    const con = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
    });

    console.log("Database connection successful!");
    return con;
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

export default connectDB;
