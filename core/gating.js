import { PROGRAMS } from "./derived.js";
import { getPlannedSemester } from "./placement.js";

export function isSatisfied(state, courseId) {
  const s = state.courseStatus?.[courseId] ?? null;
  return s === "completed" || s === "homologated";
}

export function computeGate(ctx, programId, courseId, kind) {
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

  // coreq: satisfecha o planificada en el mismo semestre
  if (isSatisfied(ctx.state, reqCourseId)) return true;

  const sTarget = getPlannedSemester(ctx, targetCourseId);
  const sReq = getPlannedSemester(ctx, reqCourseId);
  return sTarget === sReq;
}

export function buildLockLabel(kind, lockedAdmin, lockedConta) {
  // Exclusivas: solo candado
  if (kind === "adminOnly") return lockedAdmin ? "🔒" : "";
  if (kind === "contaOnly") return lockedConta ? "🔒" : "";

  // Comunes: detallado
  if (lockedAdmin && lockedConta) return "🔒";
  if (lockedAdmin && !lockedConta) return "Bloqueada Administración";
  if (!lockedAdmin && lockedConta) return "Bloqueada Contaduría";
  return "";
}

export function programIdForKind(kind) {
  if (kind === "adminOnly") return PROGRAMS.ADMIN;
  if (kind === "contaOnly") return PROGRAMS.CONTA;
  return null;
}
