// controllers/UserController.js
import { getUsers, logInUser } from "../services/UserService.js";
import { createToken, verifyToken } from "../utils/authUtil.js";

// GET /api/users
export const getAllUsers = async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/users/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await logInUser(email, password);

    const token = createToken({
      id: user.id,
      email: user.email,
      accountType: user.accountType,
    });

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: false, // for localhost
      maxAge: 1000 * 60 * 60, // 1 hour
      signed: true,
      sameSite: "None",
    });

    res.json(user);
  } catch (err) {
    console.error(err);

    if (err.message === "Invalid credentials") {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/users/authenticate
// Quick endpoint to check current session from cookie
export const authenticateUser = async (req, res) => {
  try {
    const token = req.signedCookies.authToken;

    if (!token) {
      return res
        .status(403)
        .json({ error: "Session expired or user not logged in" });
    }

    const payload = verifyToken(token);

    res.json({ user: payload });
  } catch (err) {
    console.error(err);
    res.status(403).json({ error: "Token is invalid or expired" });
  }
};
