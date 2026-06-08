import { Router } from "express";
import {
  findCourse,
  listLessons,
  findLesson,
  createLesson,
  updateLesson,
  deleteLesson,
} from "../data/store.js";

// mergeParams lets us read :courseId from the parent (courses) router.
const router = Router({ mergeParams: true });

// Ensure the parent course exists for every nested lesson request.
router.use((req, res, next) => {
  const course = findCourse(req.params.courseId);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  req.course = course;
  next();
});

// List lessons for a course
router.get("/", (req, res) => {
  res.json(listLessons(req.course.id));
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
router.post("/", (req, res) => {
  const { title, content, order } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const lesson = createLesson(req.course.id, { title, content, order });
  res.status(201).json(lesson);
});

// Update a lesson
router.put("/:lessonId", (req, res) => {
  const { title, content, order } = req.body ?? {};
  const lesson = updateLesson(req.course.id, req.params.lessonId, { title, content, order });
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
