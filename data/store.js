// Repository layer: all data access goes through these functions,
// backed by SQLite (see db.js). Returned objects use camelCase keys.
import db from "./db.js";

// --- Courses ---

const countCoursesStmt = db.prepare("SELECT COUNT(*) AS n FROM courses");
const countSearchStmt = db.prepare(
  `SELECT COUNT(*) AS n FROM courses
   WHERE title LIKE @like ESCAPE '\\' OR description LIKE @like ESCAPE '\\'`
);
const selectCourse = db.prepare("SELECT id, title, description FROM courses WHERE id = ?");
const insertCourse = db.prepare("INSERT INTO courses (title, description) VALUES (?, ?)");
const updateCourseStmt = db.prepare("UPDATE courses SET title = ?, description = ? WHERE id = ?");
const deleteCourseStmt = db.prepare("DELETE FROM courses WHERE id = ?");

// Whitelists for ORDER BY. ORDER BY can't be parameterized, so sort/direction
// are mapped through these tables — only known-safe SQL fragments are ever
// interpolated. Defaults reproduce the previous behavior (id ASC).
const SORT_COLUMNS = { id: "id", title: "title COLLATE NOCASE" };
const SORT_DIRECTIONS = { asc: "ASC", desc: "DESC" };

// LIMIT -1 means "no limit" in SQLite, so one statement serves paged and
// unpaged cases. Prepared statements are memoized per (search, sort, dir).
const stmtCache = new Map();
function coursesStmt(hasSearch, sortExpr, dir) {
  const key = `${hasSearch}|${sortExpr}|${dir}`;
  let stmt = stmtCache.get(key);
  if (!stmt) {
    const where = hasSearch
      ? `WHERE title LIKE @like ESCAPE '\\' OR description LIKE @like ESCAPE '\\'`
      : "";
    stmt = db.prepare(
      `SELECT id, title, description FROM courses ${where}
       ORDER BY ${sortExpr} ${dir}, id ${dir} LIMIT @limit OFFSET @offset`
    );
    stmtCache.set(key, stmt);
  }
  return stmt;
}

function searchLike(term) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

// Search courses by title/description (empty query = all), with optional
// pagination and sorting. LIKE wildcards in the query are escaped so they match
// literally; unknown sort/order values fall back to the defaults.
export function listCourses(search, { limit, offset, sort, order } = {}) {
  const term = typeof search === "string" ? search.trim() : "";
  const sortExpr = SORT_COLUMNS[sort] ?? SORT_COLUMNS.id;
  const dir = SORT_DIRECTIONS[order] ?? SORT_DIRECTIONS.asc;
  const params = { limit: limit ?? -1, offset: offset ?? 0 };

  const stmt = coursesStmt(term !== "", sortExpr, dir);
  if (term === "") {
    return stmt.all(params);
  }
  return stmt.all({ ...params, like: searchLike(term) });
}

// Total number of courses matching the (optional) search term.
export function countCourses(search) {
  const term = typeof search === "string" ? search.trim() : "";
  if (term === "") {
    return countCoursesStmt.get().n;
  }
  return countSearchStmt.get({ like: searchLike(term) }).n;
}

export function findCourse(id) {
  return selectCourse.get(Number(id));
}

export function createCourse({ title, description = "" }) {
  const { lastInsertRowid } = insertCourse.run(title, description);
  return findCourse(lastInsertRowid);
}

export function updateCourse(id, fields) {
  const course = findCourse(id);
  if (!course) return undefined;
  const title = fields.title ?? course.title;
  const description = fields.description ?? course.description;
  updateCourseStmt.run(title, description, course.id);
  return findCourse(course.id);
}

export function deleteCourse(id) {
  const course = findCourse(id);
  if (!course) return undefined;
  deleteCourseStmt.run(course.id); // lessons cascade-delete via FK
  return course;
}

// --- Lessons ---

const selectLesson = db.prepare(
  'SELECT id, course_id AS courseId, title, content, "order" FROM lessons WHERE id = ? AND course_id = ?'
);
const insertLesson = db.prepare(
  'INSERT INTO lessons (course_id, title, content, "order") VALUES (?, ?, ?, ?)'
);
const updateLessonStmt = db.prepare(
  'UPDATE lessons SET title = ?, content = ?, "order" = ? WHERE id = ? AND course_id = ?'
);
const deleteLessonStmt = db.prepare("DELETE FROM lessons WHERE id = ? AND course_id = ?");
const countLessons = db.prepare("SELECT COUNT(*) AS n FROM lessons WHERE course_id = ?");
const countLessonsSearch = db.prepare(
  `SELECT COUNT(*) AS n FROM lessons WHERE course_id = @courseId
   AND (title LIKE @like ESCAPE '\\' OR content LIKE @like ESCAPE '\\')`
);

// Whitelisted sort columns for lessons (see SORT_DIRECTIONS above).
const LESSON_SORT_COLUMNS = { order: '"order"', title: "title COLLATE NOCASE", id: "id" };

const lessonStmtCache = new Map();
function lessonsStmt(hasSearch, sortExpr, dir) {
  const key = `${hasSearch}|${sortExpr}|${dir}`;
  let stmt = lessonStmtCache.get(key);
  if (!stmt) {
    const searchWhere = hasSearch
      ? `AND (title LIKE @like ESCAPE '\\' OR content LIKE @like ESCAPE '\\')`
      : "";
    stmt = db.prepare(
      `SELECT id, course_id AS courseId, title, content, "order" FROM lessons
       WHERE course_id = @courseId ${searchWhere}
       ORDER BY ${sortExpr} ${dir}, id ${dir} LIMIT @limit OFFSET @offset`
    );
    lessonStmtCache.set(key, stmt);
  }
  return stmt;
}

// List a course's lessons, optionally filtered by title/content search, sorted,
// and paginated. Defaults to order ASC, no limit (the previous behavior).
export function listLessons(courseId, { search, sort, order, limit, offset } = {}) {
  const term = typeof search === "string" ? search.trim() : "";
  const sortExpr = LESSON_SORT_COLUMNS[sort] ?? LESSON_SORT_COLUMNS.order;
  const dir = SORT_DIRECTIONS[order] ?? SORT_DIRECTIONS.asc;
  const params = { courseId: Number(courseId), limit: limit ?? -1, offset: offset ?? 0 };

  const stmt = lessonsStmt(term !== "", sortExpr, dir);
  if (term === "") {
    return stmt.all(params);
  }
  return stmt.all({ ...params, like: searchLike(term) });
}

// Total lessons in a course matching the (optional) search term.
export function countLessonsFor(courseId, search) {
  const term = typeof search === "string" ? search.trim() : "";
  if (term === "") {
    return countLessons.get(Number(courseId)).n;
  }
  return countLessonsSearch.get({ courseId: Number(courseId), like: searchLike(term) }).n;
}

export function findLesson(courseId, lessonId) {
  return selectLesson.get(Number(lessonId), Number(courseId));
}

export function createLesson(courseId, { title, content = "", order }) {
  const resolvedOrder = order ?? countLessons.get(Number(courseId)).n + 1;
  const { lastInsertRowid } = insertLesson.run(Number(courseId), title, content, resolvedOrder);
  return findLesson(courseId, lastInsertRowid);
}

export function updateLesson(courseId, lessonId, fields) {
  const lesson = findLesson(courseId, lessonId);
  if (!lesson) return undefined;
  const title = fields.title ?? lesson.title;
  const content = fields.content ?? lesson.content;
  const order = fields.order ?? lesson.order;
  updateLessonStmt.run(title, content, order, lesson.id, Number(courseId));
  return findLesson(courseId, lessonId);
}

export function deleteLesson(courseId, lessonId) {
  const lesson = findLesson(courseId, lessonId);
  if (!lesson) return undefined;
  deleteLessonStmt.run(lesson.id, Number(courseId));
  return lesson;
}
