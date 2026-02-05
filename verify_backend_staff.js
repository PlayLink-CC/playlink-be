import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Ensure node-fetch is available or use native fetch if node 18+

dotenv.config();

const API_URL = "http://127.0.0.1:3000/api";

async function runTest() {
    let conn;
    try {
        console.log("--- Starting Staff Management Verification ---");
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        // 1. Get Setup Data
        const [owners] = await conn.execute("SELECT * FROM users WHERE account_type = 'VENUE_OWNER' LIMIT 1");
        if (!owners.length) throw new Error("No Venue Owner found");
        const owner = owners[0];

        const [venues] = await conn.execute("SELECT * FROM venues WHERE owner_id = ?", [owner.user_id]);
        if (!venues.length) throw new Error("Owner has no venues");
        const venue = venues[0];

        // Find or Create Candidate
        let [candidates] = await conn.execute("SELECT * FROM users WHERE email = 'testcandidate@gmail.com'");
        if (!candidates.length) {
            await conn.execute("INSERT INTO users (full_name, email, password_hash, account_type) VALUES ('Candidate', 'testcandidate@gmail.com', '$2b$10$abcdefg', 'PLAYER')");
            [candidates] = await conn.execute("SELECT * FROM users WHERE email = 'testcandidate@gmail.com'");
        }
        let candidate = candidates[0];

        // Reset candidate state just in case
        await conn.execute("UPDATE users SET account_type = 'PLAYER' WHERE user_id = ?", [candidate.user_id]);
        await conn.execute("DELETE FROM employee_venue WHERE user_id = ?", [candidate.user_id]);

        console.log(`Owner: ${owner.email} (${owner.user_id})`);
        console.log(`Venue: ${venue.name} (${venue.venue_id})`);
        console.log(`Candidate: ${candidate.email} (${candidate.user_id})`);

        // 2. Login as Owner to get Token
        // Assuming we can't easily reproduce the password hash to login via API without resetting it.
        // So let's generate a token manually using the authUtil ONLY IF we could import it. 
        // But we are outside the module system usually.
        // EASIER: Just verify the logic by MOCKING the request or simply checking the database EFFECT 
        // if we run the code directly? No, we want to test the API.

        // Let's try to login. I see the user has "Password_123" for some employees. 
        // Does the owner have a known password? The previous logs didn't show one.
        // I will temporarily update the owner's password to a known hash for this test, then revert it? 
        // Or better, I can just use `createToken` from `utils/authUtil.js` if I import it?
        // Since this script is `type: module` (implied or need package.json), let's try importing.

        // Actually, simpler approach:
        // Use a known Employee/User credentials if available, or just INSERT a new Owner for testing.
        // Let's Insert a TEMPORARY OWNER with known password.
        const tempOwnerEmail = `owner_${Date.now()}@test.com`;
        // Hash for 'password': $2b$10$3euPcmQFCiblsZeEu5s7p.9./5.1.7.0.1
        // Wait, I can just use the hash from the prompt: $2b$10$qydX8eY9Gj7pnUTGilBemu4K3OPOeRecWYrtHZXosUkjj9sI4FgHS (Password_123)
        await conn.execute("INSERT INTO users (full_name, email, password_hash, account_type) VALUES ('Temp Owner', ?, '$2b$10$qydX8eY9Gj7pnUTGilBemu4K3OPOeRecWYrtHZXosUkjj9sI4FgHS', 'VENUE_OWNER')", [tempOwnerEmail]);
        const [tempOwners] = await conn.execute("SELECT * FROM users WHERE email = ?", [tempOwnerEmail]);
        const tempOwner = tempOwners[0];

        // Assign venue to this temp owner temporarily (or create a temp venue)
        await conn.execute("UPDATE venues SET owner_id = ? WHERE venue_id = ?", [tempOwner.user_id, venue.venue_id]);

        console.log(`Temp Owner Created: ${tempOwnerEmail}`);

        // Login
        const loginRes = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: tempOwnerEmail, password: 'Password_123' })
        });

        if (!loginRes.ok) throw new Error("Login failed");

        // Get cookie
        const cookies = loginRes.headers.get('set-cookie');

        // 3. Add Staff (The Candidate)
        console.log("Step 3: Adding Staff...");
        const addRes = await fetch(`${API_URL}/venues/${venue.venue_id}/staff`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookies
            },
            body: JSON.stringify({ email: candidate.email })
        });

        const addData = await addRes.json();
        console.log("Add Staff Response:", addRes.status, addData);
        if (!addRes.ok) throw new Error("Failed to add staff");

        // Verify DB
        const [updatedCandidate] = await conn.execute("SELECT * FROM users WHERE user_id = ?", [candidate.user_id]);
        const [link] = await conn.execute("SELECT * FROM employee_venue WHERE user_id = ? AND venue_id = ?", [candidate.user_id, venue.venue_id]);

        if (updatedCandidate[0].account_type !== 'EMPLOYEE') throw new Error("Candidate account_type not updated to EMPLOYEE");
        if (link.length === 0) throw new Error("Link not found in employee_venue");
        console.log("✅ Staff Added Verification Passed");

        // 4. Remove Staff
        console.log("Step 4: Removing Staff...");
        const removeRes = await fetch(`${API_URL}/venues/${venue.venue_id}/staff/${candidate.user_id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookies
            }
        });

        console.log("Remove Staff Response:", removeRes.status);
        if (!removeRes.ok) throw new Error("Failed to remove staff");

        // Verify DB
        const [revertedCandidate] = await conn.execute("SELECT * FROM users WHERE user_id = ?", [candidate.user_id]);
        const [linkGone] = await conn.execute("SELECT * FROM employee_venue WHERE user_id = ? AND venue_id = ?", [candidate.user_id, venue.venue_id]);

        if (revertedCandidate[0].account_type !== 'PLAYER') throw new Error("Candidate account_type not reverted to PLAYER");
        if (linkGone.length > 0) throw new Error("Link still exists in employee_venue");
        console.log("✅ Staff Removal Verification Passed");

        // Cleanup
        await conn.execute("UPDATE venues SET owner_id = ? WHERE venue_id = ?", [owner.user_id, venue.venue_id]); // Restore owner
        await conn.execute("DELETE FROM users WHERE user_id = ?", [tempOwner.user_id]); // Delete temp owner
        await conn.execute("DELETE FROM users WHERE user_id = ?", [candidate.user_id]); // Delete candidate

        console.log("--- TEST PASSED SUCCESSFULLY ---");

    } catch (e) {
        console.error("Test Failed:", e);
    } finally {
        if (conn) await conn.end();
    }
}

runTest();
