const feed = document.getElementById("feed");
const hint = document.getElementById("hint");
const fab = document.getElementById("fab");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");

const modal = document.getElementById("modal");
const modalForm = document.getElementById("modal-form");
const modalTitle = document.getElementById("modal-title");
const modalFields = document.getElementById("modal-fields");
const modalError = document.getElementById("modal-error");
const modalCancel = document.getElementById("modal-cancel");

// --- API helper ---

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

// --- DOM helpers ---

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

async function withAlert(action) {
  try {
    await action();
  } catch (err) {
    alert(err.message);
  }
}

// --- Modal form ---

let submitHandler = null;

function openForm({ title, fields, onSubmit }) {
  modalTitle.textContent = title;
  modalFields.innerHTML = "";
  modalError.hidden = true;
  modalError.textContent = "";

  for (const field of fields) {
    const wrap = el("label", "field");
    wrap.appendChild(el("span", "field__label", field.label));
    const input =
      field.type === "textarea"
        ? Object.assign(document.createElement("textarea"), { rows: 3 })
        : Object.assign(document.createElement("input"), { type: field.type || "text" });
    input.name = field.name;
    if (field.value != null) input.value = field.value;
    if (field.required) input.required = true;
    if (field.placeholder) input.placeholder = field.placeholder;
    wrap.appendChild(input);
    modalFields.appendChild(wrap);
  }

  submitHandler = onSubmit;
  modal.showModal();
  modalFields.querySelector("input, textarea")?.focus();
}

modalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!submitHandler) return;
  const data = Object.fromEntries(new FormData(modalForm).entries());
  const saveBtn = modalForm.querySelector('button[type="submit"]');
  const label = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  modalError.hidden = true;
  try {
    await submitHandler(data);
    modal.close();
  } catch (err) {
    modalError.textContent = err.message;
    modalError.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = label;
  }
});

modalCancel.addEventListener("click", () => modal.close());

// --- Course forms ---

function openCourseForm(course) {
  const isEdit = Boolean(course);
  openForm({
    title: isEdit ? "Edit course" : "New course",
    fields: [
      { name: "title", label: "Title", required: true, value: course?.title },
      { name: "description", label: "Description", type: "textarea", value: course?.description },
    ],
    onSubmit: async (data) => {
      const body = { title: data.title.trim(), description: data.description.trim() };
      if (isEdit) {
        await api("PUT", `/courses/${course.id}`, body);
      } else {
        await api("POST", "/courses", body);
        // Clear an active search on create so the new course is visible.
        searchInput.value = "";
      }
      await loadFeed(true);
    },
  });
}

// --- Lesson forms ---

function openLessonForm(courseId, lesson, onDone) {
  const isEdit = Boolean(lesson);
  openForm({
    title: isEdit ? "Edit lesson" : "New lesson",
    fields: [
      { name: "title", label: "Title", required: true, value: lesson?.title },
      { name: "content", label: "Content", type: "textarea", value: lesson?.content },
      { name: "order", label: "Order (optional)", type: "number", value: lesson?.order },
    ],
    onSubmit: async (data) => {
      const body = { title: data.title.trim(), content: data.content.trim() };
      if (data.order !== "") body.order = Number(data.order);
      if (isEdit) {
        await api("PUT", `/courses/${courseId}/lessons/${lesson.id}`, body);
      } else {
        await api("POST", `/courses/${courseId}/lessons`, body);
      }
      await onDone();
    },
  });
}

// --- Lessons rendering ---

const LESSON_SORTS = [
  ["order:asc", "Order ↑"],
  ["order:desc", "Order ↓"],
  ["title:asc", "Title A–Z"],
  ["title:desc", "Title Z–A"],
];
const LESSON_PAGE_SIZE = 10;

function renderLessonItem(lesson, courseId, renderList) {
  const li = el("li");

  const head = el("div", "lesson__head");
  head.appendChild(el("div", "lesson__title", `${lesson.order}. ${lesson.title}`));

  const actions = el("div", "lesson__actions");
  const editBtn = el("button", "icon-btn", "✏️");
  editBtn.title = "Edit lesson";
  editBtn.addEventListener("click", () => openLessonForm(courseId, lesson, renderList));
  const delBtn = el("button", "icon-btn", "🗑️");
  delBtn.title = "Delete lesson";
  delBtn.addEventListener("click", () =>
    withAlert(async () => {
      if (!confirm(`Delete lesson "${lesson.title}"?`)) return;
      await api("DELETE", `/courses/${courseId}/lessons/${lesson.id}`);
      await renderList();
    })
  );
  actions.append(editBtn, delBtn);
  head.appendChild(actions);
  li.appendChild(head);

  if (lesson.content) {
    li.appendChild(el("div", "lesson__content", lesson.content));
  }
  return li;
}

// Fetch and render the lesson list into `list`, using `state` for the current
// search/sort. Pages of LESSON_PAGE_SIZE are appended via a "Load more" button.
// `renderList` re-runs this from the top so edits/deletes refresh in place.
async function fillLessonList(list, courseId, state, renderList) {
  list.innerHTML = "";

  const ul = el("ul", "lessons");
  const moreBtn = el("button", "mini-btn", "Load more");
  let loaded = 0;
  let total = 0;

  async function loadPage() {
    const params = new URLSearchParams({
      sort: state.sort,
      order: state.order,
      limit: String(LESSON_PAGE_SIZE),
      offset: String(loaded),
    });
    if (state.q) params.set("q", state.q);

    let lessons;
    try {
      const res = await fetch(`/courses/${courseId}/lessons?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      total = Number(res.headers.get("X-Total-Count"));
      lessons = await res.json();
      if (!Number.isFinite(total)) total = loaded + lessons.length;
    } catch (err) {
      if (loaded === 0) list.appendChild(el("p", "empty", `Failed to load: ${err.message}`));
      return;
    }

    if (loaded === 0 && lessons.length === 0) {
      list.appendChild(el("p", "empty", state.q ? "No lessons match." : "No lessons yet."));
      return;
    }

    for (const lesson of lessons) {
      ul.appendChild(renderLessonItem(lesson, courseId, renderList));
    }
    if (!ul.isConnected) list.appendChild(ul);
    loaded += lessons.length;

    if (loaded < total) {
      if (!moreBtn.isConnected) list.appendChild(moreBtn);
    } else {
      moreBtn.remove();
    }
  }

  moreBtn.addEventListener("click", () => withAlert(loadPage));
  await loadPage();
}

async function refreshLessons(box, courseId) {
  box.innerHTML = "";

  // Per-box state survives toggling the list closed/open within a session.
  const state = box._lessonState ?? (box._lessonState = { q: "", sort: "order", order: "asc" });

  const controls = el("div", "lesson-controls");

  const addBtn = el("button", "mini-btn", "+ Add lesson");

  const search = el("input", "lesson-search");
  search.type = "search";
  search.placeholder = "Search lessons…";
  search.value = state.q;
  search.setAttribute("aria-label", "Search lessons");
  search.autocomplete = "off";

  const sort = document.createElement("select");
  sort.className = "lesson-sort";
  sort.setAttribute("aria-label", "Sort lessons");
  for (const [value, label] of LESSON_SORTS) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    sort.appendChild(opt);
  }
  sort.value = `${state.sort}:${state.order}`;

  controls.append(addBtn, search, sort);
  box.appendChild(controls);

  const list = el("div", "lesson-list");
  box.appendChild(list);

  const renderList = () => fillLessonList(list, courseId, state, renderList);

  addBtn.addEventListener("click", () => openLessonForm(courseId, null, renderList));

  let timer;
  search.addEventListener("input", () => {
    state.q = search.value.trim();
    clearTimeout(timer);
    timer = setTimeout(renderList, 250);
  });
  sort.addEventListener("change", () => {
    [state.sort, state.order] = sort.value.split(":");
    renderList();
  });

  await renderList();
}

// --- Course card ---

function renderCourse(course, index, total) {
  const card = el("section", "card");
  card.dataset.id = course.id;

  card.appendChild(el("p", "card__index", `Course ${index + 1} of ${total}`));
  card.appendChild(el("h2", "card__title", course.title));
  if (course.description) {
    card.appendChild(el("p", "card__desc", course.description));
  }

  const actions = el("div", "card__actions");
  const viewBtn = el("button", "card__btn", "View lessons");
  const editBtn = el("button", "card__btn card__btn--ghost", "Edit");
  const delBtn = el("button", "card__btn card__btn--ghost", "Delete");
  actions.append(viewBtn, editBtn, delBtn);
  card.appendChild(actions);

  const lessonsBox = el("div", "lessons-box");
  let open = false;

  viewBtn.addEventListener("click", () =>
    withAlert(async () => {
      if (open) {
        lessonsBox.innerHTML = "";
        open = false;
        viewBtn.textContent = "View lessons";
        return;
      }
      viewBtn.textContent = "Loading…";
      await refreshLessons(lessonsBox, course.id);
      open = true;
      viewBtn.textContent = "Hide lessons";
    })
  );

  editBtn.addEventListener("click", () => openCourseForm(course));
  delBtn.addEventListener("click", () =>
    withAlert(async () => {
      if (!confirm(`Delete course "${course.title}" and its lessons?`)) return;
      await api("DELETE", `/courses/${course.id}`);
      await loadFeed(true);
    })
  );

  card.appendChild(lessonsBox);
  return card;
}

// --- Feed (paginated, infinite scroll) ---

const PAGE_SIZE = 10;
let loadedCount = 0;
let totalCount = 0;
let loading = false;

// loadFeed(true) resets to the first page (initial load, search change, or after
// a mutation). loadFeed(false) appends the next page for infinite scroll.
async function loadFeed(reset) {
  if (loading) return;
  if (!reset && loadedCount >= totalCount) return; // everything is loaded
  loading = true;

  const query = searchInput.value.trim();
  if (reset) {
    loadedCount = 0;
    totalCount = 0;
  }

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(loadedCount),
  });
  if (query) params.set("q", query);
  const [sortField, sortOrder] = sortSelect.value.split(":");
  params.set("sort", sortField);
  params.set("order", sortOrder);

  let courses;
  try {
    const res = await fetch(`/courses?${params}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    totalCount = Number(res.headers.get("X-Total-Count"));
    courses = await res.json();
    if (!Number.isFinite(totalCount)) totalCount = courses.length;
  } catch (err) {
    if (reset) {
      renderState(`Could not load courses: ${err.message}`);
      hint.style.display = "none";
    }
    loading = false;
    return;
  }

  if (reset) feed.innerHTML = "";

  if (reset && courses.length === 0) {
    renderState(
      query ? `No courses match “${query}”.` : "No courses yet. Tap ＋ to create one."
    );
    hint.style.display = "none";
    loading = false;
    return;
  }

  hint.style.display = "";
  courses.forEach((course, i) => {
    feed.appendChild(renderCourse(course, loadedCount + i, totalCount));
  });
  loadedCount += courses.length;
  loading = false;
}

// Load the next page when the user scrolls within a viewport of the bottom.
feed.addEventListener("scroll", () => {
  if (loading || loadedCount >= totalCount) return;
  const remaining = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
  if (remaining < feed.clientHeight) {
    loadFeed(false);
  }
});

fab.addEventListener("click", () => openCourseForm(null));

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadFeed(true), 250);
});

sortSelect.addEventListener("change", () => loadFeed(true));

loadFeed(true);
