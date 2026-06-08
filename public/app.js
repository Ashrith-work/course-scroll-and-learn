const feed = document.getElementById("feed");
const hint = document.getElementById("hint");

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderState(message) {
  feed.innerHTML = "";
  const card = el("section", "card");
  card.appendChild(el("p", "state", message));
  feed.appendChild(card);
}

function renderLessons(container, lessons) {
  container.innerHTML = "";
  if (lessons.length === 0) {
    container.appendChild(el("p", "empty", "No lessons yet."));
    return;
  }
  const list = el("ul", "lessons");
  for (const lesson of lessons) {
    const li = el("li");
    li.appendChild(el("div", "lesson__title", `${lesson.order}. ${lesson.title}`));
    if (lesson.content) {
      li.appendChild(el("div", "lesson__content", lesson.content));
    }
    list.appendChild(li);
  }
  container.appendChild(list);
}

function renderCourse(course, index, total) {
  const card = el("section", "card");

  card.appendChild(el("p", "card__index", `Course ${index + 1} of ${total}`));
  card.appendChild(el("h2", "card__title", course.title));
  if (course.description) {
    card.appendChild(el("p", "card__desc", course.description));
  }

  const btn = el("button", "card__btn", "View lessons");
  const lessonsBox = el("div", "lessons-box");
  let loaded = false;

  btn.addEventListener("click", async () => {
    if (loaded) {
      lessonsBox.innerHTML = "";
      loaded = false;
      btn.textContent = "View lessons";
      return;
    }
    btn.textContent = "Loading…";
    try {
      const lessons = await fetchJSON(`/courses/${course.id}/lessons`);
      renderLessons(lessonsBox, lessons);
      loaded = true;
      btn.textContent = "Hide lessons";
    } catch (err) {
      renderLessons(lessonsBox, []);
      lessonsBox.querySelector(".empty").textContent = `Failed to load: ${err.message}`;
      btn.textContent = "View lessons";
    }
  });

  card.appendChild(btn);
  card.appendChild(lessonsBox);
  return card;
}

async function init() {
  try {
    const courses = await fetchJSON("/courses");
    if (courses.length === 0) {
      renderState("No courses yet. Add one via POST /courses.");
      hint.style.display = "none";
      return;
    }
    feed.innerHTML = "";
    courses.forEach((course, i) => {
      feed.appendChild(renderCourse(course, i, courses.length));
    });
  } catch (err) {
    renderState(`Could not load courses: ${err.message}`);
    hint.style.display = "none";
  }
}

init();
