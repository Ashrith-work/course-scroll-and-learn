import { userForToken } from "../data/users.js";

// Extract a Bearer token from the Authorization header, if present.
export function bearerToken(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Require a valid session token. Attaches req.user or responds 401.
export function requireAuth(req, res, next) {
  const user = userForToken(bearerToken(req));
  if (!user) {
    return res.status(401).json({ error: "authentication required" });
  }
  req.user = user;
  next();
}
