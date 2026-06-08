// User accounts and opaque session tokens, backed by SQLite.
// Passwords are hashed with scrypt (built into Node — no native deps).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import db from "./db.js";

const insertUser = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
const userByName = db.prepare(
  "SELECT id, username, password_hash FROM users WHERE username = ?"
);
const insertSession = db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)");
const sessionByToken = db.prepare(
  `SELECT u.id, u.username FROM sessions s
   JOIN users u ON u.id = s.user_id
   WHERE s.token = ?`
);
const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Create a user. Returns { id, username } or { error } if the name is taken.
export function createUser(username, password) {
  try {
    const { lastInsertRowid } = insertUser.run(username, hashPassword(password));
    return { id: Number(lastInsertRowid), username };
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return { error: "username already taken" };
    }
    throw err;
  }
}

// Verify credentials. Returns { id, username } or undefined.
export function authenticate(username, password) {
  const row = userByName.get(username);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return undefined;
  }
  return { id: row.id, username: row.username };
}

export function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  insertSession.run(token, userId);
  return token;
}

// Resolve a session token to { id, username }, or undefined if invalid.
export function userForToken(token) {
  if (!token) return undefined;
  return sessionByToken.get(token) ?? undefined;
}

export function destroySession(token) {
  deleteSession.run(token);
}
