import { PROGRAMS } from "../core/derived.js";
import { isSatisfied } from "../core/gating.js";
import { getCreditsValueForUI, kindOfCourse, getPlannedSemester, moveWithCoreqs } from "../core/placement.js";
import { makeCourseCard, matchesFilter, matchesSearch } from "./courseCard.js";

let dragInProgress = false;

let multi = {
  activeSemester: null,
  action: "completed",
  selectedCourseIds: new Set(),
};

export function renderSemesterBoard(ctx, hooks) {
  const board = document.getElementById("semesterBoard");
  board.innerHTML = "";

  const semesters = ["1", "2", "3", "4", "5", "6"];

  for (const sem of semesters) {
    const grid = document.createElement("div");
    grid.className = "semesterGrid";
    grid.dataset.sem = sem;

    grid.appendChild(renderSemesterBanner(ctx, sem, hooks));
    grid.appendChild(renderDropzone(ctx, "adminOnly", sem, hooks));
    grid.appendChild(renderDropzone(ctx, "common", sem, hooks));
    grid.appendChild(renderDropzone(ctx, "contaOnly", sem, hooks));

    board.appendChild(grid);
  }
}

function renderSemesterBanner(ctx, sem, hooks) {
  const isActive = multi.activeSemester === sem;
  const pending = countPendingCreditsForSemester(ctx, sem);

  const banner = document.createElement("div");
  banner.className = "semesterBanner";
  banner.style.display = "grid";
  banner.style.gridTemplateColumns = "1fr auto 1fr";
  banner.style.alignItems = "center";
  banner.style.gap = "10px";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "10px";
  left.style.justifyContent = "flex-start";

  const title = document.createElement("div");
  title.textContent = `SEMESTRE ${sem}`;
  title.style.fontWeight = "1000";
  title.style.letterSpacing = ".06em";

  const center = document.createElement("div");
  center.style.textAlign = "center";
  center.style.fontWeight = "900";
  center.style.opacity = "0.95";
  center.textContent = `${pending} créditos pendientes`;

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.alignItems = "center";
  right.style.gap = "8px";
  right.style.flexWrap = "wrap";
  right.style.justifyContent = "flex-end";

  if (!isActive) {
    const countVisible = countCoursesInSemester(ctx, sem);

    const multiBtn = document.createElement("button");
    multiBtn.type = "button";
    multiBtn.className = "btn btn--ghost";
    multiBtn.textContent = `Multi (${countVisible})`;
    multiBtn.style.background = "rgba(255,255,255,.14)";
    multiBtn.style.borderColor = "rgba(255,255,255,.28)";
    multiBtn.style.color = "var(--bone)";
    multiBtn.addEventListener("click", () => {
      multi.activeSemester = sem;
      multi.selectedCourseIds = new Set();
      multi.action = "completed";
      hooks.onHardRerenderAll();
      hooks.onToast("Selecciona materias y confirma con OK.");
    });

    left.appendChild(title);
    right.appendChild(multiBtn);
  } else {
    const label = document.createElement("span");
    label.textContent = "Multi:";
    label.style.color = "var(--bone)";
    label.style.opacity = "0.95";

    const select = document.createElement("select");
    select.style.padding = "6px 10px";
    select.style.borderRadius = "10px";
    select.style.border = "1px solid rgba(255,255,255,.28)";
    select.style.background = "rgba(255,255,255,.14)";
    select.style.color = "var(--bone)";
    select.style.outline = "none";
    select.innerHTML = `
      <option value="completed">Marcar completadas</option>
      <option value="homologated">Marcar homologadas</option>
    `;
    select.value = multi.action;
    select.addEventListener("change", () => { multi.action = select.value; });

    const selectedCount = document.createElement("span");
    selectedCount.textContent = `Seleccionadas: ${multi.selectedCourseIds.size}`;
    selectedCount.style.color = "var(--bone)";
    selectedCount.style.opacity = "0.95";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.style.background = "rgba(255,255,255,.12)";
    cancelBtn.style.borderColor = "rgba(255,255,255,.26)";
    cancelBtn.style.color = "var(--bone)";
    cancelBtn.addEventListener("click", () => {
      multi.activeSemester = null;
      multi.selectedCourseIds = new Set();
      hooks.onHardRerenderAll();
      hooks.onToast("Multi cancelado.");
    });

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn";
    okBtn.textContent = "OK";
    okBtn.style.background = "rgba(255,255,255,.20)";
    okBtn.style.borderColor = "rgba(255,255,255,.30)";
    okBtn.style.color = "var(--bone)";
    okBtn.addEventListener("click", () => applyMulti(ctx, sem, hooks));

    left.appendChild(title);
    right.appendChild(label);
    right.appendChild(select);
    right.appendChild(selectedCount);
    right.appendChild(cancelBtn);
    right.appendChild(okBtn);
  }

  left.appendChild(title);
  banner.appendChild(left);
  banner.appendChild(center);
  banner.appendChild(right);

  return banner;
}

function applyMulti(ctx, sem, hooks) {
  if (multi.activeSemester !== sem) return;

  const ids = [...multi.selectedCourseIds];
  if (ids.length === 0) {
    hooks.onToast("No seleccionaste materias.");
    return;
  }

  for (const cid of ids) ctx.state.courseStatus[cid] = multi.action;

  multi.activeSemester = null;
  multi.selectedCourseIds = new Set();
  hooks.onStateChanged();
  hooks.onToast(`Aplicado: ${ids.length} materias → ${multi.action === "completed" ? "completadas" : "homologadas"}.`);
}

function renderDropzone(ctx, kind, sem, hooks) {
  const zone = document.createElement("div");
  zone.className = "dropzone";
  zone.dataset.sem = sem;
  zone.dataset.kind = kind;

  const dragAllowed = !(multi.activeSemester && multi.activeSemester === sem);

  if (dragAllowed) {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("is-over");
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });

    zone.addEventListener("dragleave", (e) => {
      if (e.relatedTarget && zone.contains(e.relatedTarget)) return;
      zone.classList.remove("is-over");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-over");

      const cid = e.dataTransfer?.getData("text/plain");
      if (!cid) return;

      const newSem = sem;
      const oldSem = getPlannedSemester(ctx, cid);
      if (newSem === oldSem) return;

      const courseKind = kindOfCourse(ctx, cid);
      const moved = moveWithCoreqs(ctx, cid, newSem, courseKind);

      hooks.onStateChanged();
      hooks.onToast(
        moved.length ? `Movido a semestre ${newSem} (también: ${moved.length})` : `Movido a semestre ${newSem}`
      );
    });
  }

  const courses = getCoursesFor(ctx, kind, sem)
    .filter(cid => matchesFilter(ctx, cid))
    .filter(cid => matchesSearch(ctx, cid));

  if (courses.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dropzone__empty";
    empty.textContent = "—";
    zone.appendChild(empty);
    return zone;
  }

  courses.sort((a, b) => getCourseName(ctx, a).localeCompare(getCourseName(ctx, b), "es"));

  for (const cid of courses) {
    zone.appendChild(makeCourseCard(ctx, cid, kind, sem, {
      multi,
      dragInProgressRef: {
        get: () => dragInProgress,
        set: (v) => { dragInProgress = v; }
      },
      onToggleSelected: () => hooks.onSoftRerenderBoard(),
      onOpenModal: (courseId, courseKind) => {
        window.__IES_OPEN_MODAL__?.(ctx, courseId, courseKind, hooks);
      },
      onMovedByDrag: () => hooks.onStateChanged(),
    }));
  }

  return zone;
}

function getCoursesFor(ctx, kind, sem) {
  const list = [];

  if (kind === "common") {
    for (const cid of ctx.derived.commonSet) {
      if ((ctx.state.placements.common?.[cid] ?? "1") === sem) list.push(cid);
    }
    return list;
  }

  if (kind === "adminOnly") {
    const place = ctx.state.placements[PROGRAMS.ADMIN] ?? {};
    for (const cid of ctx.derived.adminOnlySet) {
      if ((place[cid] ?? "1") === sem) list.push(cid);
    }
    return list;
  }

  if (kind === "contaOnly") {
    const place = ctx.state.placements[PROGRAMS.CONTA] ?? {};
    for (const cid of ctx.derived.contaOnlySet) {
      if ((place[cid] ?? "1") === sem) list.push(cid);
    }
    return list;
  }

  return list;
}

function countCoursesInSemester(ctx, sem) {
  const all = [
    ...getCoursesFor(ctx, "adminOnly", sem),
    ...getCoursesFor(ctx, "common", sem),
    ...getCoursesFor(ctx, "contaOnly", sem),
  ];
  return all.filter(cid => matchesFilter(ctx, cid) && matchesSearch(ctx, cid)).length;
}

function countPendingCreditsForSemester(ctx, sem) {
  let sum = 0;
  for (const kind of ["adminOnly", "common", "contaOnly"]) {
    const list = getCoursesFor(ctx, kind, sem);
    for (const cid of list) {
      if (!isSatisfied(ctx.state, cid)) sum += getCreditsValueForUI(ctx, cid, kind);
    }
  }
  return sum;
}

function getCourseName(ctx, courseId) {
  const custom = ctx.state.customNames?.[courseId];
  if (custom && custom.trim()) return custom.trim();
  return ctx.derived.courseCatalog[courseId]?.name ?? courseId;
}
