// Fixed-window, in-memory rate limiter (per-process — fine for a single-node
// SQLite app). Tracks a count per client key within a rolling window and
// returns 429 once the count exceeds `max`.
//
// `now` is injectable so the behavior can be unit-tested without real time.

export function rateLimit({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, resetAt }

  function middleware(req, res, next) {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const t = now();

    let entry = hits.get(key);
    if (!entry || t >= entry.resetAt) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - t) / 1000));
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("RateLimit-Reset", String(resetSeconds));

    if (entry.count > max) {
      res.set("Retry-After", String(resetSeconds));
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    next();
  }

  // Exposed for tests and graceful resets.
  middleware.reset = () => hits.clear();
  return middleware;
}
