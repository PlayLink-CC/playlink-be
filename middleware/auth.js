// middleware/auth.js
import { verifyToken } from "../utils/authUtil.js";

export const authenticate = (req, res, next) => {
  const token = req.signedCookies.authToken;

  if (!token) {
    return res
      .status(403)
      .json({ error: "Session expired or user not logged in" });
  }

  try {
    const payload = verifyToken(token); // { id, email, accountType, ... }
    req.user = payload; // attach to request
    next();
  } catch (err) {
    console.error(err);
    return res.status(403).json({ error: "Token is invalid or expired" });
  }
};
