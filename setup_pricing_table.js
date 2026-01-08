
import pool from "./config/dbconnection.js";

const setupPricingRulesTable = async () => {
    try {
        const connection = await pool.getConnection();
        console.log("Connected to database.");

        try {
            // Check if table exists
            const [rows] = await connection.execute(`
                SELECT count(*) as count 
                FROM information_schema.TABLES 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'venue_pricing_rules'
            `);

            if (rows[0].count === 0) {
                console.log("Table 'venue_pricing_rules' does not exist. Creating it...");
                await connection.execute(`
                    CREATE TABLE venue_pricing_rules (
                        rule_id INT AUTO_INCREMENT PRIMARY KEY,
                        venue_id INT NOT NULL,
                        name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
                        start_time TIME NOT NULL,
                        end_time TIME NOT NULL,
                        multiplier DECIMAL(3, 2) DEFAULT 1.0,
                        days_of_week JSON NULL COMMENT 'Array of integers 0-6 (Sun-Sat)',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (venue_id) REFERENCES venues(venue_id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                `);
                console.log("Table 'venue_pricing_rules' created successfully.");
            } else {
                console.log("Table 'venue_pricing_rules' already exists.");
                // Check if days_of_week column exists, if not add it (migration)
                const [cols] = await connection.execute(`
                    SELECT count(*) as count 
                    FROM information_schema.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'venue_pricing_rules' 
                    AND COLUMN_NAME = 'days_of_week'
                `);
                if (cols[0].count === 0) {
                    console.log("Adding column 'days_of_week'...");
                    await connection.execute(`ALTER TABLE venue_pricing_rules ADD COLUMN days_of_week JSON NULL`);
                }
            }

        } catch (err) {
            console.error("Error executing query:", err);
        } finally {
            connection.release();
        }

    } catch (err) {
        console.error("Database connection failed:", err);
    } finally {
        process.exit();
    }
};

setupPricingRulesTable();
