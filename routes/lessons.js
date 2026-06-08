import { Router } from "express";
import {
  findCourse,
  listLessons,
  countLessonsFor,
  findLesson,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from "../data/store.js";
import { validateBody } from "../middleware/validate.js";
import { parseEnumParam, parsePageParam } from "../lib/query.js";

// mergeParams lets us read :courseId from the parent (courses) router.
const router = Router({ mergeParams: true });

const LESSON_SORT_FIELDS = ["order", "title", "id"];
const SORT_ORDERS = ["asc", "desc"];

const lessonCreateSchema = {
  title: { type: "string", required: true, maxLength: 200 },
  content: { type: "string", default: "", maxLength: 5000 },
  order: { type: "integer", min: 1 },
};

const lessonUpdateSchema = {
  title: { type: "string", minLength: 1, maxLength: 200 },
  content: { type: "string", maxLength: 5000 },
  order: { type: "integer", min: 1 },
};

// Ensure the parent course exists for every nested lesson request.
router.use((req, res, next) => {
  const course = findCourse(req.params.courseId);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  req.course = course;
  next();
});

// List lessons for a course. Optional ?q= search (title/content),
// ?sort= (order|title|id) / ?order= (asc|desc) sorting, and ?limit= (1-100) /
// ?offset= (>=0) pagination. Total match count is in the X-Total-Count header.
router.get("/", (req, res) => {
  const { q } = req.query;
  const search = typeof q === "string" ? q : undefined;
  const sort = parseEnumParam(req.query.sort, "sort", LESSON_SORT_FIELDS);
  const order = parseEnumParam(req.query.order, "order", SORT_ORDERS);
  const limit = parsePageParam(req.query.limit, "limit", { min: 1, max: 100 });
  const offset = parsePageParam(req.query.offset, "offset", { min: 0 });
  for (const p of [sort, order, limit, offset]) {
    if (p.error) return res.status(400).json({ error: p.error });
  }

  const total = countLessonsFor(req.course.id, search);
  const lessons = listLessons(req.course.id, {
    search,
    sort: sort.value,
    order: order.value,
    limit: limit.value,
    offset: offset.value,
  });

  res.set("X-Total-Count", String(total));
  res.json(lessons);
});

// Reorder all of a course's lessons. Body: { order: [lessonId, ...] } — a
// permutation of every lesson id in the course. Declared before "/:lessonId"
// so "reorder" isn't captured as a lesson id.
router.put("/reorder", (req, res) => {
  const ids = req.body?.order;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(Number.isInteger)) {
    return res.status(400).json({ error: "order must be a non-empty array of lesson ids" });
  }
  const result = reorderLessons(req.course.id, ids);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result.lessons);
});

// Get a single lesson
router.get("/:lessonId", (req, res) => {
  const lesson = findLesson(req.course.id, req.params.lessonId);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  res.json(lesson);
});

// Create a lesson under a course
router.post("/", validateBody(lessonCreateSchema), (req, res) => {
  const lesson = createLesson(req.course.id, req.body);
  res.status(201).json(lesson);
});

// Update a lesson
router.put("/:lessonId", validateBody(lessonUpdateSchema), (req, res) => {
  const lesson = updateLesson(req.course.id, req.params.lessonId, req.body);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  res.json(lesson);
});

// Delete a lesson
router.delete("/:lessonId", (req, res) => {
  const removed = deleteLesson(req.course.id, req.params.lessonId);
  if (!removed) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  res.json(removed);
});

export default router;
