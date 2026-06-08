import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Use a throwaway database so tests never touch the real courses.db.
// DB_PATH must be set before importing the app (db.js reads it on load).
const dbPath = join(tmpdir(), `courses-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbPath;

let server;
let baseURL;

before(async () => {
  const { default: app } = await import("../index.js");
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseURL = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
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

function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
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

// --- Courses ---

test("GET /courses returns the seeded courses", async () => {
  const res = await req("GET", "/courses");
  assert.equal(res.status, 200);
  const courses = await res.json();
  assert.equal(courses.length, 3);
  assert.equal(courses[0].title, "Intro to JavaScript");
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
