// Shared in-memory data store (replace with a database later).

export const courses = [
  { id: 1, title: "Intro to JavaScript", description: "Learn the basics of JS" },
  { id: 2, title: "Node.js Fundamentals", description: "Server-side JavaScript" },
  { id: 3, title: "Building REST APIs", description: "Design and build APIs with Express" },
];

export const lessons = [
  { id: 1, courseId: 1, title: "Variables and Types", content: "let, const, and primitives", order: 1 },
  { id: 2, courseId: 1, title: "Functions", content: "Declaring and calling functions", order: 2 },
  { id: 3, courseId: 2, title: "The Event Loop", content: "How Node handles async", order: 1 },
];

const counters = {
  course: courses.length,
  lesson: lessons.length,
};

export function nextCourseId() {
  return ++counters.course;
}

export function nextLessonId() {
  return ++counters.lesson;
}

export function findCourse(id) {
  return courses.find((c) => c.id === Number(id));
}
