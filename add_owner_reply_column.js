
import pool from "./config/dbconnection.js";

const addOwnerReplyColumn = async () => {
    try {
        const connection = await pool.getConnection(); // Get a connection from the pool
        console.log("Connected to database.");

        try {
            // Check if column exists
            const [rows] = await connection.execute(`
        SELECT count(*) as count 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'reviews' 
        AND COLUMN_NAME = 'owner_reply'
      `);

            if (rows[0].count === 0) {
                console.log("Column 'owner_reply' does not exist. Adding it...");
                await connection.execute(`
            ALTER TABLE reviews
            ADD COLUMN owner_reply TEXT NULL
          `);
                console.log("Column 'owner_reply' added successfully.");
            } else {
                console.log("Column 'owner_reply' already exists.");
            }

        } catch (err) {
            console.error("Error executing query:", err);
        } finally {
            connection.release(); // Release the connection back to the pool
        }

    } catch (err) {
        console.error("Database connection failed:", err);
    } finally {
        process.exit();
    }
};

addOwnerReplyColumn();
