# Architecture Documentation

## System Architecture Overview

PlayLink backend follows a layered architecture pattern with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────┐
│                    Express.js Server                         │
│                   (server.js - Port 3000)                    │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│              Routes Layer (routes/*.js)                      │
│  - Mounts endpoints at /api prefix                           │
│  - Routes requests to appropriate controllers                │
│  - Applies middleware (authentication)                       │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│         Controllers Layer (controllers/*.js)                 │
│  - Handles HTTP request/response                             │
│  - Input validation                                          │
│  - Calls appropriate services                                │
│  - Formats and sends responses                               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│          Services Layer (services/*.js)                      │
│  - Core business logic                                       │
│  - Data transformation                                       │
│  - Cross-module coordination                                 │
│  - Orchestrates repository calls                             │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│        Repositories Layer (repositories/*.js)                │
│  - Direct database access                                    │
│  - SQL query execution                                       │
│  - Returns raw database results                              │
│  - Parameterized queries for security                        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│         MySQL Database Connection Pool                       │
│              (config/dbconnection.js)                        │
│  - Connection pooling for performance                        │
│  - Manages MySQL connections efficiently                     │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│               MySQL Database Instance                        │
│  - Stores all application data                               │
│  - Manages relationships and constraints                     │
└─────────────────────────────────────────────────────────────┘
```

## Module Structure

### Core Modules

#### 1. Routes (`routes/`)
- **index.js** - Aggregates all route modules
- **User.js** - User authentication and profile routes
- **Venue.js** - Venue discovery and search routes

**Responsibilities:**
- Define HTTP endpoints
- Mount middleware (authentication)
- Route requests to controllers

#### 2. Controllers (`controllers/`)
- **UserController.js** - User request handlers
- **VenueController.js** - Venue request handlers

**Responsibilities:**
- Extract request data (params, body, query)
- Validate input
- Call appropriate service methods
- Handle errors and format responses
- Set HTTP status codes

**Example Flow:**
```
Request → Controller.login()
  ↓
Validates email & password
  ↓
Calls UserService.logInUser()
  ↓
Receives user object
  ↓
Creates JWT token
  ↓
Sets cookie in response
  ↓
Returns user data
```

#### 3. Services (`services/`)
- **UserService.js** - User business logic
- **VenueService.js** - Venue business logic

**Responsibilities:**
- Implement business rules
- Data transformation
- Coordinate multiple repositories
- Password verification (bcrypt)
- Error handling

**Example:**
```javascript
export const logInUser = async (email, plainPassword) => {
  // 1. Find user by email
  const user = await userRepository.findByEmail(email);
  
  // 2. Validate user exists
  if (!user) throw new Error("Invalid credentials");
  
  // 3. Verify password
  const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
  if (!isMatch) throw new Error("Invalid credentials");
  
  // 4. Return formatted user object
  return formatUserResponse(user);
};
```

#### 4. Repositories (`repositories/`)
- **UserRepository.js** - User data access
- **VenueRepository.js** - Venue data access

**Responsibilities:**
- Execute database queries
- Return raw database results
- Use parameterized queries (prevent SQL injection)
- Handle database connections

**Example:**
```javascript
export const findByEmail = async (email) => {
  const sql = `SELECT * FROM users WHERE email = ?`;
  const [rows] = await connectDB.execute(sql, [email]);
  return rows[0];
};
```

### Support Modules

#### 5. Middleware (`middleware/`)
- **auth.js** - JWT authentication middleware

**Responsibilities:**
- Verify JWT tokens from cookies
- Attach user data to request
- Protect routes from unauthorized access

#### 6. Utilities (`utils/`)
- **authUtil.js** - JWT token management

**Responsibilities:**
- Create signed JWT tokens
- Verify and decode tokens
- Handle token expiration

#### 7. Configuration (`config/`)
- **dbconnection.js** - Database connection pool

**Responsibilities:**
- Initialize MySQL connection pool
- Load credentials from environment
- Provide connection to repositories

## Request Lifecycle

### 1. Login Request

```
POST /api/users/login
↓
Routes.User (mount point)
↓
UserController.login()
  - Extract email & password from req.body
  - Validate both fields exist
  ↓
UserService.logInUser(email, password)
  - Call UserRepository.findByEmail(email)
  ↓
UserRepository.findByEmail()
  - Execute: SELECT * FROM users WHERE email = ?
  - Return user record with password_hash
  ↓
Back to UserService
  - Compare password with bcrypt.compare()
  - Verify password matches
  - Transform and return user object
  ↓
Back to UserController
  - Create JWT token via authUtil.createToken()
  - Set authToken cookie (httpOnly, signed)
  - Return user object
  ↓
Response (200 OK)
Set-Cookie: authToken=jwt_token; HttpOnly; Signed
Body: {id, fullName, email, ...}
```

### 2. Protected Route Request

```
GET /api/users/me (with authToken cookie)
↓
Routes.User
↓
authenticate middleware
  - Extract authToken from req.signedCookies
  - Verify token via authUtil.verifyToken()
  - Attach decoded payload to req.user
  - Call next()
  ↓
Handler function
  - Access req.user (contains id, email, accountType)
  - Return user data
  ↓
Response (200 OK)
```

### 3. Venue Search Request

```
GET /api/venues?search=basketball
↓
Routes.Venue (mount point)
↓
VenueController.fetchAllVenues()
  - Extract search query parameter
  - Check if search exists and not empty
  ↓
If search provided:
  - Call VenueService.searchVenues(searchText)
  ↓
If no search:
  - Call VenueService.getAllVenues()
  ↓
VenueService.searchVenues(searchText)
  - Call VenueRepository.findVenuesBySearch(searchText)
  ↓
VenueRepository.findVenuesBySearch()
  - Execute complex SQL with JOINs and GROUP_CONCAT
  - Search: name LIKE %, address LIKE %, sport LIKE %
  - Return matching venue records
  ↓
Back to VenueService
  - Return results as-is
  ↓
Back to VenueController
  - Return venues in response
  ↓
Response (200 OK)
Body: [{venue_id, venue_name, location, ...}, ...]
```

## Data Flow Diagrams

### Authentication Flow

```
User (Client)
  ↓
POST /login → UserController.login()
  ↓
UserService.logInUser()
  ↓
UserRepository.findByEmail()
  ↓
MySQL (SELECT user by email)
  ↓
[user record] → Back to Service
  ↓
bcrypt.compare() → Verify password
  ↓
[transformation] → Back to Controller
  ↓
createToken() → Create JWT
  ↓
[set cookie] → setcookie header
  ↓
Response: 200 OK + authToken cookie
```

### Protected Route Access

```
Client (has authToken cookie)
  ↓
GET /protected → authenticate middleware
  ↓
Extract authToken from cookies
  ↓
verifyToken() → Decode and validate JWT
  ↓
[valid] → req.user = payload
  ↓
next() → Call route handler
  ↓
Handler executes
  ↓
Response: 200 OK
```

## Error Handling Strategy

### Controller Level
```javascript
export const login = async (req, res) => {
  try {
    // Validate input
    if (!email || !password) {
      return res.status(400).json({message: "..."});
    }
    
    // Call service
    const user = await logInUser(email, password);
    
    // Success
    res.json(user);
  } catch (err) {
    // Handle specific errors
    if (err.message === "Invalid credentials") {
      return res.status(401).json({message: "..."});
    }
    
    // Generic error
    res.status(500).json({message: "Server error"});
  }
};
```

### Service Level
```javascript
export const logInUser = async (email, plainPassword) => {
  const user = await userRepository.findByEmail(email);
  
  if (!user) {
    throw new Error("Invalid credentials"); // Will be caught by controller
  }
  
  const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
  
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }
  
  return user; // Success path
};
```

## Separation of Concerns

| Layer | Responsibility | Example |
|-------|-----------------|---------|
| **Routes** | HTTP endpoint mapping | `router.get('/me', authenticate, handler)` |
| **Controllers** | HTTP I/O, validation | Extracting query params, formatting JSON |
| **Services** | Business logic | Password verification, data transformation |
| **Repositories** | Database access | SQL queries, parameter binding |
| **Middleware** | Cross-cutting concerns | JWT verification, CORS, cookie parsing |
| **Utils** | Helper functions | Token creation, password hashing |
| **Config** | Environment setup | Database connection pooling |

## Security Layers

1. **Parameterized Queries** - All repository queries use parameter binding to prevent SQL injection
   ```javascript
   const sql = `SELECT * FROM users WHERE email = ?`;
   const [rows] = await connectDB.execute(sql, [email]); // Safe
   ```

2. **Password Hashing** - Passwords hashed with bcryptjs before storage
   ```javascript
   const isMatch = await bcrypt.compare(plainPassword, storedHash);
   ```

3. **JWT Authentication** - Protected routes verify signed tokens
   ```javascript
   export const authenticate = (req, res, next) => {
     const token = req.signedCookies.authToken;
     const payload = verifyToken(token);
     req.user = payload;
     next();
   };
   ```

4. **HttpOnly Cookies** - JWT stored in httpOnly cookie, inaccessible to JavaScript
   ```javascript
   res.cookie("authToken", token, {
     httpOnly: true,
     secure: false, // true in production
     signed: true
   });
   ```

## Performance Optimizations

1. **Connection Pooling** - Reuses database connections
   ```javascript
   const pool = mysql.createPool({...});
   ```

2. **Aggregation in Database** - Uses `GROUP_CONCAT` for efficient data collection
   ```javascript
   GROUP_CONCAT(DISTINCT s.name ORDER BY s.name) AS sports
   ```

3. **Single Instance JWT Signer/Verifier** - Created once and reused
   ```javascript
   const sign = createSigner({...});
   const verify = createVerifier({...});
   ```

4. **Selective Fields** - Only retrieves necessary columns
   ```javascript
   SELECT user_id, full_name, email FROM users
   // NOT: SELECT *
   ```

## Testing Strategy

Each layer can be tested independently:

1. **Repository Tests** - Mock database, verify SQL correctness
2. **Service Tests** - Mock repositories, test business logic
3. **Controller Tests** - Mock services, test request/response handling
4. **Integration Tests** - Test full request flow with real database

## Future Enhancements

- Add logging layer (Winston/Pino)
- Implement caching (Redis)
- Add request validation schema (Joi)
- Implement rate limiting
- Add comprehensive error codes
- Database migrations system
- API versioning (v1, v2)
