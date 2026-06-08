const feed = document.getElementById("feed");
const hint = document.getElementById("hint");
const fab = document.getElementById("fab");

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
      const saved = isEdit
        ? await api("PUT", `/courses/${course.id}`, body)
        : await api("POST", "/courses", body);
      await loadFeed(saved.id);
    },
  });
}

// --- Lesson forms ---

function openLessonForm(courseId, lesson, box) {
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
      await refreshLessons(box, courseId);
    },
  });
}

// --- Lessons rendering ---

async function refreshLessons(box, courseId) {
  box.innerHTML = "";

  const addBtn = el("button", "mini-btn", "+ Add lesson");
  addBtn.addEventListener("click", () => openLessonForm(courseId, null, box));
  box.appendChild(addBtn);

  let lessons;
  try {
    lessons = await api("GET", `/courses/${courseId}/lessons`);
  } catch (err) {
    box.appendChild(el("p", "empty", `Failed to load: ${err.message}`));
    return;
  }

  if (lessons.length === 0) {
    box.appendChild(el("p", "empty", "No lessons yet."));
    return;
  }

  const list = el("ul", "lessons");
  for (const lesson of lessons) {
    const li = el("li");

    const head = el("div", "lesson__head");
    head.appendChild(el("div", "lesson__title", `${lesson.order}. ${lesson.title}`));

    const actions = el("div", "lesson__actions");
    const editBtn = el("button", "icon-btn", "✏️");
    editBtn.title = "Edit lesson";
    editBtn.addEventListener("click", () => openLessonForm(courseId, lesson, box));
    const delBtn = el("button", "icon-btn", "🗑️");
    delBtn.title = "Delete lesson";
    delBtn.addEventListener("click", () =>
      withAlert(async () => {
        if (!confirm(`Delete lesson "${lesson.title}"?`)) return;
        await api("DELETE", `/courses/${courseId}/lessons/${lesson.id}`);
        await refreshLessons(box, courseId);
      })
    );
    actions.append(editBtn, delBtn);
    head.appendChild(actions);
    li.appendChild(head);

    if (lesson.content) {
      li.appendChild(el("div", "lesson__content", lesson.content));
    }
    list.appendChild(li);
  }
  box.appendChild(list);
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
      await loadFeed();
    })
  );

  card.appendChild(lessonsBox);
  return card;
}

// --- Feed ---

async function loadFeed(targetCourseId) {
  let courses;
  try {
    courses = await api("GET", "/courses");
  } catch (err) {
    renderState(`Could not load courses: ${err.message}`);
    hint.style.display = "none";
    return;
  }

  if (courses.length === 0) {
    renderState("No courses yet. Tap ＋ to create one.");
    hint.style.display = "none";
    return;
  }

  hint.style.display = "";
  feed.innerHTML = "";
  courses.forEach((course, i) => {
    feed.appendChild(renderCourse(course, i, courses.length));
  });

  if (targetCourseId != null) {
    feed.querySelector(`.card[data-id="${targetCourseId}"]`)?.scrollIntoView();
  }
}

fab.addEventListener("click", () => openCourseForm(null));

loadFeed();
