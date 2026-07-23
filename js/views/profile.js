import { localStore } from "../local-store.js";
import { KNOWN_NAMES } from "../constants.js";

export function render(container, { onNamePicked } = {}) {
  const currentName = localStore.getProfileName();

  container.innerHTML = `
    <section class="view-empty">
      <h1>Group Info</h1>
      ${currentName ? `<p>Signed in as <strong>${escapeHtml(currentName)}</strong>.</p>` : renderNamePicker()}
      <p class="view-empty__hint">Dietary restrictions, flights, driving comfort, and insurance info land here in a later build step (implementation_plan.md §2 item 10).</p>
    </section>
  `;

  const form = container.querySelector("#name-picker-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input[name=name]");
      const picked = input.value.trim();
      if (!picked) return;
      localStore.setProfileName(picked);
      onNamePicked?.(picked);
    });
    form.querySelectorAll("button[data-name]").forEach((btn) => {
      btn.addEventListener("click", () => {
        localStore.setProfileName(btn.dataset.name);
        onNamePicked?.(btn.dataset.name);
      });
    });
  }
}

function renderNamePicker() {
  const buttons = KNOWN_NAMES.map((n) => `<button type="button" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
  return `
    <form id="name-picker-form">
      <p>Pick your name (no password — just for attribution):</p>
      ${buttons ? `<div class="name-picker__list">${buttons}</div>` : ""}
      <input type="text" name="name" placeholder="Type your name" autocomplete="off" />
      <button type="submit">Continue</button>
    </form>
  `;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
