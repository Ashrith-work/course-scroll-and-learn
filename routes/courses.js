import { Router } from "express";
import {
  listCourses,
  findCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from "../data/store.js";
import { validateBody } from "../middleware/validate.js";
import lessonsRouter from "./lessons.js";

const router = Router();

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

// List all courses
router.get("/", (req, res) => {
  res.json(listCourses());
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
router.post("/", validateBody(courseCreateSchema), (req, res) => {
  const course = createCourse(req.body);
  res.status(201).json(course);
});

// Update a course
router.put("/:id", validateBody(courseUpdateSchema), (req, res) => {
  const course = updateCourse(req.params.id, req.body);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(course);
});

// Delete a course
router.delete("/:id", (req, res) => {
  const removed = deleteCourse(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(removed);
});

export default router;
