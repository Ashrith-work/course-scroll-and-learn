import { Router } from "express";

const router = Router();

// In-memory course store (replace with a database later)
let courses = [
  { id: 1, title: "Intro to JavaScript", description: "Learn the basics of JS", lessons: 12 },
  { id: 2, title: "Node.js Fundamentals", description: "Server-side JavaScript", lessons: 8 },
  { id: 3, title: "Building REST APIs", description: "Design and build APIs with Express", lessons: 10 },
];

let nextId = courses.length + 1;

// List all courses
router.get("/", (req, res) => {
  res.json(courses);
});

// Get a single course by id
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const course = courses.find((c) => c.id === id);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  res.json(course);
});

// Create a course
router.post("/", (req, res) => {
  const { title, description, lessons } = req.body ?? {};
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const course = {
    id: nextId++,
    title,
    description: description ?? "",
    lessons: lessons ?? 0,
  };
  courses.push(course);
  res.status(201).json(course);
});

// Update a course
router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const course = courses.find((c) => c.id === id);
  if (!course) {
    return res.status(404).json({ error: "Course not found" });
  }
  const { title, description, lessons } = req.body ?? {};
  if (title !== undefined) course.title = title;
  if (description !== undefined) course.description = description;
  if (lessons !== undefined) course.lessons = lessons;
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
