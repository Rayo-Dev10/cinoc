import { PROGRAMS } from "../core/derived.js";
import { computeGate, isSatisfied, buildLockLabel } from "../core/gating.js";
import { getCreditsDisplay, getCreditsValueForUI } from "../core/placement.js";
import { escapeHTML } from "../utils/dom.js";
import { getCourseName, getCourseAlias, getCourseOfficialName, getCourseSearchStrings } from "./courseName.js";

export function matchesFilter(ctx, courseId) {
  const c = ctx.derived.courseCatalog[courseId];
  const isElective = c?.type === "elective_slot";

  if (ctx.ui.filter === "all") return true;
  if (ctx.ui.filter === "mandatory") return !isElective;
  if (ctx.ui.filter === "elective") return isElective;
  return true;
}

export function matchesSearch(ctx, courseId) {
  if (!ctx.ui.search) return true;
  const q = ctx.ui.search;
  const haystack = getCourseSearchStrings(ctx, courseId)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function makeCourseCard(ctx, courseId, kind, sem, hooks) {
  const div = document.createElement("div");
  div.className = "course";

  const isMultiActiveHere = hooks.multi.activeSemester === sem;
  const dragAllowed = !isMultiActiveHere;

  div.draggable = dragAllowed;

  const status = ctx.state.courseStatus[courseId] ?? null;
  if (status === "completed") div.classList.add("is-done");
  if (status === "homologated") div.classList.add("is-homo");

  const gateAdmin = (kind === "contaOnly") ? null : computeGate(ctx, PROGRAMS.ADMIN, courseId, kind);
  const gateConta = (kind === "adminOnly") ? null : computeGate(ctx, PROGRAMS.CONTA, courseId, kind);

  const lockedAdmin = !!gateAdmin?.locked;
  const lockedConta = !!gateConta?.locked;

  const lockLabel = buildLockLabel(kind, lockedAdmin, lockedConta);
  const lockedAny = !!lockLabel && !isSatisfied(ctx.state, courseId);
  if (lockedAny) div.classList.add("is-locked");

  const name = getCourseName(ctx, courseId);
  const alias = getCourseAlias(ctx, courseId);
  const officialName = getCourseOfficialName(ctx, courseId);
  const creditsDisplay = getCreditsDisplay(ctx, courseId, kind);

  const checkHTML = isMultiActiveHere
    ? `<input class="multiCheck" type="checkbox" ${hooks.multi.selectedCourseIds.has(courseId) ? "checked" : ""} aria-label="Seleccionar materia" />`
    : "";

  const statusChip =
    status === "completed" ? `<span class="chip ok">Completada</span>` :
    status === "homologated" ? `<span class="chip blue">Homologada</span>` :
    "";

  const lockChip = lockedAny ? `<span class="chip warn">${escapeHTML(lockLabel)}</span>` : "";
  const aliasChip = (alias && alias !== officialName) ? `<span class="chip">Alias</span>` : "";
  const titleText = (alias && alias !== officialName)
    ? `${name} · Oficial: ${officialName}`
    : name;

  div.innerHTML = `
    <div class="course__left" style="display:flex; gap:10px; align-items:flex-start;">
      ${checkHTML}
      <div style="min-width:0;">
        <div class="course__name" title="${escapeHTML(titleText)}">${escapeHTML(name)}</div>
        <div class="course__meta">
          ${statusChip}
          ${lockChip}
          ${aliasChip}
        </div>
      </div>
    </div>

    <div class="course__right">
      <div class="coin" title="${escapeHTML(creditsDisplay)}">${escapeHTML(String(getCreditsValueForUI(ctx, courseId, kind)))}</div>
    </div>
  `;

  if (isMultiActiveHere) {
    const cb = div.querySelector(".multiCheck");
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) hooks.multi.selectedCourseIds.add(courseId);
      else hooks.multi.selectedCourseIds.delete(courseId);
      hooks.onToggleSelected();
    });
  }

  if (dragAllowed) {
    div.addEventListener("dragstart", (e) => {
      hooks.dragInProgressRef.set(true);
      e.dataTransfer?.setData("text/plain", courseId);
      e.dataTransfer?.setDragImage(div, 20, 20);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });

    div.addEventListener("dragend", () => {
      setTimeout(() => { hooks.dragInProgressRef.set(false); }, 0);
    });
  }

  div.addEventListener("click", () => {
    if (hooks.dragInProgressRef.get()) return;
    if (isMultiActiveHere) return;
    hooks.onOpenModal(courseId, kind);
  });

  return div;
}
