import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { requireAuth, bearerToken } from "../middleware/auth.js";
import {
  createUser,
  authenticate,
  createSession,
  destroySession,
} from "../data/users.js";

const router = Router();

const credentialsSchema = {
  username: { type: "string", required: true, minLength: 3, maxLength: 50 },
  // Don't trim passwords — leading/trailing spaces are valid characters.
  password: { type: "string", required: true, minLength: 8, maxLength: 200, trim: false },
};

// Register a new account and return a session token.
router.post("/register", validateBody(credentialsSchema), (req, res) => {
  const result = createUser(req.body.username, req.body.password);
  if (result.error) {
    return res.status(409).json({ error: result.error });
  }
  const token = createSession(result.id);
  res.status(201).json({ token, user: result });
});

// Log in with username/password and return a session token.
router.post("/login", validateBody(credentialsSchema), (req, res) => {
  const user = authenticate(req.body.username, req.body.password);
  if (!user) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  const token = createSession(user.id);
  res.json({ token, user });
});

// Invalidate the current session token.
router.post("/logout", requireAuth, (req, res) => {
  destroySession(bearerToken(req));
  res.json({ ok: true });
});

// Return the authenticated user.
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
