
import connectDB from './config/dbconnection.js';

const cleanup = async () => {
    try {
        const email = 'test_employee@example.com';
        console.log("Deleting test data...");
        await connectDB.execute('DELETE FROM employee_venue WHERE user_id = (SELECT user_id FROM users WHERE email = ?)', [email]);
        // Also delete the venue we created if it was specific. I used user_id as owner_id for valid venue.
        // If I delete user first, might cascade or fail.
        // Let's find the user id first.
        const [users] = await connectDB.execute('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            const userId = users[0].user_id;
            // Delete venues owned by this user
            await connectDB.execute('DELETE FROM venues WHERE owner_id = ?', [userId]);
            await connectDB.execute('DELETE FROM users WHERE user_id = ?', [userId]);
        }
        console.log("Cleanup complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

cleanup();
