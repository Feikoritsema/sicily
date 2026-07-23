import { localStore } from "../local-store.js";
import { KNOWN_NAMES } from "../constants.js";
import { escapeHtml } from "../util.js";
import { peopleStore } from "../people.js";
import { tripSettingsStore } from "../trip-settings.js";

let listenersAttached = false;

export async function render(container, { onNamePicked } = {}) {
  const currentName = localStore.getProfileName();

  if (!currentName) {
    container.innerHTML = `<section class="view-empty"><h1>Group Info</h1>${renderNamePicker()}</section>`;
    wireNamePicker(container, onNamePicked);
    return;
  }

  container.innerHTML = `<section class="view-empty"><h1>Group Info</h1><p class="view-empty__hint">Loading…</p></section>`;

  await peopleStore.load();
  await tripSettingsStore.load();

  container.innerHTML = `
    <section class="lists">
      <h1>Group Info</h1>
      <p>Signed in as <strong>${escapeHtml(currentName)}</strong>.</p>
      <div class="my-info-section"></div>
      <div class="others-section"></div>
      <div class="grocery-section"></div>
    </section>
  `;

  if (!listenersAttached) {
    listenersAttached = true;
    const refreshOthers = () => {
      const section = container.querySelector(".others-section");
      if (section) renderOthers(section, currentName);
    };
    peopleStore.onChange(refreshOthers);
    tripSettingsStore.onChange(() => {
      const section = container.querySelector(".grocery-section");
      if (section) renderGrocery(section);
    });
  }

  renderMyInfo(container.querySelector(".my-info-section"), currentName);
  renderOthers(container.querySelector(".others-section"), currentName);
  renderGrocery(container.querySelector(".grocery-section"));
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

function wireNamePicker(container, onNamePicked) {
  const form = container.querySelector("#name-picker-form");
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

function toDatetimeLocal(value) {
  if (!value) return "";
  return value.slice(0, 16); // "2026-09-25T14:30:00+00:00" -> "2026-09-25T14:30"
}

function renderMyInfo(section, name) {
  const me = peopleStore.get(name) || { name };

  section.innerHTML = `
    <h2 class="lists-heading">My Info</h2>
    <form class="my-info-form">
      <label class="my-info-field">
        Dietary restrictions
        <input type="text" name="dietary_restrictions" value="${escapeHtml(me.dietary_restrictions || "")}" placeholder="e.g. vegetarian, shellfish allergy" />
      </label>
      <label class="my-info-field">
        Flight arrival
        <input type="datetime-local" name="flight_arrival" value="${toDatetimeLocal(me.flight_arrival)}" />
      </label>
      <label class="my-info-field">
        Flight departure
        <input type="datetime-local" name="flight_departure" value="${toDatetimeLocal(me.flight_departure)}" />
      </label>
      <label class="my-info-field">
        Birthday / anniversary during the trip
        <input type="text" name="special_occasion" value="${escapeHtml(me.special_occasion || "")}" placeholder="e.g. my birthday, Sept 28" />
      </label>
      <label class="my-info-checkbox">
        <input type="checkbox" name="comfortable_night_driving" ${me.comfortable_night_driving ? "checked" : ""} />
        Comfortable driving at night
      </label>
      <label class="my-info-field">
        Insurance info (feeds the Emergency card)
        <input type="text" name="insurance_info" value="${escapeHtml(me.insurance_info || "")}" placeholder="Provider + policy/assistance line" />
      </label>
      <button type="submit">Save</button>
    </form>
  `;

  const form = section.querySelector(".my-info-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    peopleStore.save({
      name,
      dietary_restrictions: data.get("dietary_restrictions").trim() || null,
      flight_arrival: data.get("flight_arrival") || null,
      flight_departure: data.get("flight_departure") || null,
      special_occasion: data.get("special_occasion").trim() || null,
      comfortable_night_driving: data.get("comfortable_night_driving") === "on",
      insurance_info: data.get("insurance_info").trim() || null,
    });
  });
}

function renderOthers(section, myName) {
  const others = peopleStore.all().filter((p) => p.name !== myName);

  const rows = others
    .map(
      (p) => `
      <li class="packing-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          ${p.dietary_restrictions ? `<p class="assignment-note">🍽 ${escapeHtml(p.dietary_restrictions)}</p>` : ""}
          ${p.special_occasion ? `<p class="assignment-note">🎉 ${escapeHtml(p.special_occasion)}</p>` : ""}
          ${p.comfortable_night_driving ? `<p class="assignment-note">🚗 Comfortable driving at night</p>` : ""}
        </div>
      </li>`
    )
    .join("");

  section.innerHTML = `
    <h2 class="lists-heading">Everyone Else</h2>
    <ul class="packing-list">${rows || `<li class="view-empty__hint">Nobody else has filled in their info yet.</li>`}</ul>
  `;
}

function renderGrocery(section) {
  const current = tripSettingsStore.get().grocery_strategy;
  const options = [
    ["stock", "Stock the villa"],
    ["eat_out", "Eat out every meal"],
    ["mixed", "Mixed"],
  ];

  section.innerHTML = `
    <h2 class="lists-heading">Grocery Strategy (trip-wide)</h2>
    <div class="grocery-options">
      ${options
        .map(
          ([value, label]) => `
        <label class="grocery-option">
          <input type="radio" name="grocery_strategy" value="${value}" ${current === value ? "checked" : ""} />
          ${label}
        </label>`
        )
        .join("")}
    </div>
  `;

  section.querySelectorAll('input[name="grocery_strategy"]').forEach((input) => {
    input.addEventListener("change", () => tripSettingsStore.setGroceryStrategy(input.value));
  });
}
