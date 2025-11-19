import { createSigner, createVerifier } from "fast-jwt";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-me";
const JWT_EXPIRES_IN = "2h";

// Create signer & verifier once
const sign = createSigner({
  key: JWT_SECRET,
  expiresIn: JWT_EXPIRES_IN,
});

const verify = createVerifier({
  key: JWT_SECRET,
});

export const createToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
  };

  return sign(payload);
};

export const verifyToken = (token) => {
  // Returns full payload we signed above
  const payload = verify(token);
  return payload;
};
