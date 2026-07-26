import { localStore } from "../local-store.js";
import { KNOWN_NAMES, TRIP_START, TRIP_END, VILLA } from "../constants.js";
import { escapeHtml } from "../util.js";
import { peopleStore } from "../people.js";
import { tripSettingsStore } from "../trip-settings.js";

let listenersAttached = false;

export async function render(container, { onNamePicked, isActive } = {}) {
  const currentName = localStore.getProfileName();

  if (!currentName) {
    container.innerHTML = renderWelcome();
    peopleStore.load(); // warm in background so a returning person can be matched by submit time
    wireNamePicker(container, onNamePicked);
    return;
  }

  container.innerHTML = `<section class="view-empty"><h1>Group Info</h1><p class="view-empty__hint">Loading…</p></section>`;

  await peopleStore.load();
  await tripSettingsStore.load();

  if (isActive && !isActive()) return;

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

function tripDateRange() {
  const fmtShort = { month: "short", day: "numeric" };
  const start = new Date(TRIP_START).toLocaleDateString("en-US", fmtShort);
  const end = new Date(TRIP_END).toLocaleDateString("en-US", { ...fmtShort, year: "numeric" });
  return `${start} – ${end}`;
}

// First-run only (see the `!currentName` branch above) — a warm one-time
// welcome instead of dropping a first-timer straight into a bare name form
// with zero context on what the trip or the app even is.
function renderWelcome() {
  const features = [
    ["🏡", "Today", "Your daily rundown — what's on, what's closed, when siesta hits."],
    ["🗺️", "Explore", "Every place we've found. Vote 👍/👎 so the group knows what's worth it."],
    ["🗺️", "Routes", "Pre-planned bar-hopping walks from the villa — no car needed."],
    ["📅", "Day Plan", "Drag and drop everything into one of the 9 days."],
    ["🧾", "Lists", "Packing, shared gear, shopping — no one forgets the sunscreen."],
    ["ℹ️", "Info", "Villa WiFi codes, emergency numbers, where to find the closest late-night \u00f1oquis."],
  ];

  return `
    <section class="welcome">
      <p class="welcome-kicker">\u{1F1EE}\u{1F1F9} Benvenuto, soldato!</p>
      <h1>Sicily 2026 — La Dolce Vita</h1>
      <p class="welcome-intro">
        You're headed to <strong>${escapeHtml(VILLA.name)}</strong> in Noto — <strong>${tripDateRange()}</strong>.
        Nine days of beaches, baroque towns, granita at 11 pm, and enough arancini to fuel a small army.
        Everything's planned together by the whole group, right here.
      </p>

      <ul class="welcome-features">
        ${features
          .map(
            ([emoji, title, desc]) => `
          <li>
            <span class="welcome-features__icon">${emoji}</span>
            <div><strong>${title}</strong><p>${desc}</p></div>
          </li>`
          )
          .join("")}
      </ul>

      <p class="welcome-note">💬 Every vote, every item you add or check — it's shared with the group instantly. No need to text anyone "hey what do you think about this place?"</p>

      <h2 class="lists-heading">Alright, what's your name, soldier?</h2>
      ${renderNamePicker()}
    </section>
  `;
}

function renderNamePicker() {
  const buttons = KNOWN_NAMES.map((n) => `<button type="button" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
  return `
    <form id="name-picker-form">
      <p class="view-empty__hint">No password fuss — just your name so we know whose votes and ideas are whose.</p>
      ${buttons ? `<div class="name-picker__list">${buttons}</div>` : ""}
      <input type="text" name="name" placeholder="Il tuo nome" autocomplete="off" />
      <button type="submit">Continua →</button>
      <p class="name-picker__error" hidden>Couldn't save your name — your browser's storage may be full or blocked. Try freeing up space, or a different browser/device.</p>
    </form>
  `;
}

// Resumes as an existing person if their name matches case-insensitively/whitespace-
// insensitively (e.g. localStorage got cleared, or a returning device retypes "egbert "
// for "Egbert") — reuses that person's existing row instead of forking a fresh one.
async function resolveReturningName(typed) {
  const normalized = typed.trim().toLowerCase();
  const people = await peopleStore.load();
  const match = people.find((p) => p.name.trim().toLowerCase() === normalized);
  return match ? match.name : typed.trim();
}

function wireNamePicker(container, onNamePicked) {
  const form = container.querySelector("#name-picker-form");
  const errorEl = form.querySelector(".name-picker__error");

  const commit = (resolved) => {
    if (localStore.setProfileName(resolved)) {
      onNamePicked?.(resolved);
    } else {
      errorEl.hidden = false;
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector("input[name=name]");
    const typed = input.value.trim();
    if (!typed) return;
    errorEl.hidden = true;
    const resolved = await resolveReturningName(typed);
    commit(resolved);
  });
  form.querySelectorAll("button[data-name]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      errorEl.hidden = true;
      const resolved = await resolveReturningName(btn.dataset.name);
      commit(resolved);
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
      <p class="my-info-status" aria-live="polite"></p>
    </form>
  `;

  const form = section.querySelector(".my-info-form");
  const status = section.querySelector(".my-info-status");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    status.textContent = "Saving…";
    status.className = "my-info-status";

    const synced = await peopleStore.save({
      name,
      dietary_restrictions: data.get("dietary_restrictions").trim() || null,
      flight_arrival: data.get("flight_arrival") || null,
      flight_departure: data.get("flight_departure") || null,
      special_occasion: data.get("special_occasion").trim() || null,
      comfortable_night_driving: data.get("comfortable_night_driving") === "on",
      insurance_info: data.get("insurance_info").trim() || null,
    });

    status.textContent = synced ? "✅ Saved" : "⏳ Saved offline — will sync once back online";
    status.className = synced ? "my-info-status my-info-status--ok" : "my-info-status my-info-status--pending";
  });
}

function renderOthers(section, myName) {
  const others = peopleStore.all().filter((p) => p.name !== myName);
  // No real auth in this app (implementation_plan.md §6) — restricting the
  // delete affordance to Feiko is a soft guard against casual mis-taps
  // wiping a real trip participant, not a security boundary.
  const canDelete = myName.trim().toLowerCase() === "feiko";

  const rows = others
    .map(
      (p) => `
      <li class="packing-item shared-item">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          ${p.dietary_restrictions ? `<p class="assignment-note">🍽 ${escapeHtml(p.dietary_restrictions)}</p>` : ""}
          ${p.special_occasion ? `<p class="assignment-note">🎉 ${escapeHtml(p.special_occasion)}</p>` : ""}
          ${p.comfortable_night_driving ? `<p class="assignment-note">🚗 Comfortable driving at night</p>` : ""}
        </div>
        ${
          canDelete
            ? `<div class="shared-item__actions"><button type="button" class="person-remove" data-name="${escapeHtml(p.name)}" aria-label="Remove ${escapeHtml(p.name)}">🗑</button></div>`
            : ""
        }
      </li>`
    )
    .join("");

  section.innerHTML = `
    <h2 class="lists-heading">Everyone Else</h2>
    <ul class="packing-list">${rows || `<li class="view-empty__hint">Nobody else has filled in their info yet.</li>`}</ul>
  `;

  section.querySelectorAll(".person-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm(`Remove "${btn.dataset.name}" from the group? This can't be undone.`)) return;
      peopleStore.remove(btn.dataset.name);
    });
  });
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
