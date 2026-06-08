import { Router } from "express";
import { courses, nextCourseId, findCourse } from "../data/store.js";
import lessonsRouter from "./lessons.js";

const router = Router();

// Nested lessons: /courses/:courseId/lessons
router.use("/:courseId/lessons", lessonsRouter);

// List all courses
router.get("/", (req, res) => {
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
router.post("/", (req, res) => {
  const { title, description } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const course = {
    id: nextCourseId(),
    title,
    description: description ?? "",
  };
  courses.push(course);
  res.status(201).json(course);
});

// Update a course
router.put("/:id", (req, res) => {
  const course = findCourse(req.params.id);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  const { title, description } = req.body ?? {};
  if (title !== undefined) course.title = title;
  if (description !== undefined) course.description = description;
  res.json(course);
});

// Delete a course
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = courses.findIndex((c) => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Course not found" });
  }
  const [removed] = courses.splice(index, 1);
  res.json(removed);
});

export default router;
