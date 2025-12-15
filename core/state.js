import { PROGRAMS } from "./derived.js";

export function loadState(storageKey) {
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

export function saveState(storageKey, state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function createDefaultState(derived) {
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
    courseStatus: {},   // completed | homologated | null
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
