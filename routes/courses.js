import { Router } from "express";
import {
  listCourses,
  findCourse,
  createCourse,
  updateCourse,
  deleteCourse,
} from "../data/store.js";
import lessonsRouter from "./lessons.js";

const router = Router();

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
router.post("/", (req, res) => {
  const { title, description } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const course = createCourse({ title, description });
  res.status(201).json(course);
});

// Update a course
router.put("/:id", (req, res) => {
  const { title, description } = req.body ?? {};
  const course = updateCourse(req.params.id, { title, description });
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
