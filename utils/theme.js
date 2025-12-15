export function initTheme({ themeKey, onThemeChanged }) {
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

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}
