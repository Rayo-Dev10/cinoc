import { PROGRAMS } from "./derived.js";

export function kindOfCourse(ctx, courseId) {
  if (ctx.derived.commonSet.has(courseId)) return "common";
  if (ctx.derived.adminOnlySet.has(courseId)) return "adminOnly";
  if (ctx.derived.contaOnlySet.has(courseId)) return "contaOnly";
  return "common";
}

export function getPlannedSemester(ctx, courseId) {
  if (ctx.derived.commonSet.has(courseId)) return ctx.state.placements.common?.[courseId] ?? "1";
  if (ctx.derived.adminOnlySet.has(courseId)) return ctx.state.placements[PROGRAMS.ADMIN]?.[courseId] ?? "1";
  if (ctx.derived.contaOnlySet.has(courseId)) return ctx.state.placements[PROGRAMS.CONTA]?.[courseId] ?? "1";
  return "1";
}

export function setPlannedSemester(ctx, courseId, sem) {
  if (ctx.derived.commonSet.has(courseId)) { ctx.state.placements.common[courseId] = sem; return; }
  if (ctx.derived.adminOnlySet.has(courseId)) { ctx.state.placements[PROGRAMS.ADMIN][courseId] = sem; return; }
  if (ctx.derived.contaOnlySet.has(courseId)) { ctx.state.placements[PROGRAMS.CONTA][courseId] = sem; return; }
}

export function coreqComponent(ctx, programId, start) {
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

export function moveWithCoreqs(ctx, courseId, newSem, kind) {
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

export function getCreditsValueForUI(ctx, courseId, kind) {
  if (kind === "adminOnly") return ctx.derived.adminCredits[courseId] ?? 0;
  if (kind === "contaOnly") return ctx.derived.contaCredits[courseId] ?? 0;

  const a = ctx.derived.adminCredits[courseId] ?? 0;
  const c = ctx.derived.contaCredits[courseId] ?? 0;
  return Math.min(a, c);
}

export function getCreditsDisplay(ctx, courseId, kind) {
  if (kind === "adminOnly") return `${ctx.derived.adminCredits[courseId] ?? 0} cr`;
  if (kind === "contaOnly") return `${ctx.derived.contaCredits[courseId] ?? 0} cr`;

  const a = ctx.derived.adminCredits[courseId] ?? 0;
  const c = ctx.derived.contaCredits[courseId] ?? 0;
  return `${Math.min(a, c)} cr`;
}
