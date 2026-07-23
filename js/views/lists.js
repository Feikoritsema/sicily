import { escapeHtml } from "../util.js";
import { localStore } from "../local-store.js";
import { sharedItemsStore } from "../shared-items.js";
import { shoppingListStore } from "../shopping-list.js";

const CATEGORY_LABELS = {
  documents_money: "Documents & Money",
  beach_water_gear: "Beach & Water Gear",
  hiking_gear: "Hiking Gear",
  clothing: "Clothing",
  health_toiletries: "Health & Toiletries",
  electronics: "Electronics",
  other: "Other",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

const SOURCE_LABEL = { bring: "Bring", buy_on_arrival: "Buy on arrival" };

const SUBTABS = [
  ["packing", "🎒 Packing"],
  ["shared", "🤝 Shared"],
  ["shopping", "🛒 Shopping"],
];

// The day before the flight out (per Feiko: "the 24th, when we leave") is
// the natural cutover from packing-prep mode to trip mode — Shopping (villa
// groceries, BBQ nights) becomes the more useful default from that point on.
const SHOPPING_DEFAULT_FROM = "2026-09-24";

let templateCache = null;
let listenersAttached = false;
let activeTab = null; // set on first render only — see pickDefaultTab()

function pickDefaultTab() {
  const today = new Date().toISOString().slice(0, 10);
  return today >= SHOPPING_DEFAULT_FROM ? "shopping" : "packing";
}

export async function render(container) {
  if (activeTab === null) activeTab = pickDefaultTab();
  container.innerHTML = `<section class="view-empty"><h1>Lists</h1><p class="view-empty__hint">Loading…</p></section>`;

  if (!templateCache) {
    const res = await fetch("./data/packing-template.json");
    templateCache = await res.json();
  }
  await sharedItemsStore.load();
  await shoppingListStore.load();
  ensureSeeded();

  const tabButtons = SUBTABS.map(([key, label]) => `<button type="button" class="lists-subtab ${activeTab === key ? "is-active" : ""}" data-tab="${key}">${label}</button>`).join("");

  container.innerHTML = `
    <section class="lists">
      <h1>Lists</h1>
      <div class="lists-subtabs">${tabButtons}</div>
      <div class="packing-section"></div>
      <div class="shared-section"></div>
      <div class="shopping-section"></div>
    </section>
  `;

  container.querySelectorAll(".lists-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render(container);
    });
  });

  showActiveTab(container);

  if (!listenersAttached) {
    listenersAttached = true;
    sharedItemsStore.onChange(() => {
      const section = container.querySelector(".shared-section");
      if (section) renderShared(section);
    });
    shoppingListStore.onChange(() => {
      const section = container.querySelector(".shopping-section");
      if (section) renderShopping(section);
    });
  }

  renderPacking(container.querySelector(".packing-section"));
  renderShared(container.querySelector(".shared-section"));
  renderShopping(container.querySelector(".shopping-section"));
}

function showActiveTab(container) {
  container.querySelector(".packing-section").hidden = activeTab !== "packing";
  container.querySelector(".shared-section").hidden = activeTab !== "shared";
  container.querySelector(".shopping-section").hidden = activeTab !== "shopping";
}

// Seeds localStorage from the bundled template exactly once — a user's
// checked/added items live only in localStorage from that point on (§4.2:
// nobody needs to see someone else's packing progress, one device each).
function ensureSeeded() {
  if (localStore.getPersonalPacking()) return;

  const seeded = {};
  for (const category of CATEGORY_ORDER) {
    const items = templateCache[category] || [];
    seeded[category] = items.map((label, i) => ({ id: `${category}-${i}`, label, checked: false, custom: false }));
  }
  localStore.setPersonalPacking(seeded);
}

function renderPacking(section) {
  const packing = localStore.getPersonalPacking();

  const categoryOptions = CATEGORY_ORDER.map((c) => `<option value="${c}">${escapeHtml(CATEGORY_LABELS[c])}</option>`).join("");

  const categorySections = CATEGORY_ORDER.filter((c) => (packing[c] || []).length > 0)
    .map((category) => {
      const items = packing[category];
      const checkedCount = items.filter((i) => i.checked).length;
      const itemsHtml = items
        .map(
          (item) => `
          <li class="packing-item">
            <label>
              <input type="checkbox" class="packing-check" data-category="${category}" data-id="${item.id}" ${item.checked ? "checked" : ""} />
              ${escapeHtml(item.label)}
            </label>
            ${item.custom ? `<button type="button" class="packing-remove" data-category="${category}" data-id="${item.id}">×</button>` : ""}
          </li>`
        )
        .join("");
      return `
        <details class="practical-item">
          <summary class="lists-heading">${escapeHtml(CATEGORY_LABELS[category])} <span class="chip">${checkedCount}/${items.length}</span></summary>
          <ul class="packing-list">${itemsHtml}</ul>
        </details>`;
    })
    .join("");

  section.innerHTML = `
    <h2 class="lists-heading">Personal Packing</h2>
    <p class="view-empty__hint">Only visible on this device — not synced with the group.</p>

    <form class="packing-add">
      <select class="packing-add-category">${categoryOptions}</select>
      <input type="text" class="packing-add-label" placeholder="Add an item…" />
      <button type="submit">Add</button>
    </form>

    ${categorySections}
  `;

  const form = section.querySelector(".packing-add");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const category = form.querySelector(".packing-add-category").value;
    const input = form.querySelector(".packing-add-label");
    const label = input.value.trim();
    if (!label) return;

    const state = localStore.getPersonalPacking();
    state[category] = state[category] || [];
    state[category].push({ id: crypto.randomUUID(), label, checked: false, custom: true });
    localStore.setPersonalPacking(state);
    renderPacking(section);
  });

  section.querySelectorAll(".packing-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      const state = localStore.getPersonalPacking();
      const item = state[cb.dataset.category]?.find((i) => i.id === cb.dataset.id);
      if (item) item.checked = cb.checked;
      localStore.setPersonalPacking(state);
    });
  });

  section.querySelectorAll(".packing-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const state = localStore.getPersonalPacking();
      state[btn.dataset.category] = (state[btn.dataset.category] || []).filter((i) => i.id !== btn.dataset.id);
      localStore.setPersonalPacking(state);
      renderPacking(section);
    });
  });
}

function renderShared(section) {
  const personName = localStore.getProfileName();
  const items = sharedItemsStore.all();

  const rows = items
    .map((item) => {
      const claimedByMe = item.claimed_by && item.claimed_by === personName;
      const claimAction = item.claimed_by
        ? claimedByMe
          ? `<button type="button" class="shared-claim-btn" data-id="${item.id}" data-action="unclaim">Unclaim</button>`
          : `<span class="chip chip--claimed">✅ Already claimed by ${escapeHtml(item.claimed_by)}</span>`
        : `<button type="button" class="shared-claim-btn" data-id="${item.id}" data-action="claim">Claim</button>`;

      const buyNote =
        item.source === "buy_on_arrival"
          ? `<p class="assignment-note">🛒 Buy on arrival — see Info → Supermarkets (ARD Discount / Sisa).</p>`
          : "";

      return `
        <li class="packing-item shared-item">
          <div>
            <div>${escapeHtml(item.name)} <span class="chip">${SOURCE_LABEL[item.source] || item.source}</span></div>
            ${buyNote}
          </div>
          <div class="shared-item__actions">
            ${claimAction}
            <button type="button" class="list-item-remove" data-id="${item.id}" aria-label="Remove item">🗑</button>
          </div>
        </li>`;
    })
    .join("");

  section.innerHTML = `
    <h2 class="lists-heading">Shared Group Items</h2>
    <p class="view-empty__hint">Anyone can add or claim — visible to the whole group.</p>

    <form class="shared-add">
      <input type="text" class="shared-add-name" placeholder="Add a shared item…" />
      <select class="shared-add-source">
        <option value="bring">Bring</option>
        <option value="buy_on_arrival">Buy on arrival</option>
      </select>
      <button type="submit">Add</button>
    </form>

    <ul class="packing-list">${rows || `<li class="view-empty__hint">Nothing here yet.</li>`}</ul>
  `;

  const form = section.querySelector(".shared-add");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = form.querySelector(".shared-add-name");
    const name = nameInput.value.trim();
    if (!name || !personName) return;
    const source = form.querySelector(".shared-add-source").value;
    sharedItemsStore.add(name, source, personName);
    nameInput.value = "";
  });

  section.querySelectorAll(".shared-claim-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!personName) return;
      sharedItemsStore.setClaimedBy(btn.dataset.id, btn.dataset.action === "claim" ? personName : null);
    });
  });

  section.querySelectorAll(".list-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => sharedItemsStore.remove(btn.dataset.id));
  });
}

function renderShopping(section) {
  const items = shoppingListStore.all();
  const personName = localStore.getProfileName();

  const rows = items
    .map(
      (item) => `
        <li class="packing-item">
          <label>
            <input type="checkbox" class="shopping-check" data-id="${item.id}" ${item.checked ? "checked" : ""} />
            ${escapeHtml(item.item)}${item.quantity ? ` <span class="chip">${escapeHtml(item.quantity)}</span>` : ""}
            ${item.requested_by ? `<span class="view-empty__hint"> — ${escapeHtml(item.requested_by)}</span>` : ""}
          </label>
          <button type="button" class="list-item-remove" data-id="${item.id}" aria-label="Remove item">🗑</button>
        </li>`
    )
    .join("");

  section.innerHTML = `
    <h2 class="lists-heading">Shopping List</h2>

    <form class="shopping-add">
      <input type="text" class="shopping-add-item" placeholder="Add an item…" />
      <input type="text" class="shopping-add-qty" placeholder="Qty" />
      <button type="submit">Add</button>
    </form>

    <ul class="packing-list">${rows || `<li class="view-empty__hint">Nothing on the list yet.</li>`}</ul>

    ${
      items.length
        ? `<div class="shopping-actions">
             <button type="button" class="shopping-clear-checked">Clear checked</button>
             <button type="button" class="shopping-clear-all">Clear all</button>
           </div>`
        : ""
    }
  `;

  const form = section.querySelector(".shopping-add");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const itemInput = form.querySelector(".shopping-add-item");
    const qtyInput = form.querySelector(".shopping-add-qty");
    const item = itemInput.value.trim();
    if (!item) return;
    shoppingListStore.add(item, qtyInput.value.trim(), personName);
    itemInput.value = "";
    qtyInput.value = "";
  });

  section.querySelectorAll(".shopping-check").forEach((cb) => {
    cb.addEventListener("change", () => shoppingListStore.setChecked(cb.dataset.id, cb.checked));
  });

  section.querySelectorAll(".list-item-remove").forEach((btn) => {
    btn.addEventListener("click", () => shoppingListStore.remove(btn.dataset.id));
  });

  section.querySelector(".shopping-clear-checked")?.addEventListener("click", () => shoppingListStore.clearChecked());
  section.querySelector(".shopping-clear-all")?.addEventListener("click", () => shoppingListStore.clearAll());
}
