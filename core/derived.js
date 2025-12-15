export const PROGRAMS = {
  ADMIN: "ADMINISTRACION_EMPRESAS",
  CONTA: "CONTADURIA_PUBLICA",
};

export async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path}: ${res.status}`);
  return await res.json();
}

export function buildDerived(curr) {
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
