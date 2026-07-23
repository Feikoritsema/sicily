import { escapeHtml } from "../util.js";
import { categoryMeta, isClosedToday } from "../categories.js";
import { votesStore } from "../votes.js";
import { dayPlanStore } from "../day-plan.js";
import { localStore } from "../local-store.js";
import { TRIP_DATES } from "../constants.js";

let placesCache = null;
let listenersAttached = false;
const state = { category: "all", topPicksOnly: false, search: "", selectedId: null };

export async function render(container) {
  container.innerHTML = `<section class="explore"><h1>Explore</h1><p class="view-empty__hint">Loading places…</p></section>`;

  if (!placesCache) {
    const res = await fetch("./data/places.json");
    placesCache = await res.json();
  }
  await votesStore.load();
  await dayPlanStore.load();

  if (!listenersAttached) {
    listenersAttached = true;
    const refresh = () => {
      if (state.selectedId) renderDetail(container);
      else renderList(container);
    };
    votesStore.onChange(refresh);
    dayPlanStore.onChange(refresh);
  }

  if (state.selectedId) renderDetail(container);
  else renderChrome(container);
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

  container.querySelectorAll(".place-card[data-id]").forEach((card) => {
    const open = () => {
      state.selectedId = card.dataset.id;
      renderDetail(container);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  wireVoteButtons(container);
  wireDayAssignWidgets(container);
}

function renderDetail(container) {
  const p = placesCache.find((place) => place.id === state.selectedId);
  if (!p) {
    state.selectedId = null;
    renderChrome(container);
    return;
  }

  const meta = categoryMeta(p.category);
  const closed = isClosedToday(p);
  // drive_time_range is the raw doc string and often already embeds the
  // distance (e.g. "10 min (4.4 km)") — distance_km is the same figure
  // parsed out separately for comparisons, not a second value to display.
  const drive = p.drive_time_range ? escapeHtml(p.drive_time_range) : "";
  const tags = (p.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");

  container.innerHTML = `
    <section class="explore explore--detail">
      <button type="button" class="back-button">← Back to Explore</button>
      <div class="detail-header">
        <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
        <div>
          <h1>${escapeHtml(p.name)}</h1>
          <p class="place-card__meta">${drive}${drive && p.location_area ? " · " : ""}${escapeHtml(p.location_area || "")}</p>
        </div>
      </div>

      <div class="detail-chips">
        ${p.rating ? `<span class="chip chip--rating">★ ${p.rating}${p.review_count ? ` (${p.review_count})` : ""}</span>` : ""}
        ${closed ? `<span class="chip chip--closed">Closed today</span>` : ""}
        ${p.booking_required ? `<span class="chip">Booking recommended</span>` : ""}
        ${p.top_pick ? `<span class="chip chip--rating">🏆 Top Pick</span>` : ""}
      </div>

      ${voteRowHtml(p.id)}
      ${dayAssignHtml(p.id)}

      ${p.description ? `<p class="detail-text">${escapeHtml(p.description)}</p>` : ""}
      ${p.why_it_fits ? `<p class="detail-text detail-text--why"><strong>Why it fits:</strong> ${escapeHtml(p.why_it_fits)}</p>` : ""}
      ${p.top_pick_reason ? `<p class="detail-text detail-text--why"><strong>Top Pick because:</strong> ${escapeHtml(p.top_pick_reason)}</p>` : ""}

      ${p.closed_days ? `<p class="detail-text">Closed: ${escapeHtml((p.closed_days || []).join(", "))}</p>` : ""}
      ${tags ? `<div class="detail-chips">${tags}</div>` : ""}

      <div class="detail-actions">
        ${p.maps_url ? `<a class="detail-action" href="${p.maps_url}" target="_blank" rel="noopener">📍 Open in Maps</a>` : ""}
        ${p.phone ? `<a class="detail-action" href="tel:${p.phone.replace(/[^+\d]/g, "")}">📞 ${escapeHtml(p.phone)}</a>` : ""}
      </div>

      ${p.address ? `<p class="detail-text detail-text--meta">${escapeHtml(p.address)}</p>` : ""}
      ${p.last_verified_date ? `<p class="detail-text detail-text--meta">Last verified: ${escapeHtml(p.last_verified_date)}</p>` : ""}
    </section>
  `;

  container.querySelector(".back-button").addEventListener("click", () => {
    state.selectedId = null;
    renderChrome(container);
  });

  wireVoteButtons(container);
  wireDayAssignWidgets(container);
}

function placeCardHtml(p) {
  const meta = categoryMeta(p.category);
  const closed = isClosedToday(p);
  const rating = p.rating ? `<span class="chip chip--rating">★ ${p.rating}</span>` : "";
  const closedBadge = closed ? `<span class="chip chip--closed">Closed today</span>` : "";
  const drive = p.drive_time_range ? `${escapeHtml(p.drive_time_range)} · ` : "";

  return `
    <article class="place-card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
      <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
      <div class="place-card__body">
        <h3>${escapeHtml(p.name)}</h3>
        <p class="place-card__meta">${drive}${escapeHtml(p.location_area || "")}</p>
        ${p.why_it_fits ? `<p class="place-card__why">${escapeHtml(p.why_it_fits)}</p>` : ""}
        <div class="place-card__footer">${rating}${closedBadge}${voteRowHtml(p.id)}</div>
        <div class="place-card__day-assign">${dayAssignHtml(p.id)}</div>
      </div>
    </article>
  `;
}

function voteRowHtml(placeId) {
  const tally = votesStore.tallyFor(placeId);
  const personName = localStore.getProfileName();
  const myVote = personName ? votesStore.myVoteFor(placeId, personName) : 0;

  return `
    <div class="vote-row" data-vote-place="${escapeHtml(placeId)}">
      <button type="button" class="vote-btn ${myVote === 1 ? "is-active" : ""}" data-vote-value="1" aria-label="Thumbs up">👍</button>
      <span class="vote-tally">${tally}</span>
      <button type="button" class="vote-btn ${myVote === -1 ? "is-active" : ""}" data-vote-value="-1" aria-label="Thumbs down">👎</button>
    </div>
  `;
}

function wireVoteButtons(container) {
  const personName = localStore.getProfileName();
  container.querySelectorAll(".vote-row[data-vote-place]").forEach((row) => {
    const placeId = row.dataset.votePlace;
    row.querySelectorAll(".vote-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // don't also open the card's detail view
        if (!personName) return;
        votesStore.cast(placeId, personName, Number(btn.dataset.voteValue));
      });
    });
  });
}

const TIME_SLOTS = [
  ["", "Any time"],
  ["morning", "Morning"],
  ["afternoon", "Afternoon"],
  ["evening", "Evening"],
];

function dayAssignHtml(placeId) {
  const assigned = dayPlanStore.assignmentsFor(placeId);
  const chips = assigned
    .map(
      (a) => `
      <span class="chip day-assign-chip">
        ${escapeHtml(a.date.slice(5))}${a.time_slot ? ` · ${escapeHtml(a.time_slot)}` : ""}
        <button type="button" class="day-assign-remove" data-assignment-id="${a.id}" aria-label="Remove">×</button>
      </span>`
    )
    .join("");

  const dateOptions = TRIP_DATES.map((d) => `<option value="${d}">${d.slice(5)}</option>`).join("");
  const slotOptions = TIME_SLOTS.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");

  return `
    <div class="day-assign" data-place-id="${escapeHtml(placeId)}">
      <div class="day-assign-chips">${chips}</div>
      <button type="button" class="day-assign-toggle">+ Day</button>
      <div class="day-assign-form" hidden>
        <select class="day-assign-date">${dateOptions}</select>
        <select class="day-assign-slot">${slotOptions}</select>
        <button type="button" class="day-assign-submit">Add</button>
      </div>
    </div>
  `;
}

function wireDayAssignWidgets(container) {
  container.querySelectorAll(".day-assign[data-place-id]").forEach((widget) => {
    // Stop every interaction inside the widget from bubbling up to the
    // card's own click handler (which would otherwise open the detail view).
    widget.addEventListener("click", (e) => e.stopPropagation());

    const placeId = widget.dataset.placeId;
    const form = widget.querySelector(".day-assign-form");

    widget.querySelector(".day-assign-toggle").addEventListener("click", () => {
      form.hidden = !form.hidden;
    });

    widget.querySelector(".day-assign-submit").addEventListener("click", () => {
      const date = widget.querySelector(".day-assign-date").value;
      const slot = widget.querySelector(".day-assign-slot").value;
      dayPlanStore.add(date, placeId, slot);
      form.hidden = true;
    });

    widget.querySelectorAll(".day-assign-remove").forEach((btn) => {
      btn.addEventListener("click", () => dayPlanStore.remove(btn.dataset.assignmentId));
    });
  });
}
