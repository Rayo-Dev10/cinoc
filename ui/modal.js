import { PROGRAMS } from "../core/derived.js";
import { computeGate } from "../core/gating.js";
import { kindOfCourse, moveWithCoreqs, getPlannedSemester } from "../core/placement.js";
import { kvBlock, escapeHTML } from "../utils/dom.js";

export function wireModalShell() {
  const modal = document.getElementById("courseModal");
  const closeBtn = document.getElementById("modalClose");
  const okBtn = document.getElementById("modalOk");

  closeBtn?.addEventListener("click", () => modal.close());
  okBtn?.addEventListener("click", () => modal.close());

  // Exponemos un "hook" global para abrir modal desde board/cards sin ciclos raros
  window.__IES_OPEN_MODAL__ = (ctx, courseId, kind, hooks) => openCourseModal(ctx, courseId, kind, hooks);
}

function openCourseModal(ctx, courseId, kind, hooks) {
  const modal = document.getElementById("courseModal");
  const title = document.getElementById("modalTitle");
  const subtitle = document.getElementById("modalSubtitle");
  const body = document.getElementById("modalBody");

  const name = getCourseName(ctx, courseId);
  const code = ctx.derived.courseCatalog[courseId]?.code ?? "—";
  const isElective = ctx.derived.courseCatalog[courseId]?.type === "elective_slot";
  const status = ctx.state.courseStatus?.[courseId] ?? null;
  const sem = getPlannedSemester(ctx, courseId);

  const gateAdmin = (kind === "contaOnly") ? null : computeGate(ctx, PROGRAMS.ADMIN, courseId, kind);
  const gateConta = (kind === "adminOnly") ? null : computeGate(ctx, PROGRAMS.CONTA, courseId, kind);

  title.textContent = name;
  subtitle.textContent = `${code} · Semestre planificado: ${sem}`;

  body.innerHTML = "";

  let creditLine = "";
  if (kind === "common") {
    const a = ctx.derived.adminCredits[courseId] ?? 0;
    const c = ctx.derived.contaCredits[courseId] ?? 0;
    creditLine = `Admin: ${a} cr · Conta: ${c} cr`;
  } else if (kind === "adminOnly") {
    creditLine = `${ctx.derived.adminCredits[courseId] ?? 0} cr`;
  } else {
    creditLine = `${ctx.derived.contaCredits[courseId] ?? 0} cr`;
  }

  body.appendChild(kvBlock([
    ["Créditos", creditLine],
    ["Estado", status === "completed" ? "Completada" : status === "homologated" ? "Homologada" : "Pendiente"],
  ]));

  const actions = document.createElement("div");
  actions.className = "card";
  actions.innerHTML = `
    <h4 style="margin:0 0 8px 0">Acciones</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn" data-act="completed">Marcar completada</button>
      <button type="button" class="btn" data-act="homologated">Marcar homologada</button>
      <button type="button" class="btn btn--ghost" data-act="clear">Limpiar estado</button>
    </div>

    <div style="margin-top:12px" class="kv">
      <div class="k">Mover a semestre</div>
      <div class="v">
        <select id="moveSelect">
          <option value="1">Semestre 1</option>
          <option value="2">Semestre 2</option>
          <option value="3">Semestre 3</option>
          <option value="4">Semestre 4</option>
          <option value="5">Semestre 5</option>
          <option value="6">Semestre 6</option>
        </select>
      </div>
      <div class="k"></div>
      <div class="v">
        <button type="button" class="btn" id="moveBtn">Mover (con correquisitos)</button>
      </div>
    </div>

    ${isElective ? `
      <div style="margin-top:12px" class="kv">
        <div class="k">Nombre (electiva)</div>
        <div class="v">
          <input id="electiveName" type="text" placeholder="Electiva..." />
        </div>
        <div class="k"></div>
        <div class="v">
          <button type="button" class="btn btn--ghost" id="saveElectiveName">Guardar nombre</button>
        </div>
      </div>
    ` : ""}
  `;
  body.appendChild(actions);

  const moveSelect = actions.querySelector("#moveSelect");
  moveSelect.value = sem;

  if (isElective) {
    const inp = actions.querySelector("#electiveName");
    inp.value = ctx.state.customNames?.[courseId] ?? "";
    actions.querySelector("#saveElectiveName").addEventListener("click", () => {
      const v = inp.value.trim();
      ctx.state.customNames[courseId] = v;
      hooks.onStateChanged();
      hooks.onToast("Nombre de electiva guardado.");
      modal.close();
    });
  }

  actions.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act === "clear") delete ctx.state.courseStatus[courseId];
      if (act === "completed") ctx.state.courseStatus[courseId] = "completed";
      if (act === "homologated") ctx.state.courseStatus[courseId] = "homologated";
      hooks.onStateChanged();
      hooks.onToast("Estado actualizado.");
      modal.close();
    });
  });

  actions.querySelector("#moveBtn").addEventListener("click", () => {
    const newSem = actions.querySelector("#moveSelect").value;
    moveWithCoreqs(ctx, courseId, newSem, kindOfCourse(ctx, courseId));
    hooks.onStateChanged();
    hooks.onToast("Movido (y correquisitos).");
    modal.close();
  });

  body.appendChild(unlockBlock(ctx, courseId, kind, gateAdmin, gateConta));
  modal.showModal();
}

function unlockBlock(ctx, courseId, kind, gateAdmin, gateConta) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `<h4 style="margin:0 0 8px 0">Cómo desbloquear / requisitos</h4>`;

  const list = document.createElement("div");
  list.className = "list";

  const renderProgram = (label, gate) => {
    const section = document.createElement("div");
    section.className = "item";
    section.innerHTML = `
      <div class="left">
        <b>${escapeHTML(label)}</b>
      </div>
      <div class="right">${gate?.locked ? "🔒" : "🔓"}</div>
    `;
    list.appendChild(section);

    const prereq = gate?.missing?.prereq ?? [];
    const coreq = gate?.missing?.coreq ?? [];

    if ((!gate?.rule) || (!gate.locked && prereq.length === 0 && coreq.length === 0)) return;

    if (prereq.length > 0) {
      const p = document.createElement("div");
      p.className = "item";
      p.innerHTML = `<div class="left"><b>Prerrequisitos faltantes</b></div><div class="right"></div>`;
      list.appendChild(p);

      for (const m of prereq) {
        const cName = getCourseName(ctx, m.course_id);
        const it = document.createElement("div");
        it.className = "item";
        it.innerHTML = `<div class="left">${escapeHTML(cName)}</div><div class="right"><span class="chip warn">Falta</span></div>`;
        list.appendChild(it);
      }
    }

    if (coreq.length > 0) {
      const p = document.createElement("div");
      p.className = "item";
      p.innerHTML = `<div class="left"><b>Correquisitos faltantes</b></div><div class="right"></div>`;
      list.appendChild(p);

      for (const m of coreq) {
        const cName = getCourseName(ctx, m.course_id);
        const it = document.createElement("div");
        it.className = "item";
        it.innerHTML = `<div class="left">${escapeHTML(cName)}</div><div class="right"><span class="chip warn">Falta</span></div>`;
        list.appendChild(it);
      }
    }
  };

  if (kind === "adminOnly") renderProgram("Administración", gateAdmin ?? computeGate(ctx, PROGRAMS.ADMIN, courseId, kind));
  else if (kind === "contaOnly") renderProgram("Contaduría", gateConta ?? computeGate(ctx, PROGRAMS.CONTA, courseId, kind));
  else {
    renderProgram("Administración", gateAdmin ?? computeGate(ctx, PROGRAMS.ADMIN, courseId, kind));
    renderProgram("Contaduría", gateConta ?? computeGate(ctx, PROGRAMS.CONTA, courseId, kind));
  }

  wrap.appendChild(list);
  return wrap;
}

function getCourseName(ctx, courseId) {
  const custom = ctx.state.customNames?.[courseId];
  if (custom && custom.trim()) return custom.trim();
  return ctx.derived.courseCatalog[courseId]?.name ?? courseId;
}
