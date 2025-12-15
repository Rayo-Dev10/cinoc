import { debounce } from "./utils/debounce.js";
import { toast } from "./utils/toast.js";
import { initTheme } from "./utils/theme.js";

import { fetchJSON, buildDerived, PROGRAMS } from "./core/derived.js";
import { loadState, saveState, createDefaultState } from "./core/state.js";

import { renderStats } from "./ui/stats.js";
import { renderSemesterBoard } from "./ui/board.js";
import { wireModalShell } from "./ui/modal.js";

const STORAGE_KEY = "ies_monitor_state_v1";
const THEME_KEY = "ies_theme";

const ctx = {
  curriculum: null,
  derived: null,
  state: null,
  ui: {
    filter: "all",   // all | mandatory | elective
    search: "",      // lower
  },
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
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

function bindUI() {
  // Filtros (click = inmediato, pero igual usamos debounce corto)
  document.querySelectorAll(".segmented__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".segmented__btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      ctx.ui.filter = btn.dataset.filter || "all";
      debounce(() => rerenderBoard(), 80)();
    });
  });

  // Search (debounce real: no 6 renders por palabra)
  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", () => {
    ctx.ui.search = searchInput.value.trim().toLowerCase();
    debounce(() => rerenderBoard(), 220)();
  });

  // Export
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

  // Import
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

  // Reset
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
