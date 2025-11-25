# API Testing Guide

Quick reference guide for testing PlayLink backend API endpoints.

## Using cURL

### User Endpoints

#### 1. Login
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  -c cookies.txt
```

Response:
```json
{
  "id": 1,
  "fullName": "John Doe",
  "email": "user@example.com",
  "phone": "1234567890",
  "accountType": "regular",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### 2. Check Authentication
```bash
curl http://localhost:3000/api/users/authenticate \
  -b cookies.txt
```

Response:
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "accountType": "regular"
  }
}
```

#### 3. Get Current User (Protected)
```bash
curl http://localhost:3000/api/users/me \
  -b cookies.txt
```

#### 4. Get All Users (Protected)
```bash
curl http://localhost:3000/api/users \
  -b cookies.txt
```

### Venue Endpoints

#### 1. Get All Venues
```bash
curl http://localhost:3000/api/venues
```

#### 2. Search Venues
```bash
curl "http://localhost:3000/api/venues?search=basketball"
curl "http://localhost:3000/api/venues?search=downtown"
curl "http://localhost:3000/api/venues?search=badminton"
```

#### 3. Get Top Weekly Venues
```bash
curl http://localhost:3000/api/venues/top-weekly
```

## Using Postman

### Setup

1. Import endpoints as new requests
2. Set base URL: `http://localhost:3000`
3. For protected routes, go to **Cookies** tab and add:
   - Name: `authToken`
   - Value: `<token_from_login>`

### Example Workflow

1. **POST** `/api/users/login`
   - Body (JSON):
   ```json
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```
   - Click **Cookies** and save the `authToken` cookie

2. **GET** `/api/users/me`
   - Select the saved cookie
   - Send request

3. **GET** `/api/venues`
   - No authentication required
   - Try with query: `?search=basketball`

## Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Click the Thunder icon in sidebar
3. Create new request:
   ```
   POST http://localhost:3000/api/users/login
   Content-Type: application/json
   
   {
     "email": "user@example.com",
     "password": "password123"
   }
   ```

## Response Codes Reference

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (missing/invalid parameters) |
| 401 | Unauthorized (invalid credentials) |
| 403 | Forbidden (invalid/expired token) |
| 500 | Server Error |

## Common Errors

### 403 - Session expired or user not logged in
- **Cause:** Missing or invalid authToken cookie
- **Solution:** Login again and ensure cookies are being sent

### 400 - Email and password are required
- **Cause:** Missing email or password in login request
- **Solution:** Ensure both fields are provided in request body

### 401 - Invalid email or password
- **Cause:** Wrong credentials
- **Solution:** Verify email and password are correct

### 500 - Server error
- **Cause:** Database connection issue or server error
- **Solution:** Check server logs and database connection

## Testing Checklist

- [ ] Login with valid credentials
- [ ] Login with invalid password (should return 401)
- [ ] Login with non-existent email (should return 401)
- [ ] Check authentication with valid token
- [ ] Check authentication without token (should return 403)
- [ ] Get current user profile
- [ ] Get all users
- [ ] Fetch all venues
- [ ] Search venues by name
- [ ] Search venues by location
- [ ] Search venues by sport type
- [ ] Get top weekly venues

## Environment Testing

### Development
```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=<your_password>
DB_NAME=playlink_db
JWT_SECRET=dev-secret-key
```

### Production
- Set `secure: true` in cookie configuration
- Use HTTPS URLs (`https://`)
- Set strong `JWT_SECRET`
- Use production database credentials

## Performance Notes

- Venue queries use `GROUP_CONCAT` for efficient aggregation
- Connection pooling prevents database connection exhaustion
- JWT tokens expire after 2 hours
- All database queries use parameterized statements
