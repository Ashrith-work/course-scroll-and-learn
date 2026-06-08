import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, "..", "courses.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
`);

// Seed once, only if the courses table is empty.
const courseCount = db.prepare("SELECT COUNT(*) AS n FROM courses").get().n;
if (courseCount === 0) {
  const insertCourse = db.prepare(
    "INSERT INTO courses (title, description) VALUES (?, ?)"
  );
  const insertLesson = db.prepare(
    'INSERT INTO lessons (course_id, title, content, "order") VALUES (?, ?, ?, ?)'
  );

  const seed = db.transaction(() => {
    const js = insertCourse.run("Intro to JavaScript", "Learn the basics of JS").lastInsertRowid;
    const node = insertCourse.run("Node.js Fundamentals", "Server-side JavaScript").lastInsertRowid;
    insertCourse.run("Building REST APIs", "Design and build APIs with Express");

    insertLesson.run(js, "Variables and Types", "let, const, and primitives", 1);
    insertLesson.run(js, "Functions", "Declaring and calling functions", 2);
    insertLesson.run(node, "The Event Loop", "How Node handles async", 1);
  });
  seed();
}

export default db;
