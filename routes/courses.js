import { Router } from "express";
import {
  listCourses,
  countCourses,
  findCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from "../data/store.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePageParam, parseEnumParam } from "../lib/query.js";
import lessonsRouter from "./lessons.js";

const router = Router();

const SORT_FIELDS = ["id", "title"];
const SORT_ORDERS = ["asc", "desc"];

const courseCreateSchema = {
  title: { type: "string", required: true, maxLength: 200 },
  description: { type: "string", default: "", maxLength: 2000 },
};

const courseUpdateSchema = {
  title: { type: "string", minLength: 1, maxLength: 200 },
  description: { type: "string", maxLength: 2000 },
};

// Nested lessons: /courses/:courseId/lessons
router.use("/:courseId/lessons", lessonsRouter);

// List courses. Optional ?q= search; ?limit= (1-100) / ?offset= (>=0)
// pagination; ?sort= (id|title) and ?order= (asc|desc) sorting. The total match
// count (ignoring pagination) is returned in the X-Total-Count header.
router.get("/", (req, res) => {
  const { q } = req.query;
  const search = typeof q === "string" ? q : undefined;

  const limit = parsePageParam(req.query.limit, "limit", { min: 1, max: 100 });
  const offset = parsePageParam(req.query.offset, "offset", { min: 0 });
  const sort = parseEnumParam(req.query.sort, "sort", SORT_FIELDS);
  const order = parseEnumParam(req.query.order, "order", SORT_ORDERS);
  for (const p of [limit, offset, sort, order]) {
    if (p.error) return res.status(400).json({ error: p.error });
  }

  const total = countCourses(search);
  const courses = listCourses(search, {
    limit: limit.value,
    offset: offset.value,
    sort: sort.value,
    order: order.value,
  });

  res.set("X-Total-Count", String(total));
  res.json(courses);
});

// Get a single course by id
router.get("/:id", (req, res) => {
  const course = findCourse(req.params.id);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(course);
});

// Create a course
router.post("/", requireAuth, validateBody(courseCreateSchema), (req, res) => {
  const course = createCourse(req.body);
  res.status(201).json(course);
});

// Update a course
router.put("/:id", requireAuth, validateBody(courseUpdateSchema), (req, res) => {
  const course = updateCourse(req.params.id, req.body);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(course);
});

// Delete a course
router.delete("/:id", requireAuth, (req, res) => {
  const removed = deleteCourse(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(removed);
});

export default router;
