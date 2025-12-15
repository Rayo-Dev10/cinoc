import { PROGRAMS } from "../core/derived.js";
import { isSatisfied } from "../core/gating.js";

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

export function renderStats(ctx) {
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
