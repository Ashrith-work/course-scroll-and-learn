// OpenAPI 3.0 description of the Course Scroll and Learn API.
// Served as JSON at /openapi.json and rendered by Swagger UI at /docs.

const Error = {
  type: "object",
  properties: { error: { type: "string" } },
  required: ["error"],
};

const Course = {
  type: "object",
  properties: {
    id: { type: "integer", example: 1 },
    title: { type: "string", example: "Intro to JavaScript" },
    description: { type: "string", example: "Learn the basics of JS" },
  },
  required: ["id", "title", "description"],
};

const NewCourse = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 200 },
    description: { type: "string", maxLength: 2000 },
  },
  required: ["title"],
};

const CourseUpdate = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 2000 },
  },
};

const Lesson = {
  type: "object",
  properties: {
    id: { type: "integer", example: 1 },
    courseId: { type: "integer", example: 1 },
    title: { type: "string", example: "Variables and Types" },
    content: { type: "string", example: "let, const, and primitives" },
    order: { type: "integer", example: 1 },
  },
  required: ["id", "courseId", "title", "content", "order"],
};

const NewLesson = {
  type: "object",
  properties: {
    title: { type: "string", maxLength: 200 },
    content: { type: "string", maxLength: 5000 },
    order: { type: "integer", minimum: 1, description: "Defaults to the next position." },
  },
  required: ["title"],
};

const LessonUpdate = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    content: { type: "string", maxLength: 5000 },
    order: { type: "integer", minimum: 1 },
  },
};

const ReorderLessons = {
  type: "object",
  properties: {
    order: {
      type: "array",
      items: { type: "integer" },
      description: "Every lesson id in the course, in the desired order.",
      example: [3, 1, 2],
    },
  },
  required: ["order"],
};

const notFound = {
  description: "Not found",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

const badRequest = {
  description: "Validation error",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
};

const courseIdParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer" },
};

const lessonCourseIdParam = {
  name: "courseId",
  in: "path",
  required: true,
  schema: { type: "integer" },
};

const lessonIdParam = {
  name: "lessonId",
  in: "path",
  required: true,
  schema: { type: "integer" },
};

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Course Scroll and Learn API",
    version: "1.0.0",
    description: "REST API for courses and their nested lessons.",
    license: { name: "MIT" },
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "Health" },
    { name: "Courses" },
    { name: "Lessons" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          200: {
            description: "Service is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/courses": {
      get: {
        tags: ["Courses"],
        summary: "List courses",
        description:
          "Supports search, pagination, and sorting. The total match count " +
          "(ignoring pagination) is returned in the X-Total-Count header.",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search title/description." },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["id", "title"] } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          200: {
            description: "A page of courses",
            headers: {
              "X-Total-Count": {
                description: "Total courses matching the query, ignoring pagination.",
                schema: { type: "integer" },
              },
            },
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Course" } },
              },
            },
          },
          400: badRequest,
        },
      },
      post: {
        tags: ["Courses"],
        summary: "Create a course",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewCourse" } } },
        },
        responses: {
          201: {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Course" } } },
          },
          400: badRequest,
        },
      },
    },
    "/courses/{id}": {
      get: {
        tags: ["Courses"],
        summary: "Get a course",
        parameters: [courseIdParam],
        responses: {
          200: {
            description: "The course",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Course" } } },
          },
          404: notFound,
        },
      },
      put: {
        tags: ["Courses"],
        summary: "Update a course",
        parameters: [courseIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CourseUpdate" } } },
        },
        responses: {
          200: {
            description: "Updated course",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Course" } } },
          },
          400: badRequest,
          404: notFound,
        },
      },
      delete: {
        tags: ["Courses"],
        summary: "Delete a course (cascades to its lessons)",
        parameters: [courseIdParam],
        responses: {
          200: {
            description: "The deleted course",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Course" } } },
          },
          404: notFound,
        },
      },
    },
    "/courses/{courseId}/lessons": {
      get: {
        tags: ["Lessons"],
        summary: "List a course's lessons",
        description:
          "Supports search, sorting, and pagination. The total match count " +
          "(ignoring pagination) is returned in the X-Total-Count header.",
        parameters: [
          lessonCourseIdParam,
          { name: "q", in: "query", schema: { type: "string" }, description: "Search title/content." },
          { name: "sort", in: "query", schema: { type: "string", enum: ["order", "title", "id"] } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
        ],
        responses: {
          200: {
            description: "The lessons",
            headers: {
              "X-Total-Count": {
                description: "Total lessons matching the query, ignoring pagination.",
                schema: { type: "integer" },
              },
            },
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Lesson" } },
              },
            },
          },
          400: badRequest,
          404: notFound,
        },
      },
      post: {
        tags: ["Lessons"],
        summary: "Create a lesson under a course",
        parameters: [lessonCourseIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewLesson" } } },
        },
        responses: {
          201: {
            description: "Created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Lesson" } } },
          },
          400: badRequest,
          404: notFound,
        },
      },
    },
    "/courses/{courseId}/lessons/reorder": {
      put: {
        tags: ["Lessons"],
        summary: "Reorder a course's lessons",
        description:
          "Body must list every lesson id in the course exactly once; each " +
          "lesson's order is set to its 1-based position.",
        parameters: [lessonCourseIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ReorderLessons" } } },
        },
        responses: {
          200: {
            description: "The reordered lessons",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Lesson" } },
              },
            },
          },
          400: badRequest,
          404: notFound,
        },
      },
    },
    "/courses/{courseId}/lessons/{lessonId}": {
      get: {
        tags: ["Lessons"],
        summary: "Get a lesson",
        parameters: [lessonCourseIdParam, lessonIdParam],
        responses: {
          200: {
            description: "The lesson",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Lesson" } } },
          },
          404: notFound,
        },
      },
      put: {
        tags: ["Lessons"],
        summary: "Update a lesson",
        parameters: [lessonCourseIdParam, lessonIdParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LessonUpdate" } } },
        },
        responses: {
          200: {
            description: "Updated lesson",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Lesson" } } },
          },
          400: badRequest,
          404: notFound,
        },
      },
      delete: {
        tags: ["Lessons"],
        summary: "Delete a lesson",
        parameters: [lessonCourseIdParam, lessonIdParam],
        responses: {
          200: {
            description: "The deleted lesson",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Lesson" } } },
          },
          404: notFound,
        },
      },
    },
  },
  components: {
    schemas: { Error, Course, NewCourse, CourseUpdate, Lesson, NewLesson, LessonUpdate, ReorderLessons },
  },
};
