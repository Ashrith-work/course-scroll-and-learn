// Repository layer: all data access goes through these functions,
// backed by SQLite (see db.js). Returned objects use camelCase keys.
import db from "./db.js";

// --- Courses ---

const selectCourses = db.prepare("SELECT id, title, description FROM courses ORDER BY id");
const selectCourse = db.prepare("SELECT id, title, description FROM courses WHERE id = ?");
const insertCourse = db.prepare("INSERT INTO courses (title, description) VALUES (?, ?)");
const updateCourseStmt = db.prepare("UPDATE courses SET title = ?, description = ? WHERE id = ?");
const deleteCourseStmt = db.prepare("DELETE FROM courses WHERE id = ?");

export function listCourses() {
  return selectCourses.all();
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

const selectLessons = db.prepare(
  'SELECT id, course_id AS courseId, title, content, "order" FROM lessons WHERE course_id = ? ORDER BY "order", id'
);
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

export function listLessons(courseId) {
  return selectLessons.all(Number(courseId));
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
