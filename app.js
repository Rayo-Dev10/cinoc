
const STORAGE_KEY = "ies_monitor_state_v1";
const THEME_KEY = "ies_theme";

const PROGRAMS = {
  ADMIN: "ADMINISTRACION_EMPRESAS",
  CONTA: "CONTADURIA_PUBLICA",
};

const ctx = {
  curriculum: null,
  derived: null,
  state: null,
  ui: {
    filter: "all",
    search: "",
  },
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderShell();
  initTheme({ themeKey: THEME_KEY, onThemeChanged: () => rerenderStats() });
  wireModalShell();

  try {
    ctx.curriculum = await fetchJSON("./curriculum.json");
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `
      <div style="padding:24px;max-width:900px;margin:0 auto;font-family:system-ui;color:#111">
        <h2>Error cargando curriculum.json</h2>
        <p>Si abriste con doble click (file://), fetch falla.</p>
        <p>Solución: ejecuta un servidor local:</p>
        <pre style="background:#111;color:#fff;padding:12px;border-radius:12px;overflow:auto">python -m http.server</pre>
        <p>y entra a <b>http://localhost:8000/nuevoDesarrollo/</b></p>
      </div>`;
    return;
  }

  ctx.derived = buildDerived(ctx.curriculum);
  ctx.state = loadState(STORAGE_KEY) ?? createDefaultState(ctx.derived);

  bindUI();
  rerenderAll();
  registerServiceWorker();
}

function renderShell() {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar__title">
          <h1>Avance IES</h1>
          <p class="kpiSmall">Monitor de materias y progreso</p>
        </div>

        <div class="topbar__actions">
          <input id="searchInput" class="search" type="text" placeholder="Buscar materia..." />

          <div class="segmented" role="tablist" aria-label="Filtro de materias">
            <button class="segmented__btn is-active" data-filter="all">Todas</button>
            <button class="segmented__btn" data-filter="mandatory">Obligatorias</button>
            <button class="segmented__btn" data-filter="elective">Electivas</button>
          </div>

          <div class="themeSwitch">
            <span>Claro/Oscuro</span>
            <input id="themeToggle" type="checkbox" aria-label="Cambiar tema" />
          </div>

          <div class="btnrow">
            <button id="exportBtn" class="btn btn--ghost">Exportar</button>
            <label class="btn btn--ghost" style="display:inline-flex; gap:8px; align-items:center; cursor:pointer;">
              Importar
              <input id="importFile" type="file" accept="application/json" style="display:none" />
            </label>
            <button id="resetBtn" class="btn btn--danger">Reset</button>
          </div>
        </div>
      </header>

      <main class="container">
        <section class="section">
          <div class="section__head">
            <h2>Avance</h2>
          </div>
          <div id="stats" class="stats"></div>
        </section>

        <section class="section">
          <div class="section__head">
            <h2>Semestres</h2>
          </div>

          <div class="boardHead">
            <div class="boardHead__col">Administración</div>
            <div class="boardHead__col">En Común</div>
            <div class="boardHead__col">Contaduría</div>
          </div>

          <div id="semesterBoard" class="semesterBoard"></div>
        </section>
      </main>
    `;
  }

  const modal = document.getElementById("courseModal");
  if (modal) {
    modal.innerHTML = `
      <div class="modal__card">
        <div class="modal__head">
          <div>
            <h3 id="modalTitle"></h3>
            <p id="modalSubtitle" class="kpiSmall"></p>
          </div>
          <button id="modalClose" class="iconbtn" aria-label="Cerrar">✕</button>
        </div>

        <div id="modalBody" class="modal__body"></div>
        <div class="modal__foot">
          <button id="modalOk" class="btn">Cerrar</button>
        </div>
      </div>
    `;
  }
}

function bindUI() {
  document.querySelectorAll(".segmented__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".segmented__btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      ctx.ui.filter = btn.dataset.filter || "all";
      debounce(() => rerenderBoard(), 80)();
    });
  });

  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", () => {
    ctx.ui.search = searchInput.value.trim().toLowerCase();
    debounce(() => rerenderBoard(), 220)();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(ctx.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progreso_ies_monitor.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exportado.");
  });

  document.getElementById("importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const incoming = JSON.parse(txt);
      if (!incoming || incoming.version !== 1) throw new Error("JSON inválido (version != 1)");

      ctx.state = incoming;
      saveState(STORAGE_KEY, ctx.state);
      toast("Progreso importado.");
      rerenderAll();
    } catch (err) {
      console.error(err);
      toast("No se pudo importar. Revisa el archivo.");
    } finally {
      e.target.value = "";
    }
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    ctx.state = createDefaultState(ctx.derived);
    saveState(STORAGE_KEY, ctx.state);
    toast("Progreso reiniciado.");
    rerenderAll();
  });
}

function rerenderAll() {
  rerenderStats();
  rerenderBoard();
}

function rerenderStats() {
  renderStats(ctx);
}

function rerenderBoard() {
  renderSemesterBoard(ctx, {
    onStateChanged: () => {
      saveState(STORAGE_KEY, ctx.state);
      rerenderAll();
    },
    onToast: toast,
    onSoftRerenderBoard: () => rerenderBoard(),
    onHardRerenderAll: () => rerenderAll(),
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(console.warn);
}

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

function initTheme({ themeKey, onThemeChanged }) {
  const saved = localStorage.getItem(themeKey) || "light";
  setTheme(saved);

  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  toggle.checked = saved === "dark";
  toggle.addEventListener("change", () => {
    const theme = toggle.checked ? "dark" : "light";
    setTheme(theme);
    localStorage.setItem(themeKey, theme);
    if (typeof onThemeChanged === "function") onThemeChanged(theme);
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function kvBlock(rows) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<div class="kv"></div>`;
  const kv = div.querySelector(".kv");

  for (const [k, v] of rows) {
    const kEl = document.createElement("div");
    kEl.className = "k";
    kEl.textContent = k;

    const vEl = document.createElement("div");
    vEl.className = "v";
    vEl.textContent = v;

    kv.appendChild(kEl);
    kv.appendChild(vEl);
  }
  return div;
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}: ${res.status}`);
  return await res.json();
}

function buildDerived(curr) {
  const courseCatalog = curr.course_catalog ?? {};
  const plans = curr.program_plans ?? {};
  const reqs = curr.program_requisites ?? {};

  const adminPlan = plans[PROGRAMS.ADMIN];
  const contaPlan = plans[PROGRAMS.CONTA];

  if (!adminPlan || !contaPlan) {
    throw new Error("Faltan program_plans para ADMINISTRACION_EMPRESAS o CONTADURIA_PUBLICA");
  }

  const flattenPlan = (plan) => {
    const out = [];
    const semesters = plan.semesters || {};
    for (const sem of Object.keys(semesters)) {
      for (const item of semesters[sem]) out.push({ sem, ...item });
    }
    return out;
  };

  const adminFlat = flattenPlan(adminPlan);
  const contaFlat = flattenPlan(contaPlan);

  const adminSet = new Set(adminFlat.map(x => x.course_id));
  const contaSet = new Set(contaFlat.map(x => x.course_id));

  const commonSet = new Set([...adminSet].filter(id => contaSet.has(id)));
  const adminOnlySet = new Set([...adminSet].filter(id => !commonSet.has(id)));
  const contaOnlySet = new Set([...contaSet].filter(id => !commonSet.has(id)));

  const adminCredits = {};
  for (const x of adminFlat) adminCredits[x.course_id] = x.credits;

  const contaCredits = {};
  for (const x of contaFlat) contaCredits[x.course_id] = x.credits;

  const adminDefaultSem = {};
  for (const x of adminFlat) adminDefaultSem[x.course_id] = x.sem;

  const contaDefaultSem = {};
  for (const x of contaFlat) contaDefaultSem[x.course_id] = x.sem;

  const reqIndex = {
    [PROGRAMS.ADMIN]: indexRules(reqs[PROGRAMS.ADMIN]?.rules ?? []),
    [PROGRAMS.CONTA]: indexRules(reqs[PROGRAMS.CONTA]?.rules ?? []),
  };

  const coreqAdj = {
    [PROGRAMS.ADMIN]: buildCoreqAdj(reqs[PROGRAMS.ADMIN]?.rules ?? []),
    [PROGRAMS.CONTA]: buildCoreqAdj(reqs[PROGRAMS.CONTA]?.rules ?? []),
  };

  return {
    courseCatalog,
    plans,
    reqs,

    adminFlat,
    contaFlat,

    adminSet,
    contaSet,

    commonSet,
    adminOnlySet,
    contaOnlySet,

    adminCredits,
    contaCredits,

    adminDefaultSem,
    contaDefaultSem,

    reqIndex,
    coreqAdj,
  };
}
function indexRules(rules) {
  const map = new Map();
  for (const r of rules) map.set(r.target, r);
  return map;
}

function buildCoreqAdj(rules) {
  const adj = new Map();
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };

  for (const r of rules) {
    const target = r.target;
    const coreq = r.coreq || {};
    const all = coreq.allOf || [];
    const any = coreq.anyOf || [];
    for (const c of [...all, ...any]) addEdge(target, c);
  }

  return adj;
}

function loadState(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(storageKey, state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function createDefaultState(derived) {
  const commonPlacement = {};
  for (const cid of derived.commonSet) {
    const a = derived.adminDefaultSem[cid];
    const c = derived.contaDefaultSem[cid];
    commonPlacement[cid] = minSem(a, c);
  }

  const adminPlacement = {};
  for (const cid of derived.adminOnlySet) adminPlacement[cid] = derived.adminDefaultSem[cid] ?? "1";

  const contaPlacement = {};
  for (const cid of derived.contaOnlySet) contaPlacement[cid] = derived.contaDefaultSem[cid] ?? "1";

  return {
    version: 1,
    courseStatus: {},
    customNames: {},
    placements: {
      common: commonPlacement,
      [PROGRAMS.ADMIN]: adminPlacement,
      [PROGRAMS.CONTA]: contaPlacement,
    }
  };
}

function minSem(a, b) {
  const ai = parseInt(a ?? "99", 10);
  const bi = parseInt(b ?? "99", 10);
  const m = Math.min(ai, bi);
  return String(isFinite(m) ? m : 1);
}

function kindOfCourse(ctx, courseId) {
  if (ctx.derived.commonSet.has(courseId)) return "common";
  if (ctx.derived.adminOnlySet.has(courseId)) return "adminOnly";
  if (ctx.derived.contaOnlySet.has(courseId)) return "contaOnly";
  return "common";
}

function getPlannedSemester(ctx, courseId) {
  if (ctx.derived.commonSet.has(courseId)) return ctx.state.placements.common?.[courseId] ?? "1";
  if (ctx.derived.adminOnlySet.has(courseId)) return ctx.state.placements[PROGRAMS.ADMIN]?.[courseId] ?? "1";
  if (ctx.derived.contaOnlySet.has(courseId)) return ctx.state.placements[PROGRAMS.CONTA]?.[courseId] ?? "1";
  return "1";
}

function setPlannedSemester(ctx, courseId, sem) {
  if (ctx.derived.commonSet.has(courseId)) { ctx.state.placements.common[courseId] = sem; return; }
  if (ctx.derived.adminOnlySet.has(courseId)) { ctx.state.placements[PROGRAMS.ADMIN][courseId] = sem; return; }
  if (ctx.derived.contaOnlySet.has(courseId)) { ctx.state.placements[PROGRAMS.CONTA][courseId] = sem; return; }
}

function coreqComponent(ctx, programId, start) {
  const adj = ctx.derived.coreqAdj[programId];
  if (!adj || !adj.has(start)) return [];
  const seen = new Set([start]);
  const q = [start];

  while (q.length) {
    const cur = q.shift();
    const neigh = adj.get(cur) || [];
    for (const n of neigh) {
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return [...seen];
}

function moveWithCoreqs(ctx, courseId, newSem, kind) {
  const toMove = new Set([courseId]);

  if (kind === "adminOnly") {
    for (const x of coreqComponent(ctx, PROGRAMS.ADMIN, courseId)) toMove.add(x);
  } else if (kind === "contaOnly") {
    for (const x of coreqComponent(ctx, PROGRAMS.CONTA, courseId)) toMove.add(x);
  } else {
    for (const x of coreqComponent(ctx, PROGRAMS.ADMIN, courseId)) toMove.add(x);
    for (const x of coreqComponent(ctx, PROGRAMS.CONTA, courseId)) toMove.add(x);
  }

  for (const cid of toMove) setPlannedSemester(ctx, cid, newSem);
  return [...toMove].filter(x => x !== courseId);
}

function getCreditsValueForUI(ctx, courseId, kind) {
  if (kind === "adminOnly") return ctx.derived.adminCredits[courseId] ?? 0;
  if (kind === "contaOnly") return ctx.derived.contaCredits[courseId] ?? 0;

  const a = ctx.derived.adminCredits[courseId] ?? 0;
  const c = ctx.derived.contaCredits[courseId] ?? 0;
  return Math.min(a, c);
}

function getCreditsDisplay(ctx, courseId, kind) {
  if (kind === "adminOnly") return `${ctx.derived.adminCredits[courseId] ?? 0} cr`;
  if (kind === "contaOnly") return `${ctx.derived.contaCredits[courseId] ?? 0} cr`;

  const a = ctx.derived.adminCredits[courseId] ?? 0;
  const c = ctx.derived.contaCredits[courseId] ?? 0;
  return `${Math.min(a, c)} cr`;
}

function isSatisfied(state, courseId) {
  const s = state.courseStatus?.[courseId] ?? null;
  return s === "completed" || s === "homologated";
}

function computeGate(ctx, programId, courseId, kind) {
  if (isSatisfied(ctx.state, courseId)) {
    return { locked: false, missing: { prereq: [], coreq: [] }, rule: null };
  }

  const rule = ctx.derived.reqIndex[programId].get(courseId);
  if (!rule) return { locked: false, missing: { prereq: [], coreq: [] }, rule: null };

  const prereqMissing = evalRequirementGroup(ctx, rule.prereq, courseId, programId, true);
  const coreqMissing = evalRequirementGroup(ctx, rule.coreq, courseId, programId, false);

  const locked = prereqMissing.length > 0 || coreqMissing.length > 0;
  return { locked, missing: { prereq: prereqMissing, coreq: coreqMissing }, rule };
}

function evalRequirementGroup(ctx, group, targetCourseId, programId, isPrereq) {
  const g = group || {};
  const allOf = Array.isArray(g.allOf) ? g.allOf : [];
  const anyOf = Array.isArray(g.anyOf) ? g.anyOf : [];
  const missing = [];

  for (const cid of allOf) {
    if (!satisfiesReq(ctx, cid, targetCourseId, programId, isPrereq)) {
      missing.push({ type: "allOf", course_id: cid });
    }
  }

  if (anyOf.length > 0) {
    const ok = anyOf.some(cid => satisfiesReq(ctx, cid, targetCourseId, programId, isPrereq));
    if (!ok) {
      for (const cid of anyOf) missing.push({ type: "anyOf", course_id: cid });
    }
  }

  return missing;
}

function satisfiesReq(ctx, reqCourseId, targetCourseId, programId, isPrereq) {
  if (isPrereq) return isSatisfied(ctx.state, reqCourseId);

  if (isSatisfied(ctx.state, reqCourseId)) return true;

  const sTarget = getPlannedSemester(ctx, targetCourseId);
  const sReq = getPlannedSemester(ctx, reqCourseId);
  return sTarget === sReq;
}

function buildLockLabel(kind, lockedAdmin, lockedConta) {
  if (kind === "adminOnly") return lockedAdmin ? "🔒" : "";
  if (kind === "contaOnly") return lockedConta ? "🔒" : "";

  if (lockedAdmin && lockedConta) return "🔒";
  if (lockedAdmin && !lockedConta) return "Bloqueada Administración";
  if (!lockedAdmin && lockedConta) return "Bloqueada Contaduría";
  return "";
}

function getCourseAlias(ctx, courseId) {
  const custom = ctx.state.customNames?.[courseId];
  const alias = custom?.trim();
  return alias ? alias : "";
}

function getCourseOfficialName(ctx, courseId) {
  return ctx.derived.courseCatalog[courseId]?.name ?? courseId;
}

function getCourseName(ctx, courseId) {
  return getCourseAlias(ctx, courseId) || getCourseOfficialName(ctx, courseId);
}

function getCourseSearchStrings(ctx, courseId) {
  const c = ctx.derived.courseCatalog[courseId];
  const official = getCourseOfficialName(ctx, courseId);
  const alias = getCourseAlias(ctx, courseId);
  const code = c?.code ?? "";
  const extraAliases = Array.isArray(c?.aliases) ? c.aliases.join(" ") : "";
  return [official, alias, code, extraAliases].filter(Boolean);
}
let dragInProgress = false;

let multi = {
  activeSemester: null,
  action: "completed",
  selectedCourseIds: new Set(),
};

function renderSemesterBoard(ctx, hooks) {
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

  const row = document.createElement("div");
  row.className = "semesterBanner__row";

  const left = document.createElement("div");
  left.className = "semesterBanner__left";

  const title = document.createElement("div");
  title.textContent = `SEMESTRE ${sem}`;
  title.className = "semesterBanner__title";

  const center = document.createElement("div");
  center.className = "semesterBanner__center";
  center.textContent = `${pending} créditos pendientes`;

  const right = document.createElement("div");
  right.className = "semesterBanner__right";

  left.appendChild(title);

  if (!isActive) {
    const countVisible = countCoursesInSemester(ctx, sem);

    const multiBtn = document.createElement("button");
    multiBtn.type = "button";
    multiBtn.className = "btn btn--ghost btn--banner";
    multiBtn.textContent = `Multi (${countVisible})`;
    multiBtn.addEventListener("click", () => {
      multi.activeSemester = sem;
      multi.selectedCourseIds = new Set();
      multi.action = "completed";
      hooks.onHardRerenderAll();
      hooks.onToast("Selecciona materias y confirma con OK.");
    });

    right.appendChild(multiBtn);
  } else {
    const label = document.createElement("span");
    label.textContent = "Multi:";
    label.className = "semesterBanner__label";

    const select = document.createElement("select");
    select.className = "semesterBanner__select";
    select.innerHTML = `
      <option value="completed">Marcar completadas</option>
      <option value="homologated">Marcar homologadas</option>
    `;
    select.value = multi.action;
    select.addEventListener("change", () => { multi.action = select.value; });

    const selectedCount = document.createElement("span");
    selectedCount.textContent = `Seleccionadas: ${multi.selectedCourseIds.size}`;
    selectedCount.className = "semesterBanner__count";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost btn--banner";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", () => {
      multi.activeSemester = null;
      multi.selectedCourseIds = new Set();
      hooks.onHardRerenderAll();
      hooks.onToast("Multi cancelado.");
    });

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn btn--banner";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => applyMulti(ctx, sem, hooks));

    right.appendChild(label);
    right.appendChild(select);
    right.appendChild(selectedCount);
    right.appendChild(cancelBtn);
    right.appendChild(okBtn);
  }

  row.appendChild(left);
  row.appendChild(center);
  row.appendChild(right);
  banner.appendChild(row);

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

function matchesFilter(ctx, courseId) {
  const c = ctx.derived.courseCatalog[courseId];
  const isElective = c?.type === "elective_slot";

  if (ctx.ui.filter === "all") return true;
  if (ctx.ui.filter === "mandatory") return !isElective;
  if (ctx.ui.filter === "elective") return isElective;
  return true;
}

function matchesSearch(ctx, courseId) {
  if (!ctx.ui.search) return true;
  const q = ctx.ui.search;
  const haystack = getCourseSearchStrings(ctx, courseId)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
function makeCourseCard(ctx, courseId, kind, sem, hooks) {
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

function wireModalShell() {
  const modal = document.getElementById("courseModal");
  const closeBtn = document.getElementById("modalClose");
  const okBtn = document.getElementById("modalOk");

  closeBtn?.addEventListener("click", () => modal.close());
  okBtn?.addEventListener("click", () => modal.close());

  window.__IES_OPEN_MODAL__ = (ctx, courseId, kind, hooks) => openCourseModal(ctx, courseId, kind, hooks);
}

function openCourseModal(ctx, courseId, kind, hooks) {
  const modal = document.getElementById("courseModal");
  const title = document.getElementById("modalTitle");
  const subtitle = document.getElementById("modalSubtitle");
  const body = document.getElementById("modalBody");

  const name = getCourseName(ctx, courseId);
  const alias = getCourseAlias(ctx, courseId);
  const officialName = getCourseOfficialName(ctx, courseId);
  const code = ctx.derived.courseCatalog[courseId]?.code ?? "—";
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

  const detailRows = [
    ["Créditos", creditLine],
  ];
  if (alias && alias !== officialName) {
    detailRows.push(["Nombre oficial", officialName]);
  }
  detailRows.push(["Estado", status === "completed" ? "Completada" : status === "homologated" ? "Homologada" : "Pendiente"]);

  body.appendChild(kvBlock(detailRows));
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

    <div style="margin-top:12px" class="kv">
      <div class="k">Alias visible</div>
      <div class="v">
        <input id="aliasName" type="text" placeholder="Nombre alterno..." />
      </div>
      <div class="k"></div>
      <div class="v" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn--ghost" id="saveAliasName">Guardar alias</button>
        <button type="button" class="btn btn--ghost" id="clearAliasName">Limpiar alias</button>
      </div>
    </div>`;
  body.appendChild(actions);

  const moveSelect = actions.querySelector("#moveSelect");
  moveSelect.value = sem;

  const aliasInput = actions.querySelector("#aliasName");
  aliasInput.value = alias;
  actions.querySelector("#saveAliasName").addEventListener("click", () => {
    const v = aliasInput.value.trim();
    if (v) ctx.state.customNames[courseId] = v;
    else delete ctx.state.customNames[courseId];
    hooks.onStateChanged();
    hooks.onToast(v ? "Alias guardado." : "Alias eliminado.");
    modal.close();
  });
  actions.querySelector("#clearAliasName").addEventListener("click", () => {
    delete ctx.state.customNames[courseId];
    hooks.onStateChanged();
    hooks.onToast("Alias eliminado.");
    modal.close();
  });

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
let charts = { admin: null, conta: null, doble: null };

function destroyCharts() {
  for (const k of Object.keys(charts)) {
    if (charts[k]) {
      try { charts[k].destroy(); } catch {}
      charts[k] = null;
    }
  }
}

function createMinimalDonut(el, pct) {
  const restColor =
    getComputedStyle(document.documentElement).getPropertyValue("--chart-rest").trim() ||
    "rgba(0,0,0,.08)";

  return new ApexCharts(el, {
    chart: {
      type: "donut",
      height: 96,
      width: 96,
      animations: { enabled: true },
      sparkline: { enabled: true }
    },
    series: [pct, 100 - pct],
    colors: ["var(--accent-green)", restColor],
    stroke: { width: 0 },
    legend: { show: false },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: { size: "78%", labels: { show: false } }
      }
    },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } }
    }
  });
}

function computeProgressDetailed(ctx, programId) {
  const plan = ctx.derived.plans[programId];
  const flat = programId === PROGRAMS.ADMIN ? ctx.derived.adminFlat : ctx.derived.contaFlat;

  let completedCredits = 0;
  let homologatedCredits = 0;
  let completedCourses = 0;
  let homologatedCourses = 0;

  for (const item of flat) {
    const cid = item.course_id;
    const cr = item.credits;
    const status = ctx.state.courseStatus[cid] ?? null;

    if (status === "completed") { completedCredits += cr; completedCourses++; }
    if (status === "homologated") { homologatedCredits += cr; homologatedCourses++; }
  }

  const totalCredits = completedCredits + homologatedCredits;
  const planTotal = plan.total_credits ?? 0;
  const pct = planTotal > 0 ? Math.round((totalCredits / planTotal) * 100) : 0;

  return { planTotal, pct, completedCredits, homologatedCredits, totalCredits, completedCourses, homologatedCourses };
}

function computeUniqueDoubleProgress(ctx) {
  let adminOnlyCredits = 0;
  let contaOnlyCredits = 0;
  let commonMinCredits = 0;
  let doneUniqueCredits = 0;

  for (const cid of ctx.derived.adminOnlySet) {
    const cr = ctx.derived.adminCredits[cid] ?? 0;
    adminOnlyCredits += cr;
    if (isSatisfied(ctx.state, cid)) doneUniqueCredits += cr;
  }

  for (const cid of ctx.derived.contaOnlySet) {
    const cr = ctx.derived.contaCredits[cid] ?? 0;
    contaOnlyCredits += cr;
    if (isSatisfied(ctx.state, cid)) doneUniqueCredits += cr;
  }

  for (const cid of ctx.derived.commonSet) {
    const a = ctx.derived.adminCredits[cid] ?? 0;
    const c = ctx.derived.contaCredits[cid] ?? 0;
    const m = Math.min(a, c);
    commonMinCredits += m;
    if (isSatisfied(ctx.state, cid)) doneUniqueCredits += m;
  }

  return { totalUniqueCredits: adminOnlyCredits + contaOnlyCredits + commonMinCredits, doneUniqueCredits };
}

function statsCard(title, p, key) {
  const card = document.createElement("div");
  card.className = "card";

  const chartId = `chart-${key}`;
  const pct = Math.max(0, Math.min(100, p.pct));
  const falt = 100 - pct;

  card.innerHTML = `
    <h3>${title}</h3>
    <div class="pieRow" style="margin-top:10px">
      <div class="chartWrap">
        <div id="${chartId}"></div>
        <div class="chartCenter">
          <div class="a">${pct}%</div>
          <div class="b">Falta ${falt}%</div>
        </div>
      </div>
      <div class="kpi">
        <div><b>${p.totalCredits}</b> / ${p.planTotal} créditos</div>
        <div>Completadas: <b>${p.completedCredits}</b></div>
        <div>Homologadas: <b>${p.homologatedCredits}</b></div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const el = card.querySelector(`#${chartId}`);
    charts[key] = createMinimalDonut(el, pct);
    charts[key].render();
  });

  return card;
}

function doubleCard(d) {
  const card = document.createElement("div");
  card.className = "card";

  const pct = d.totalUniqueCredits > 0 ? Math.round((d.doneUniqueCredits / d.totalUniqueCredits) * 100) : 0;
  const safe = Math.max(0, Math.min(100, pct));
  const falt = 100 - safe;

  const chartId = "chart-doble";

  card.innerHTML = `
    <h3>Doble (único)</h3>
    <div class="pieRow" style="margin-top:10px">
      <div class="chartWrap">
        <div id="${chartId}"></div>
        <div class="chartCenter">
          <div class="a">${safe}%</div>
          <div class="b">Falta ${falt}%</div>
        </div>
      </div>
      <div class="kpi">
        <div><b>${d.doneUniqueCredits}</b> / ${d.totalUniqueCredits} créditos</div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const el = card.querySelector(`#${chartId}`);
    charts.doble = createMinimalDonut(el, safe);
    charts.doble.render();
  });

  return card;
}

function renderStats(ctx) {
  destroyCharts();

  const el = document.getElementById("stats");
  el.innerHTML = "";

  const admin = computeProgressDetailed(ctx, PROGRAMS.ADMIN);
  const conta = computeProgressDetailed(ctx, PROGRAMS.CONTA);
  const doble = computeUniqueDoubleProgress(ctx);

  el.appendChild(statsCard("Administración de Empresas", admin, "admin"));
  el.appendChild(statsCard("Contaduría Pública", conta, "conta"));
  el.appendChild(doubleCard(doble));
}
