import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import coursesRouter from "./routes/courses.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the static frontend (index.html, app.js, styles.css).
app.use(express.static(join(__dirname, "public")));

app.use("/courses", coursesRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Turn malformed JSON bodies into a clean 400 instead of an HTML error page.
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next(err);
});

// Only start listening when run directly (not when imported by tests).
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
