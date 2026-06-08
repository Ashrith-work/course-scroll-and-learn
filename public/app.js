const feed = document.getElementById("feed");
const hint = document.getElementById("hint");
const fab = document.getElementById("fab");
const searchInput = document.getElementById("search");
const sortSelect = document.getElementById("sort");
const authArea = document.getElementById("authArea");

const modal = document.getElementById("modal");
const modalForm = document.getElementById("modal-form");
const modalTitle = document.getElementById("modal-title");
const modalFields = document.getElementById("modal-fields");
const modalError = document.getElementById("modal-error");
const modalCancel = document.getElementById("modal-cancel");

// --- Auth state ---

function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem("auth")) || null;
  } catch {
    return null;
  }
}

let auth = loadAuth();

function saveAuth(value) {
  auth = value;
  if (value) localStorage.setItem("auth", JSON.stringify(value));
  else localStorage.removeItem("auth");
}

// --- API helper ---

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (auth?.token) opts.headers["Authorization"] = `Bearer ${auth.token}`;
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

function renderLessonItem(lesson, courseId, renderList, owned) {
  const li = el("li");

  const head = el("div", "lesson__head");
  head.appendChild(el("div", "lesson__title", `${lesson.order}. ${lesson.title}`));

  // Edit/delete a lesson only if the user owns the parent course.
  if (owned) {
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
  }
  li.appendChild(head);

  if (lesson.content) {
    li.appendChild(el("div", "lesson__content", lesson.content));
  }
  return li;
}

// Fetch and render the lesson list into `list`, using `state` for the current
// search/sort. Pages of LESSON_PAGE_SIZE are appended via a "Load more" button.
// `renderList` re-runs this from the top so edits/deletes refresh in place.
async function fillLessonList(list, courseId, state, renderList, owned) {
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
      ul.appendChild(renderLessonItem(lesson, courseId, renderList, owned));
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

async function refreshLessons(box, courseId, owned) {
  box.innerHTML = "";

  // Per-box state survives toggling the list closed/open within a session.
  const state = box._lessonState ?? (box._lessonState = { q: "", sort: "order", order: "asc" });

  const controls = el("div", "lesson-controls");

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

  controls.append(search, sort);

  const list = el("div", "lesson-list");
  const renderList = () => fillLessonList(list, courseId, state, renderList, owned);

  // Write controls (add lesson, reorder) only for the course owner.
  if (owned) {
    const addBtn = el("button", "mini-btn", "+ Add lesson");
    addBtn.addEventListener("click", () => openLessonForm(courseId, null, renderList));
    controls.prepend(addBtn);

    // Reordering only makes sense in the natural order view (no search, order ↑).
    if (state.sort === "order" && state.order === "asc" && !state.q) {
      const reorderBtn = el("button", "mini-btn", "↕ Reorder");
      reorderBtn.addEventListener("click", () => enterReorderMode(box, courseId, owned));
      controls.appendChild(reorderBtn);
    }
  }

  box.appendChild(controls);
  box.appendChild(list);

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

// --- Reorder mode (drag and drop) ---

// Find the item the dragged row should be inserted before, based on cursor Y.
function dragAfterElement(container, y) {
  const items = [...container.querySelectorAll(".reorder-item:not(.dragging)")];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const child of items) {
    const rect = child.getBoundingClientRect();
    const offset = y - rect.top - rect.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }
  return closest.element;
}

async function enterReorderMode(box, courseId, owned) {
  box.innerHTML = "";

  const controls = el("div", "lesson-controls");
  controls.appendChild(el("span", "reorder-hint", "Drag rows to reorder"));
  const doneBtn = el("button", "mini-btn", "✓ Done");
  doneBtn.addEventListener("click", () => refreshLessons(box, courseId, owned));
  controls.appendChild(doneBtn);
  box.appendChild(controls);

  let lessons;
  try {
    lessons = await api("GET", `/courses/${courseId}/lessons?sort=order&order=asc&limit=100`);
  } catch (err) {
    box.appendChild(el("p", "empty", `Failed to load: ${err.message}`));
    return;
  }
  if (lessons.length === 0) {
    box.appendChild(el("p", "empty", "No lessons to reorder."));
    return;
  }

  const ul = el("ul", "lessons reorder-list");
  for (const lesson of lessons) {
    const li = el("li", "reorder-item");
    li.draggable = true;
    li.dataset.id = lesson.id;
    li.appendChild(el("span", "drag-handle", "⠿"));
    li.appendChild(el("span", "lesson__title", lesson.title));
    ul.appendChild(li);
  }
  box.appendChild(ul);

  let dragEl = null;
  ul.addEventListener("dragstart", (e) => {
    dragEl = e.target.closest(".reorder-item");
    if (dragEl) dragEl.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  ul.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragEl) return;
    const after = dragAfterElement(ul, e.clientY);
    if (after == null) ul.appendChild(dragEl);
    else ul.insertBefore(dragEl, after);
  });
  ul.addEventListener("dragend", async () => {
    if (dragEl) dragEl.classList.remove("dragging");
    dragEl = null;
    const ids = [...ul.querySelectorAll(".reorder-item")].map((li) => Number(li.dataset.id));
    await withAlert(() => api("PUT", `/courses/${courseId}/lessons/reorder`, { order: ids }));
  });
}

// --- Course card ---

// Does the logged-in user own this course?
function ownsCourse(course) {
  return Boolean(auth?.user && course.userId != null && course.userId === auth.user.id);
}

function renderCourse(course, index, total) {
  const owned = ownsCourse(course);
  const card = el("section", "card");
  card.dataset.id = course.id;

  card.appendChild(el("p", "card__index", `Course ${index + 1} of ${total}`));
  card.appendChild(el("h2", "card__title", course.title));
  if (course.description) {
    card.appendChild(el("p", "card__desc", course.description));
  }
  if (course.owner) {
    card.appendChild(el("p", "card__owner", owned ? "by you" : `by ${course.owner}`));
  }

  const actions = el("div", "card__actions");
  const viewBtn = el("button", "card__btn", "View lessons");
  actions.appendChild(viewBtn);

  // Edit/Delete only for the owner.
  if (owned) {
    const editBtn = el("button", "card__btn card__btn--ghost", "Edit");
    const delBtn = el("button", "card__btn card__btn--ghost", "Delete");
    editBtn.addEventListener("click", () => openCourseForm(course));
    delBtn.addEventListener("click", () =>
      withAlert(async () => {
        if (!confirm(`Delete course "${course.title}" and its lessons?`)) return;
        await api("DELETE", `/courses/${course.id}`);
        await loadFeed(true);
      })
    );
    actions.append(editBtn, delBtn);
  }
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
      await refreshLessons(lessonsBox, course.id, owned);
      open = true;
      viewBtn.textContent = "Hide lessons";
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

// --- Auth UI ---

function openAuthForm(mode) {
  const isLogin = mode === "login";
  openForm({
    title: isLogin ? "Log in" : "Sign up",
    fields: [
      { name: "username", label: "Username", required: true },
      { name: "password", label: "Password", type: "password", required: true },
    ],
    onSubmit: async (data) => {
      const path = isLogin ? "/auth/login" : "/auth/register";
      const result = await api("POST", path, {
        username: data.username.trim(),
        password: data.password,
      });
      saveAuth({ token: result.token, user: result.user });
      renderAuth();
      await loadFeed(true);
    },
  });
}

async function logout() {
  await withAlert(async () => {
    if (auth?.token) await api("POST", "/auth/logout");
  });
  saveAuth(null);
  renderAuth();
  await loadFeed(true);
}

function renderAuth() {
  authArea.innerHTML = "";
  if (auth?.user) {
    authArea.appendChild(el("span", "auth-user", `👤 ${auth.user.username}`));
    const out = el("button", "auth-btn", "Log out");
    out.addEventListener("click", logout);
    authArea.appendChild(out);
  } else {
    const login = el("button", "auth-btn", "Log in");
    login.addEventListener("click", () => openAuthForm("login"));
    const signup = el("button", "auth-btn auth-btn--primary", "Sign up");
    signup.addEventListener("click", () => openAuthForm("register"));
    authArea.append(login, signup);
  }
  // Toggles visibility of write controls (see .needs-auth in CSS).
  document.body.classList.toggle("authed", Boolean(auth?.user));
}

// Validate a stored token on load; clear it if the server rejects it.
async function initAuth() {
  if (auth?.token) {
    try {
      const { user } = await api("GET", "/auth/me");
      saveAuth({ token: auth.token, user });
    } catch {
      saveAuth(null);
    }
  }
  renderAuth();
}

await initAuth();
await loadFeed(true);
