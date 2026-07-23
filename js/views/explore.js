import { escapeHtml } from "../util.js";
import { categoryMeta, isClosedToday } from "../categories.js";

let placesCache = null;
const state = { category: "all", topPicksOnly: false, search: "" };

export async function render(container) {
  container.innerHTML = `<section class="explore"><h1>Explore</h1><p class="view-empty__hint">Loading places…</p></section>`;

  if (!placesCache) {
    const res = await fetch("./data/places.json");
    placesCache = await res.json();
  }
  renderChrome(container);
}

// Rebuilds the whole view, including the search input and filter chips.
// Only called on tab entry or when a filter chip is clicked — never on
// every keystroke, so the search input never loses focus mid-typing.
function renderChrome(container) {
  const categories = [...new Set(placesCache.map((p) => p.category))];

  const categoryChips = [
    `<button type="button" class="filter-chip ${state.category === "all" ? "is-active" : ""}" data-cat="all">All</button>`,
    ...categories.map((cat) => {
      const meta = categoryMeta(cat);
      const active = state.category === cat ? "is-active" : "";
      return `<button type="button" class="filter-chip tag-${meta.group} ${active}" data-cat="${cat}">${meta.emoji} ${escapeHtml(meta.label)}</button>`;
    }),
  ].join("");

  container.innerHTML = `
    <section class="explore">
      <h1>Explore</h1>
      <input type="search" class="explore__search" placeholder="Search places…" value="${escapeHtml(state.search)}" />
      <div class="filter-row">
        ${categoryChips}
        <button type="button" class="filter-chip tag-wine ${state.topPicksOnly ? "is-active" : ""}" data-toppicks="1">🏆 Top Picks</button>
      </div>
      <p class="explore__count"></p>
      <div class="place-list"></div>
    </section>
  `;

  container.querySelector(".explore__search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderList(container);
  });
  container.querySelectorAll(".filter-chip[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      renderChrome(container);
    });
  });
  container.querySelector("[data-toppicks]")?.addEventListener("click", () => {
    state.topPicksOnly = !state.topPicksOnly;
    renderChrome(container);
  });

  renderList(container);
}

// Updates only the count + card list — leaves the search input and filter
// chips untouched so typing doesn't get interrupted by a DOM rebuild.
function renderList(container) {
  const filtered = placesCache.filter((p) => {
    if (state.category !== "all" && p.category !== state.category) return false;
    if (state.topPicksOnly && !p.top_pick) return false;
    if (state.search) {
      const haystack = `${p.name} ${p.description || ""} ${p.why_it_fits || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    return true;
  });

  container.querySelector(".explore__count").textContent = `${filtered.length} place${filtered.length === 1 ? "" : "s"}`;
  container.querySelector(".place-list").innerHTML = filtered.length
    ? filtered.map(placeCardHtml).join("")
    : `<p class="view-empty__hint">No places match — try clearing a filter.</p>`;
}

function placeCardHtml(p) {
  const meta = categoryMeta(p.category);
  const closed = isClosedToday(p);
  const rating = p.rating ? `<span class="chip chip--rating">★ ${p.rating}</span>` : "";
  const closedBadge = closed ? `<span class="chip chip--closed">Closed today</span>` : "";
  const drive = p.drive_time_range ? `${escapeHtml(p.drive_time_range)} · ` : "";

  return `
    <article class="place-card">
      <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
      <div class="place-card__body">
        <h3>${escapeHtml(p.name)}</h3>
        <p class="place-card__meta">${drive}${escapeHtml(p.location_area || "")}</p>
        ${p.why_it_fits ? `<p class="place-card__why">${escapeHtml(p.why_it_fits)}</p>` : ""}
        <div class="place-card__footer">${rating}${closedBadge}</div>
      </div>
    </article>
  `;
}
