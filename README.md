# Course Scroll and Learn

[![CI](https://github.com/Ashrith-work/course-scroll-and-learn/actions/workflows/ci.yml/badge.svg)](https://github.com/Ashrith-work/course-scroll-and-learn/actions/workflows/ci.yml)

A course scroll and learn application.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)

### Installation

```bash
npm install
```

### Running

```bash
npm start
```

This runs the `index.js` entry point. Then open
[http://localhost:3000](http://localhost:3000) for the scroll feed.

## Frontend

A dependency-free static frontend (served from `public/`) presents courses as a
full-screen, vertically snapping scroll feed. Each card shows a course and a
**View lessons** button that lazy-loads its lessons from the API.

Full CRUD is available from the UI:

- **＋ button** (bottom-right) — create a course
- **Edit / Delete** on each course card (delete cascades to its lessons)
- **+ Add lesson**, plus per-lesson edit/delete, inside the lessons list

Forms use a native `<dialog>` modal and talk to the same REST API.

The header has a **search box** that filters the feed by course title or
description (debounced, case-insensitive) via `GET /courses?q=`.

The feed loads courses in pages of 10 and **infinitely scrolls** — fetching the
next page (`?limit=&offset=`) as you near the bottom, using the
`X-Total-Count` header to know when to stop. A **sort dropdown** (oldest/newest
first, title A–Z/Z–A) reorders the feed via `?sort=&order=`.

Inside an expanded course, the lessons list has its own **search box and sort
dropdown** (by order or title) and loads in pages of 10 with a **Load more**
button, backed by `GET /courses/:id/lessons?q=&sort=&order=&limit=&offset=`.

In the natural-order view, a **↕ Reorder** button enters a drag-and-drop mode
that persists the new order via `PUT /courses/:id/lessons/reorder`.

## Project Structure

```
.
├── index.js            # Application entry point (Express server)
├── public/             # Static frontend (vertical scroll feed)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── docs/
│   └── openapi.js      # OpenAPI 3 spec (served at /openapi.json, UI at /docs)
├── data/
│   ├── db.js           # SQLite connection, schema, and seed
│   └── store.js        # Repository layer (data access functions)
├── routes/
│   ├── courses.js      # /courses CRUD
│   └── lessons.js      # /courses/:courseId/lessons CRUD (nested)
├── middleware/
│   └── validate.js     # schema-driven request-body validation
├── lib/
│   └── query.js        # query-string param validators (pagination, enums)
├── tests/
│   └── api.test.js     # API tests (node --test)
├── package.json        # Project metadata and scripts
└── README.md
```

## Database

Persistence uses **SQLite** via [`better-sqlite3`](https://github.com/WiseLibraries/better-sqlite3).
The database file (`courses.db`) is created automatically on first run, with the
schema applied and sample data seeded. It is gitignored.

Override the location with the `DB_PATH` environment variable.

## Validation

Create/update requests are validated by schema-driven middleware
(`middleware/validate.js`) before reaching the handlers. It checks required
fields, types, string length, and integer ranges; trims strings; coerces
numeric-string integers; and replaces `req.body` with a cleaned object.
Failures return `400 { "error": "..." }`. Malformed JSON also returns a clean
`400`.

## API

Interactive documentation is available at **`/docs`** (Swagger UI), backed by
the OpenAPI 3 spec served at **`/openapi.json`**. Start the server and open
[http://localhost:3000/docs](http://localhost:3000/docs).

| Method | Path                               | Description       |
| ------ | ---------------------------------- | ----------------- |
| GET    | `/courses`                         | List courses. Optional `?q=` search, `?limit=` (1–100) / `?offset=` (≥0) pagination, and `?sort=` (`id`\|`title`) / `?order=` (`asc`\|`desc`) sorting. Total match count is returned in the `X-Total-Count` header. |
| GET    | `/courses/:id`                     | Get a course      |
| POST   | `/courses`                         | Create a course   |
| PUT    | `/courses/:id`                     | Update a course   |
| DELETE | `/courses/:id`                     | Delete a course (cascades to lessons) |
| GET    | `/courses/:courseId/lessons`       | List lessons. Optional `?q=` search (title/content), `?sort=` (`order`\|`title`\|`id`) / `?order=` (`asc`\|`desc`) sorting, and `?limit=` (1–100) / `?offset=` (≥0) pagination. Total match count is in the `X-Total-Count` header. |
| GET    | `/courses/:courseId/lessons/:id`   | Get a lesson      |
| POST   | `/courses/:courseId/lessons`       | Create a lesson   |
| PUT    | `/courses/:courseId/lessons/:id`   | Update a lesson   |
| DELETE | `/courses/:courseId/lessons/:id`   | Delete a lesson   |
| PUT    | `/courses/:courseId/lessons/reorder` | Reorder all lessons (body `{ order: [id, …] }`) |

## Scripts

| Command         | Description                  |
| --------------- | ---------------------------- |
| `npm start`     | Run the application          |
| `npm test`      | Run the API test suite       |

## Testing

API tests use Node's built-in test runner (`node --test`) — no extra
dependencies. They spin up the app on an ephemeral port against a throwaway
SQLite database (`DB_PATH` points at a temp file), so the real `courses.db` is
never touched. Run them with:

```bash
npm test
```

### Continuous integration

`.github/workflows/ci.yml` runs the test suite on every push and pull request
to `main`, across Node 20 and 22. It installs with `npm ci` (which compiles the
`better-sqlite3` native module) and runs `npm test`. The build status is shown
by the badge at the top of this file.

## License

MIT
