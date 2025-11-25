# PlayLink Backend API

A Node.js/Express-based REST API for managing sports venues, bookings, and user authentication. This backend supports venue search, booking management, and user account functionality.

## Table of Contents

- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Development](#development)

---

## Project Structure

```
backend/
├── server.js                 # Entry point - Express app initialization
├── package.json              # Project dependencies
├── config/
│   └── dbconnection.js       # MySQL connection pool setup
├── controllers/
│   ├── UserController.js     # User-related request handlers
│   └── VenueController.js    # Venue-related request handlers
├── services/
│   ├── UserService.js        # User business logic
│   └── VenueService.js       # Venue business logic
├── repositories/
│   ├── UserRepository.js     # User data access layer
│   └── VenueRepository.js    # Venue data access layer
├── routes/
│   ├── index.js              # Route aggregator
│   ├── User.js               # User route definitions
│   └── Venue.js              # Venue route definitions
├── middleware/
│   └── auth.js               # JWT authentication middleware
└── utils/
    └── authUtil.js           # JWT token creation & verification
```

### Architecture Pattern

This project follows the **3-Layer Architecture** pattern:

1. **Controllers** → Handle HTTP requests/responses
2. **Services** → Contain business logic and validation
3. **Repositories** → Manage database operations

This separation ensures clean, maintainable, and testable code.

---

## Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- MySQL database
- npm or yarn package manager

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file in the root directory** with your database credentials:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=playlink_db
   DB_PORT=3306
   JWT_SECRET=your_secret_key_here
   PORT=3000
   ```

4. **Run the server**
   ```bash
   # Production mode
   npm start

   # Development mode with auto-restart
   npm run dev
   ```

The API will be available at `http://localhost:3000`

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL server hostname | localhost |
| `DB_USER` | MySQL username | - |
| `DB_PASSWORD` | MySQL password | - |
| `DB_NAME` | Database name | - |
| `DB_PORT` | MySQL port | 3306 |
| `JWT_SECRET` | Secret key for JWT signing | dev-secret-key-change-me |
| `PORT` | Server port | 3000 |

---

## Architecture

### Request Flow

```
HTTP Request
    ↓
Route (routes/*.js)
    ↓
Controller (controllers/*.js) - Validates input, calls service
    ↓
Service (services/*.js) - Business logic, data transformation
    ↓
Repository (repositories/*.js) - Database queries
    ↓
Database (MySQL)
    ↓
Response (JSON)
```

---

## API Endpoints

### User Endpoints

#### POST `/api/users/login`
Authenticate a user and create a session token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
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

**Errors:**
- `400 Bad Request` - Missing email or password
- `401 Unauthorized` - Invalid credentials
- `500 Server Error` - Database error

**Note:** On successful login, an `authToken` cookie is set (httpOnly, expires in 1 hour).

---

#### GET `/api/users/authenticate`
Check the current session without authentication middleware.

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "accountType": "regular"
  }
}
```

**Errors:**
- `403 Forbidden` - Session expired or no token

---

#### GET `/api/users/me`
Get the current authenticated user's information. **Protected route.**

**Headers:**
```
Cookie: authToken=<jwt_token>
```

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "accountType": "regular"
  }
}
```

**Errors:**
- `403 Forbidden` - Invalid or missing token

---

#### GET `/api/users`
Retrieve all users. **Protected route.**

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "1234567890",
    "accountType": "regular",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  },
  ...
]
```

---

### Venue Endpoints

#### GET `/api/venues`
Fetch all venues or search for venues by name, location, or sport type.

**Query Parameters:**
- `search` (optional) - Search term to filter venues by name, address, city, or sport

**Response (200 OK):**
```json
[
  {
    "venue_id": 1,
    "venue_name": "Downtown Sports Complex",
    "location": "123 Main St, City",
    "court_types": "Basketball, Badminton",
    "price_per_hour": 50,
    "primary_image": "https://example.com/image.jpg",
    "amenities": "Parking, WiFi, Locker Room"
  },
  ...
]
```

**Examples:**
- Get all venues: `GET /api/venues`
- Search venues: `GET /api/venues?search=basketball`

---

#### GET `/api/venues/top-weekly`
Get the top 4 most booked venues from the past 7 days.

**Response (200 OK):**
```json
[
  {
    "venue_id": 1,
    "venue_name": "Downtown Sports Complex",
    "location": "123 Main St, City",
    "price_per_hour": 50,
    "primary_image": "https://example.com/image.jpg",
    "amenities": "Parking, WiFi, Locker Room",
    "bookings_this_week": 15
  },
  ...
]
```

---

## Database Schema

### Key Tables

#### Users
```sql
- user_id (PK)
- full_name
- email (UNIQUE)
- password_hash
- phone
- account_type (enum: 'regular', 'venue_owner', 'admin')
- created_at
- updated_at
```

#### Venues
```sql
- venue_id (PK)
- name
- address
- city
- price_per_hour
- is_active
- created_at
- updated_at
```

#### Bookings
```sql
- booking_id (PK)
- user_id (FK)
- venue_id (FK)
- booking_start
- booking_end
- status (enum: 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED')
- created_at
- updated_at
```

#### Venues ↔ Sports (Many-to-Many)
```sql
- venue_sports.venue_id (FK)
- venue_sports.sport_id (FK)
- sports.sport_id (PK)
- sports.name
```

#### Amenities
```sql
- amenities.amenity_id (PK)
- amenities.name
- venue_amenities.venue_id (FK)
- venue_amenities.amenity_id (FK)
```

#### Venue Images
```sql
- venue_images.image_id (PK)
- venue_images.venue_id (FK)
- venue_images.image_url
- venue_images.is_primary (boolean)
```

---

## Authentication

### JWT Token Flow

1. **User logs in** via `POST /api/users/login`
2. **Server generates JWT** containing:
   - User ID
   - Email
   - Account Type
   - Expiration time (2 hours)
3. **Token stored** in an `authToken` cookie (httpOnly, secure, signed)
4. **Protected routes** verify the token via `authenticate` middleware
5. **User data attached** to `req.user` for downstream access

### Token Details

- **Algorithm:** HS256
- **Expiration:** 2 hours
- **Storage:** HTTP-only signed cookie
- **Verification:** via `fast-jwt` library

### Cookie Configuration

- `httpOnly: true` - Prevents client-side JavaScript access
- `secure: false` - Set to `true` in production (HTTPS only)
- `maxAge: 3600000` - 1 hour expiration
- `signed: true` - Cryptographically signed
- `sameSite: 'None'` - Cross-site request allowed (adjust for security needs)

---

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses `nodemon` to automatically restart the server on file changes.

### Testing Endpoints

Using `curl`:

```bash
# Login
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  -c cookies.txt

# Get current user (with cookies)
curl http://localhost:3000/api/users/me \
  -b cookies.txt

# Search venues
curl "http://localhost:3000/api/venues?search=basketball"

# Get top weekly venues
curl http://localhost:3000/api/venues/top-weekly
```

### Dependencies

- **express** - Web framework
- **mysql2** - MySQL driver with connection pooling
- **jsonwebtoken** - JWT token generation & verification
- **fast-jwt** - High-performance JWT library
- **bcryptjs** - Password hashing & verification
- **cors** - Cross-Origin Resource Sharing middleware
- **cookie-parser** - Parse signed cookies
- **dotenv** - Environment variable management

### Dev Dependencies

- **nodemon** - Auto-restart on file changes

---

## Best Practices

1. **Always use parameterized queries** to prevent SQL injection
2. **Hash passwords** using bcryptjs before storing
3. **Validate input** in controllers before processing
4. **Use try-catch** blocks for error handling
5. **Set JWT_SECRET** in production environment
6. **Use HTTPS** in production
7. **Store sensitive data** in environment variables
8. **Use connection pooling** for database queries

---

## Security Notes

⚠️ **Before deploying to production:**

1. Set `secure: true` in cookie configuration for HTTPS
2. Change `JWT_SECRET` to a strong, random value
3. Update CORS origin to your frontend domain
4. Enable HTTPS on your server
5. Implement rate limiting on login endpoint
6. Add input validation and sanitization
7. Consider adding request logging and monitoring

---

## Troubleshooting

### Connection Issues

**Error: Cannot connect to database**
- Verify MySQL is running
- Check `.env` credentials
- Ensure database exists

### Authentication Issues

**Error: Token is invalid or expired**
- Clear browser cookies
- Log in again to get a fresh token
- Check JWT_SECRET matches

### CORS Issues

**Error: CORS policy blocked request**
- Verify frontend URL in CORS configuration
- Check `credentials: true` is set
