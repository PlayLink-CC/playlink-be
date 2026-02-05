import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        // 1. Get Owner
        const [owners] = await conn.execute("SELECT user_id, email, password_hash FROM users WHERE account_type = 'VENUE_OWNER' LIMIT 1");
        if (owners.length === 0) {
            console.log("No VENUE_OWNER found.");
            process.exit(1);
        }
        const owner = owners[0];
        console.log("OWNER:", owner);

        // 2. Get Venue
        const [venues] = await conn.execute("SELECT venue_id, name FROM venues WHERE owner_id = ? LIMIT 1", [owner.user_id]);
        if (venues.length === 0) {
            console.log("No Venue found for this owner.");
            process.exit(1);
        }
        const venue = venues[0];
        console.log("VENUE:", venue);

        // 3. Get Player (Candidate for staff)
        const [players] = await conn.execute("SELECT user_id, email, account_type FROM users WHERE account_type = 'PLAYER' LIMIT 1");
        if (players.length === 0) {
            // Create one if not exists
            console.log("No PLAYER found, creating one...");
            const res = await conn.execute("INSERT INTO users (full_name, email, password_hash, account_type) VALUES ('Test Staff', 'teststaff@gmail.com', 'hash', 'PLAYER')");
            const [newPlayer] = await conn.execute("SELECT user_id, email, account_type FROM users WHERE email = 'teststaff@gmail.com'");
            console.log("PLAYER:", newPlayer[0]);
        } else {
            console.log("PLAYER:", players[0]);
        }

        await conn.end();
    } catch (e) {
        console.error(e);
    }
})();
