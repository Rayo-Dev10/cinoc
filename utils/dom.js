export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

export function kvBlock(rows) {
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
