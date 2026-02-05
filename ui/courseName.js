export function getCourseAlias(ctx, courseId) {
  const custom = ctx.state.customNames?.[courseId];
  const alias = custom?.trim();
  return alias ? alias : "";
}

export function getCourseOfficialName(ctx, courseId) {
  return ctx.derived.courseCatalog[courseId]?.name ?? courseId;
}

export function getCourseName(ctx, courseId) {
  return getCourseAlias(ctx, courseId) || getCourseOfficialName(ctx, courseId);
}

export function getCourseSearchStrings(ctx, courseId) {
  const c = ctx.derived.courseCatalog[courseId];
  const official = getCourseOfficialName(ctx, courseId);
  const alias = getCourseAlias(ctx, courseId);
  const code = c?.code ?? "";
  const extraAliases = Array.isArray(c?.aliases) ? c.aliases.join(" ") : "";
  return [official, alias, code, extraAliases].filter(Boolean);
}
