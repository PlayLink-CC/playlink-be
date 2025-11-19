import * as userRepository from "../repositories/UserRepository.js";
import bcrypt from "bcryptjs";

// Return all users
export const getUsers = async () => {
  const users = await userRepository.findAll();

  return users.map((u) => ({
    id: u.userid,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    accountType: u.account_type,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  }));
};

// User login
export const logInUser = async (email, plainPassword) => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Compare plain password with stored hash
  const isMatch = await bcrypt.compare(plainPassword, user.password_hash);

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  return {
    id: user.userid,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    accountType: user.account_type,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
};
