
import fetch from 'node-fetch';

const BASE_URL = 'http://127.0.0.1:3000/api'; // Trying 127.0.0.1 to avoid ipv6 issues

async function testDashboard() {
    try {
        console.log("1. Logging in as Employee...");
        const loginRes = await fetch(`${BASE_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test_employee@example.com',
                password: 'Password123!'
            })
        });

        if (!loginRes.ok) {
            const errText = await loginRes.text();
            throw new Error(`Login failed: ${loginRes.status} ${errText}`);
        }

        const loginData = await loginRes.json();
        if (loginData.accountType !== 'EMPLOYEE') {
            throw new Error(`Login failed or wrong account type: ${loginData.accountType}`);
        }

        // Get cookies (node-fetch handles headers differently? get('set-cookie') might return all? Check logic)
        // loginRes.headers.raw()['set-cookie'] might be needed for multiple cookies, but simple login usually one.
        const cookies = loginRes.headers.get('set-cookie');
        console.log("Login successful.");

        console.log("2. Fetching Today's Summary...");
        const summaryRes = await fetch(`${BASE_URL}/employee/today-summary`, {
            method: 'GET',
            headers: {
                'Cookie': cookies
            }
        });

        if (!summaryRes.ok) {
            const errText = await summaryRes.text();
            throw new Error(`Dashboard fetch failed: ${summaryRes.status} ${errText}`);
        }

        const data = await summaryRes.json();
        console.log("Response:", JSON.stringify(data, null, 2));

        if (data.courtStatus) {
            console.log("✅ Verification Successful: Dashboard data received.");
        } else {
            console.error("❌ Verification Failed: Invalid response structure.");
        }

    } catch (error) {
        console.error("❌ Test Failed:", error);
    }
}

testDashboard();
