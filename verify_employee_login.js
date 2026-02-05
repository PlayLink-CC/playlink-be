
import { logInUser } from './services/UserService.js';
import { createToken, verifyToken } from './utils/authUtil.js';
import connectDB from './config/dbconnection.js';

const verify = async () => {
    try {
        console.log("Testing Login...");
        const email = 'test_employee@example.com';
        const password = 'Password123!';

        const user = await logInUser(email, password);
        console.log("Login User Result:", user);

        if (user.accountType !== 'EMPLOYEE') {
            throw new Error('Account type mismatch');
        }
        if (!user.venueId) {
            throw new Error('Venue ID missing from login result');
        }
        console.log(`Venue ID verified: ${user.venueId}`);

        console.log("Testing Token Generation...");
        const token = createToken(user);
        console.log("Token:", token);

        console.log("Verifying Token Payload...");
        const payload = verifyToken(token);
        console.log("Token Payload:", payload);

        if (payload.venueId !== user.venueId) {
            throw new Error('Venue ID missing from token payload');
        }
        console.log("SUCCESS: Venue ID present in token.");

        process.exit(0);
    } catch (e) {
        console.error("FAILURE:", e);
        process.exit(1);
    }
};

verify();
