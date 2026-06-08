import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Use a throwaway database so tests never touch the real courses.db.
// DB_PATH must be set before importing the app (db.js reads it on load).
const dbPath = join(tmpdir(), `courses-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbPath;

// Raise the auth rate limit so the many auth calls in this suite never trip it.
// The limiter's own behavior is covered by tests/rateLimit.test.js.
process.env.AUTH_RATELIMIT_MAX = "10000";

let server;
let baseURL;
let authToken = null;

before(async () => {
  const { default: app } = await import("../index.js");
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseURL = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  // Register a default user; req() sends this token so write tests are authed.
  const res = await req(
    "POST",
    "/auth/register",
    { username: "tester", password: "password123" },
    { auth: false }
  );
  authToken = (await res.json()).token;
});

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  // Close the SQLite handle so Windows releases the file lock before deletion.
  const { default: db } = await import("../data/db.js");
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }
});

// By default, authenticated requests carry the default user's token. Pass
// { auth: false } to send no Authorization header, or { token } for a specific one.
function req(method, path, body, { auth = true, token } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const bearer = token ?? (auth ? authToken : null);
  if (bearer) opts.headers["Authorization"] = `Bearer ${bearer}`;
  return fetch(baseURL + path, opts);
}

// --- Health & static ---

test("GET /health returns ok", async () => {
  const res = await req("GET", "/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("GET / serves the frontend", async () => {
  const res = await req("GET", "/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(await res.text(), /Scroll/);
});

test("GET /openapi.json serves a valid OpenAPI 3 document", async () => {
  const res = await req("GET", "/openapi.json");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  const spec = await res.json();
  assert.match(spec.openapi, /^3\./);
  assert.equal(spec.info.title, "Course Scroll and Learn API");
  // Spot-check that key paths are documented.
  for (const path of [
    "/health",
    "/courses",
    "/courses/{id}",
    "/courses/{courseId}/lessons",
    "/auth/register",
    "/auth/login",
  ]) {
    assert.ok(spec.paths[path], `missing path ${path}`);
  }
  assert.ok(spec.components.schemas.Course);
  // Auth is documented as a bearer security scheme, and writes require it.
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, "bearer");
  assert.ok(spec.paths["/courses"].post.security);
});

test("GET /docs serves the Swagger UI page", async () => {
  const res = await req("GET", "/docs");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /swagger-ui/);
  assert.match(html, /\/openapi\.json/);
});

// --- Auth ---

test("POST /auth/register creates a user and returns a token", async () => {
  const res = await req(
    "POST",
    "/auth/register",
    { username: "alice", password: "supersecret" },
    { auth: false }
  );
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.user.username, "alice");
  assert.ok(typeof data.token === "string" && data.token.length > 0);
  // Secrets must never be returned.
  assert.equal(data.user.password, undefined);
  assert.equal(data.user.password_hash, undefined);
});

test("registering a duplicate username returns 409", async () => {
  await req("POST", "/auth/register", { username: "bob", password: "supersecret" }, { auth: false });
  const res = await req(
    "POST",
    "/auth/register",
    { username: "bob", password: "supersecret" },
    { auth: false }
  );
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /already taken/);
});

test("registering with a short password returns 400", async () => {
  const res = await req(
    "POST",
    "/auth/register",
    { username: "shorty", password: "123" },
    { auth: false }
  );
  assert.equal(res.status, 400);
});

test("login with correct credentials returns a token", async () => {
  await req("POST", "/auth/register", { username: "carol", password: "supersecret" }, { auth: false });
  const res = await req(
    "POST",
    "/auth/login",
    { username: "carol", password: "supersecret" },
    { auth: false }
  );
  assert.equal(res.status, 200);
  assert.ok((await res.json()).token);
});

test("login with a wrong password returns 401", async () => {
  await req("POST", "/auth/register", { username: "dave", password: "supersecret" }, { auth: false });
  const res = await req(
    "POST",
    "/auth/login",
    { username: "dave", password: "wrongpassword" },
    { auth: false }
  );
  assert.equal(res.status, 401);
});

test("login for an unknown user returns 401", async () => {
  const res = await req(
    "POST",
    "/auth/login",
    { username: "ghost", password: "supersecret" },
    { auth: false }
  );
  assert.equal(res.status, 401);
});

test("GET /auth/me returns the current user", async () => {
  const res = await req("GET", "/auth/me");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.username, "tester");
});

test("GET /auth/me without a token returns 401", async () => {
  const res = await req("GET", "/auth/me", undefined, { auth: false });
  assert.equal(res.status, 401);
});

test("auth endpoints expose rate-limit headers", async () => {
  // Confirms the limiter is actually mounted on the credential routes.
  const res = await req(
    "POST",
    "/auth/login",
    { username: "tester", password: "password123" },
    { auth: false }
  );
  assert.ok(res.headers.get("ratelimit-limit"));
  assert.ok(res.headers.get("ratelimit-remaining"));
});

test("logout invalidates the token", async () => {
  const reg = await (
    await req("POST", "/auth/register", { username: "frank", password: "supersecret" }, { auth: false })
  ).json();
  const out = await req("POST", "/auth/logout", undefined, { token: reg.token });
  assert.equal(out.status, 200);
  const me = await req("GET", "/auth/me", undefined, { token: reg.token });
  assert.equal(me.status, 401);
});

// --- Auth enforcement on writes ---

test("listing courses works without auth", async () => {
  const res = await req("GET", "/courses", undefined, { auth: false });
  assert.equal(res.status, 200);
});

test("creating a course without auth returns 401", async () => {
  const res = await req("POST", "/courses", { title: "Nope" }, { auth: false });
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /authentication required/);
});

test("creating a lesson without auth returns 401", async () => {
  const res = await req("POST", "/courses/1/lessons", { title: "Nope" }, { auth: false });
  assert.equal(res.status, 401);
});

test("reordering lessons without auth returns 401", async () => {
  const res = await req("PUT", "/courses/1/lessons/reorder", { order: [1, 2] }, { auth: false });
  assert.equal(res.status, 401);
});

// --- Courses ---

test("GET /courses returns the seeded courses", async () => {
  const res = await req("GET", "/courses");
  assert.equal(res.status, 200);
  const courses = await res.json();
  assert.equal(courses.length, 3);
  assert.equal(courses[0].title, "Intro to JavaScript");
});

test("GET /courses?q= filters by title", async () => {
  const res = await req("GET", "/courses?q=Node");
  assert.equal(res.status, 200);
  const courses = await res.json();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].title, "Node.js Fundamentals");
});

test("course search is case-insensitive and matches title or description", async () => {
  // "javascript" appears in course 1's title and course 2's description.
  const courses = await (await req("GET", "/courses?q=javascript")).json();
  const titles = courses.map((c) => c.title).sort();
  assert.deepEqual(titles, ["Intro to JavaScript", "Node.js Fundamentals"]);
});

test("course search matches the description", async () => {
  const courses = await (await req("GET", "/courses?q=Express")).json();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].title, "Building REST APIs");
});

test("course search with no matches returns an empty array", async () => {
  const courses = await (await req("GET", "/courses?q=nonexistentterm")).json();
  assert.deepEqual(courses, []);
});

test("course search treats LIKE wildcards literally", async () => {
  // '%' must not act as a wildcard that matches everything.
  const courses = await (await req("GET", "/courses?q=%25")).json();
  assert.deepEqual(courses, []);
});

test("blank search query returns all courses", async () => {
  const courses = await (await req("GET", "/courses?q=%20%20")).json();
  assert.equal(courses.length, 3);
});

test("GET /courses?limit caps results and sets X-Total-Count", async () => {
  const res = await req("GET", "/courses?limit=2");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-total-count"), "3");
  const courses = await res.json();
  assert.deepEqual(
    courses.map((c) => c.id),
    [1, 2]
  );
});

test("GET /courses?offset skips earlier rows", async () => {
  const res = await req("GET", "/courses?limit=2&offset=2");
  const courses = await res.json();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].id, 3);
});

test("offset past the end returns an empty page (total still reported)", async () => {
  const res = await req("GET", "/courses?limit=2&offset=99");
  assert.equal(res.headers.get("x-total-count"), "3");
  assert.deepEqual(await res.json(), []);
});

test("pagination composes with search", async () => {
  const res = await req("GET", "/courses?q=javascript&limit=1");
  assert.equal(res.headers.get("x-total-count"), "2");
  const courses = await res.json();
  assert.equal(courses.length, 1);
});

test("GET /courses with a non-integer limit returns 400", async () => {
  const res = await req("GET", "/courses?limit=abc");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /limit must be an integer/);
});

test("GET /courses with a negative offset returns 400", async () => {
  const res = await req("GET", "/courses?offset=-1");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /offset must be an integer/);
});

test("GET /courses with limit above the max returns 400", async () => {
  const res = await req("GET", "/courses?limit=101");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /between 1 and 100/);
});

// Seeded titles: 1 "Intro to JavaScript", 2 "Node.js Fundamentals",
// 3 "Building REST APIs". Alphabetical => [3, 1, 2].
test("GET /courses?sort=title orders alphabetically", async () => {
  const courses = await (await req("GET", "/courses?sort=title")).json();
  assert.deepEqual(
    courses.map((c) => c.id),
    [3, 1, 2]
  );
});

test("GET /courses?sort=title&order=desc reverses the order", async () => {
  const courses = await (await req("GET", "/courses?sort=title&order=desc")).json();
  assert.deepEqual(
    courses.map((c) => c.id),
    [2, 1, 3]
  );
});

test("GET /courses?sort=id&order=desc lists newest first", async () => {
  const courses = await (await req("GET", "/courses?sort=id&order=desc")).json();
  assert.deepEqual(
    courses.map((c) => c.id),
    [3, 2, 1]
  );
});

test("sorting composes with pagination", async () => {
  const res = await req("GET", "/courses?sort=title&order=asc&limit=1");
  const courses = await res.json();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].id, 3); // "Building REST APIs" sorts first
});

test("GET /courses with an invalid sort field returns 400", async () => {
  const res = await req("GET", "/courses?sort=bogus");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /sort must be one of/);
});

test("GET /courses with an invalid order returns 400", async () => {
  const res = await req("GET", "/courses?order=sideways");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /order must be one of/);
});

test("GET /courses/:id returns one course", async () => {
  const res = await req("GET", "/courses/1");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, "Intro to JavaScript");
});

test("GET /courses/:id returns 404 for unknown id", async () => {
  const res = await req("GET", "/courses/9999");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Course not found");
});

test("POST /courses creates a course", async () => {
  const res = await req("POST", "/courses", { title: "CSS Mastery", description: "Style" });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.title, "CSS Mastery");
  assert.ok(Number.isInteger(created.id));

  const fetched = await (await req("GET", `/courses/${created.id}`)).json();
  assert.deepEqual(fetched, created);
});

test("POST /courses without a title returns 400", async () => {
  const res = await req("POST", "/courses", { description: "no title" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "title is required");
});

test("POST /courses with a blank title returns 400", async () => {
  const res = await req("POST", "/courses", { title: "   " });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "title is required");
});

test("POST /courses with a non-string title returns 400", async () => {
  const res = await req("POST", "/courses", { title: 123 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "title must be a string");
});

test("POST /courses trims the title", async () => {
  const created = await (await req("POST", "/courses", { title: "  Trimmed  " })).json();
  assert.equal(created.title, "Trimmed");
});

test("POST /courses enforces title maxLength", async () => {
  const res = await req("POST", "/courses", { title: "x".repeat(201) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /at most 200/);
});

test("malformed JSON body returns 400", async () => {
  const res = await fetch(baseURL + "/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not json ",
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Invalid JSON body");
});

test("PUT /courses/:id updates a course", async () => {
  const created = await (await req("POST", "/courses", { title: "Temp" })).json();
  const res = await req("PUT", `/courses/${created.id}`, { title: "Renamed" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, "Renamed");
});

test("PUT /courses/:id returns 404 for unknown id", async () => {
  const res = await req("PUT", "/courses/9999", { title: "Nope" });
  assert.equal(res.status, 404);
});

// --- Lessons (nested) ---

test("GET /courses/:id/lessons returns seeded lessons sorted by order", async () => {
  const res = await req("GET", "/courses/1/lessons");
  assert.equal(res.status, 200);
  const lessons = await res.json();
  assert.equal(lessons.length, 2);
  assert.deepEqual(
    lessons.map((l) => l.order),
    [1, 2]
  );
  assert.ok(lessons.every((l) => l.courseId === 1));
});

// Course 1 seeded lessons: id 1 "Variables and Types" (order 1,
// content "let, const, and primitives"), id 2 "Functions" (order 2).
test("lesson search filters by title", async () => {
  const lessons = await (await req("GET", "/courses/1/lessons?q=Functions")).json();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].id, 2);
});

test("lesson search filters by content", async () => {
  const lessons = await (await req("GET", "/courses/1/lessons?q=primitives")).json();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].id, 1);
});

test("lesson search with no matches returns an empty array", async () => {
  const lessons = await (await req("GET", "/courses/1/lessons?q=nope")).json();
  assert.deepEqual(lessons, []);
});

test("lessons sort by title", async () => {
  // "Functions" (id 2) before "Variables and Types" (id 1).
  const lessons = await (await req("GET", "/courses/1/lessons?sort=title")).json();
  assert.deepEqual(
    lessons.map((l) => l.id),
    [2, 1]
  );
});

test("lessons sort by order descending", async () => {
  const lessons = await (await req("GET", "/courses/1/lessons?sort=order&order=desc")).json();
  assert.deepEqual(
    lessons.map((l) => l.id),
    [2, 1]
  );
});

test("lesson list with an invalid sort returns 400", async () => {
  const res = await req("GET", "/courses/1/lessons?sort=bogus");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /sort must be one of/);
});

test("lesson list with an invalid order returns 400", async () => {
  const res = await req("GET", "/courses/1/lessons?order=sideways");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /order must be one of/);
});

test("lesson list ?limit caps results and sets X-Total-Count", async () => {
  const res = await req("GET", "/courses/1/lessons?limit=1");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-total-count"), "2");
  const lessons = await res.json();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].id, 1); // order asc default
});

test("lesson list ?offset skips earlier lessons", async () => {
  const res = await req("GET", "/courses/1/lessons?limit=1&offset=1");
  const lessons = await res.json();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].id, 2);
});

test("lesson pagination composes with sort", async () => {
  const res = await req("GET", "/courses/1/lessons?sort=order&order=desc&limit=1");
  const lessons = await res.json();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].id, 2); // highest order first
});

test("lesson list with a non-integer limit returns 400", async () => {
  const res = await req("GET", "/courses/1/lessons?limit=abc");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /limit must be an integer/);
});

test("lesson list with limit above the max returns 400", async () => {
  const res = await req("GET", "/courses/1/lessons?limit=101");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /between 1 and 100/);
});

test("GET lessons for unknown course returns 404", async () => {
  const res = await req("GET", "/courses/9999/lessons");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Course not found");
});

test("POST lesson auto-assigns the next order", async () => {
  const course = await (await req("POST", "/courses", { title: "Ordering" })).json();
  const first = await (await req("POST", `/courses/${course.id}/lessons`, { title: "A" })).json();
  const second = await (await req("POST", `/courses/${course.id}/lessons`, { title: "B" })).json();
  assert.equal(first.order, 1);
  assert.equal(second.order, 2);
});

test("POST lesson without a title returns 400", async () => {
  const res = await req("POST", "/courses/1/lessons", { content: "no title" });
  assert.equal(res.status, 400);
});

test("POST lesson with a non-integer order returns 400", async () => {
  const res = await req("POST", "/courses/1/lessons", { title: "Bad order", order: "abc" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "order must be an integer");
});

test("POST lesson with order below the minimum returns 400", async () => {
  const res = await req("POST", "/courses/1/lessons", { title: "Zero order", order: 0 });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, />= 1/);
});

test("POST lesson coerces a numeric-string order", async () => {
  const course = await (await req("POST", "/courses", { title: "Coerce" })).json();
  const lesson = await (
    await req("POST", `/courses/${course.id}/lessons`, { title: "Three", order: "3" })
  ).json();
  assert.equal(lesson.order, 3);
});

test("a lesson is not reachable through the wrong course", async () => {
  // Seeded lesson 3 belongs to course 2, not course 1.
  const res = await req("GET", "/courses/1/lessons/3");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Lesson not found");
});

test("PUT lesson updates fields", async () => {
  const course = await (await req("POST", "/courses", { title: "Editable" })).json();
  const lesson = await (await req("POST", `/courses/${course.id}/lessons`, { title: "Old" })).json();
  const res = await req("PUT", `/courses/${course.id}/lessons/${lesson.id}`, { title: "New", order: 5 });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.title, "New");
  assert.equal(updated.order, 5);
});

test("DELETE lesson removes it", async () => {
  const course = await (await req("POST", "/courses", { title: "Deletable lessons" })).json();
  const lesson = await (await req("POST", `/courses/${course.id}/lessons`, { title: "Bye" })).json();
  const del = await req("DELETE", `/courses/${course.id}/lessons/${lesson.id}`);
  assert.equal(del.status, 200);
  const after = await req("GET", `/courses/${course.id}/lessons/${lesson.id}`);
  assert.equal(after.status, 404);
});

test("DELETE course cascades to its lessons", async () => {
  const course = await (await req("POST", "/courses", { title: "Cascade" })).json();
  await req("POST", `/courses/${course.id}/lessons`, { title: "Child" });

  const del = await req("DELETE", `/courses/${course.id}`);
  assert.equal(del.status, 200);

  // Course gone -> nested lessons route 404s on the course guard.
  const lessons = await req("GET", `/courses/${course.id}/lessons`);
  assert.equal(lessons.status, 404);
  assert.equal((await lessons.json()).error, "Course not found");
});

// --- Reorder lessons ---

async function makeCourseWithLessons(title, titles) {
  const course = await (await req("POST", "/courses", { title })).json();
  const lessons = [];
  for (const t of titles) {
    lessons.push(await (await req("POST", `/courses/${course.id}/lessons`, { title: t })).json());
  }
  return { course, lessons };
}

test("PUT lessons/reorder sets order to the given positions", async () => {
  const { course, lessons } = await makeCourseWithLessons("Reorder me", ["A", "B", "C"]);
  const [a, b, c] = lessons;

  const res = await req("PUT", `/courses/${course.id}/lessons/reorder`, {
    order: [c.id, a.id, b.id],
  });
  assert.equal(res.status, 200);
  const reordered = await res.json();
  assert.deepEqual(
    reordered.map((l) => l.id),
    [c.id, a.id, b.id]
  );
  assert.deepEqual(
    reordered.map((l) => l.order),
    [1, 2, 3]
  );
});

test("reorder with a missing lesson id returns 400", async () => {
  const { course, lessons } = await makeCourseWithLessons("Reorder missing", ["A", "B"]);
  const res = await req("PUT", `/courses/${course.id}/lessons/reorder`, {
    order: [lessons[0].id], // omits the second lesson
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /every lesson exactly once/);
});

test("reorder with a foreign lesson id returns 400", async () => {
  const { course, lessons } = await makeCourseWithLessons("Reorder foreign", ["A", "B"]);
  const res = await req("PUT", `/courses/${course.id}/lessons/reorder`, {
    order: [lessons[0].id, 999999], // right length, wrong id
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /every lesson exactly once/);
});

test("reorder with a non-array body returns 400", async () => {
  const res = await req("PUT", "/courses/1/lessons/reorder", { order: "nope" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /non-empty array/);
});

test("reorder for an unknown course returns 404", async () => {
  const res = await req("PUT", "/courses/999999/lessons/reorder", { order: [1] });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Course not found");
});
