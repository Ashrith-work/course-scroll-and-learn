# Course Scroll and Learn

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

This runs the `index.js` entry point.

## Project Structure

```
.
├── index.js            # Application entry point (Express server)
├── data/
│   ├── db.js           # SQLite connection, schema, and seed
│   └── store.js        # Repository layer (data access functions)
├── routes/
│   ├── courses.js      # /courses CRUD
│   └── lessons.js      # /courses/:courseId/lessons CRUD (nested)
├── package.json        # Project metadata and scripts
└── README.md
```

## Database

Persistence uses **SQLite** via [`better-sqlite3`](https://github.com/WiseLibraries/better-sqlite3).
The database file (`courses.db`) is created automatically on first run, with the
schema applied and sample data seeded. It is gitignored.

Override the location with the `DB_PATH` environment variable.

## API

| Method | Path                               | Description       |
| ------ | ---------------------------------- | ----------------- |
| GET    | `/courses`                         | List courses      |
| GET    | `/courses/:id`                     | Get a course      |
| POST   | `/courses`                         | Create a course   |
| PUT    | `/courses/:id`                     | Update a course   |
| DELETE | `/courses/:id`                     | Delete a course (cascades to lessons) |
| GET    | `/courses/:courseId/lessons`       | List lessons      |
| GET    | `/courses/:courseId/lessons/:id`   | Get a lesson      |
| POST   | `/courses/:courseId/lessons`       | Create a lesson   |
| PUT    | `/courses/:courseId/lessons/:id`   | Update a lesson   |
| DELETE | `/courses/:courseId/lessons/:id`   | Delete a lesson   |

## Scripts

| Command         | Description                  |
| --------------- | ---------------------------- |
| `npm start`     | Run the application          |
| `npm test`      | Run tests (not yet set up)   |

## License

MIT
