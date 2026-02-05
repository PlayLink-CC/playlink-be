
import connectDB from './config/dbconnection.js';
import bcrypt from 'bcryptjs';

const setup = async () => {
    try {
        console.log("Connecting to DB...");
        // Ensure connection is established
        await connectDB.execute('SELECT 1');

        const email = 'test_employee@example.com';
        const password = 'Password123!';
        const hash = await bcrypt.hash(password, 10);

        console.log("Cleaning up old test data...");
        // Clean up
        await connectDB.execute('DELETE FROM employee_venue WHERE user_id = (SELECT user_id FROM users WHERE email = ?)', [email]);
        // Also delete venue if we created one? We might leave it or reuse.
        // For simplicity, just delete user. Venue deletion might be restricted.
        await connectDB.execute('DELETE FROM users WHERE email = ?', [email]);

        console.log("Creating test employee...");
        // Insert User first to have an ID
        const [uResult] = await connectDB.execute(
            `INSERT INTO users (full_name, email, password_hash, phone, city, account_type) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['Test Employee', email, hash, '1234567890', 'Test City', 'EMPLOYEE']
        );
        const userId = uResult.insertId;
        console.log(`Created user_id: ${userId}`);

        let venueId = 1;
        const [venues] = await connectDB.execute('SELECT venue_id FROM venues LIMIT 1');
        if (venues.length > 0) {
            venueId = venues[0].venue_id;
            console.log(`Using existing venue_id: ${venueId}`);
        } else {
            console.log("Creating test venue...");
            // Insert a dummy venue using the employee as owner (or just as a placeholder owner)
            // Schema: owner_id, name, description, address, city, price_per_hour
            const [vResult] = await connectDB.execute(
                `INSERT INTO venues (owner_id, name, description, address, city, price_per_hour) 
                  VALUES (?, ?, ?, ?, ?, ?)`,
                [userId, 'Test Venue', 'Test Desc', '123 Test St', 'Test City', 50]
            );
            venueId = vResult.insertId;
            console.log(`Created test venue_id: ${venueId}`);
        }

        console.log("Linking employee to venue...");
        // Insert Employee Venue
        await connectDB.execute(
            `INSERT INTO employee_venue (user_id, venue_id) VALUES (?, ?)`,
            [userId, venueId]
        );

        console.log("Setup complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

setup();
