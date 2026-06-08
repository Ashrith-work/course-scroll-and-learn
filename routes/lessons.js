import { Router } from "express";
import { lessons, nextLessonId, findCourse } from "../data/store.js";

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

function lessonsForCourse(courseId) {
  return lessons
    .filter((l) => l.courseId === Number(courseId))
    .sort((a, b) => a.order - b.order);
}

// List lessons for a course
router.get("/", (req, res) => {
  res.json(lessonsForCourse(req.course.id));
});

// Get a single lesson
router.get("/:lessonId", (req, res) => {
  const lessonId = Number(req.params.lessonId);
  const lesson = lessons.find(
    (l) => l.id === lessonId && l.courseId === req.course.id
  );
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
  const lesson = {
    id: nextLessonId(),
    courseId: req.course.id,
    title,
    content: content ?? "",
    order: order ?? lessonsForCourse(req.course.id).length + 1,
  };
  lessons.push(lesson);
  res.status(201).json(lesson);
});

// Update a lesson
router.put("/:lessonId", (req, res) => {
  const lessonId = Number(req.params.lessonId);
  const lesson = lessons.find(
    (l) => l.id === lessonId && l.courseId === req.course.id
  );
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  const { title, content, order } = req.body ?? {};
  if (title !== undefined) lesson.title = title;
  if (content !== undefined) lesson.content = content;
  if (order !== undefined) lesson.order = order;
  res.json(lesson);
});

// Delete a lesson
router.delete("/:lessonId", (req, res) => {
  const lessonId = Number(req.params.lessonId);
  const index = lessons.findIndex(
    (l) => l.id === lessonId && l.courseId === req.course.id
  );
  if (index === -1) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  const [removed] = lessons.splice(index, 1);
  res.json(removed);
});

export default router;
