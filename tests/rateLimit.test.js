import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../middleware/rateLimit.js";

// Minimal Express-ish response stub capturing status, body, and headers.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

// Run the middleware once for a given key; returns { res, nexted }.
function hit(mw, ip) {
  const res = mockRes();
  let nexted = false;
  mw({ ip }, res, () => {
    nexted = true;
  });
  return { res, nexted };
}

test("allows requests up to the limit, then blocks with 429", () => {
  const mw = rateLimit({ windowMs: 1000, max: 2, now: () => 1000 });

  let r = hit(mw, "1.1.1.1");
  assert.ok(r.nexted);

  r = hit(mw, "1.1.1.1");
  assert.ok(r.nexted);

  r = hit(mw, "1.1.1.1");
  assert.equal(r.nexted, false);
  assert.equal(r.res.statusCode, 429);
  assert.match(r.res.body.error, /too many requests/i);
  assert.ok(r.res.headers["retry-after"]);
});

test("sets RateLimit headers on allowed responses", () => {
  const mw = rateLimit({ windowMs: 60000, max: 5, now: () => 0 });
  const { res } = hit(mw, "9.9.9.9");
  assert.equal(res.headers["ratelimit-limit"], "5");
  assert.equal(res.headers["ratelimit-remaining"], "4");
  assert.equal(res.headers["ratelimit-reset"], "60");
});

test("resets after the window elapses", () => {
  let clock = 1000;
  const mw = rateLimit({ windowMs: 1000, max: 1, now: () => clock });

  assert.ok(hit(mw, "2.2.2.2").nexted); // 1st allowed
  assert.equal(hit(mw, "2.2.2.2").res.statusCode, 429); // 2nd blocked

  clock += 1000; // advance past the window
  assert.ok(hit(mw, "2.2.2.2").nexted); // allowed again
});

test("tracks each client key independently", () => {
  const mw = rateLimit({ windowMs: 1000, max: 1, now: () => 5 });

  assert.ok(hit(mw, "a").nexted);
  assert.equal(hit(mw, "a").res.statusCode, 429);
  assert.ok(hit(mw, "b").nexted); // different key is unaffected
});
