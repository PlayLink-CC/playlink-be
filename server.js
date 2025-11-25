/**
 * PlayLink Backend API Server
 *
 * Main entry point for the Express application. Initializes middleware,
 * sets up CORS configuration, and mounts all routes under /api prefix.
 *
 * @module server
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "./routes/index.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // your frontend
    credentials: true,
  })
);

app.use(express.json());

// Secret used for signed cookies (move to env in real app)
app.use(cookieParser("super-secret-cookie-key"));

// Health check
app.get("/", (req, res) => {
  res.send("API is running");
});

// Mount ALL app routes under /api
// e.g. /api/users/login, /api/users/me, etc.
app.use("/api", routes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
