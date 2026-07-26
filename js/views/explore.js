import { escapeHtml, humanizeTag, retryStateHtml } from "../util.js";
import { categoryMeta, isClosedToday, CATEGORY_META } from "../categories.js";
import { votesStore } from "../votes.js";
import { dayPlanStore } from "../day-plan.js";
import { localStore } from "../local-store.js";
import { TRIP_DATES } from "../constants.js";
import { loadPlaces } from "../places-data.js";
import { customPlacesStore } from "../custom-places.js";
import { fallbackPhotoFor } from "../photo-fallback.js";
import { renderSwipe } from "./explore-swipe.js";
import { loadRoutes, getRoutes } from "../routes-data.js";
import { routeCardHtml, renderRouteDetail } from "./routes.js";

let placesCache = null;
let listenersAttached = false;
// mode: "list" | "detail" | "swipe" | "routes" | "route-detail"
// swipe and routes modes manage their own rendering
const state = { category: "all", topPicksOnly: false, lowEffortOnly: false, search: "", selectedId: null, selectedRouteId: null, mode: "list" };

// Doc-sourced places (static, read-only) + user-added ones (Supabase-backed)
// merged into one list — a custom place is deliberately the same shape, so
// every existing filter/search/vote/day-assign code path works unchanged.
function allPlaces() {
  return [...placesCache, ...customPlacesStore.all()];
}

export async function render(container, { isActive } = {}) {
  container.innerHTML = `<section class="explore"><h1>Explore</h1><p class="view-empty__hint">Loading places…</p></section>`;

  try {
    placesCache = await loadPlaces();
  } catch {
    container.innerHTML = retryStateHtml("Explore");
    container.querySelector("[data-retry-load]")?.addEventListener("click", () => render(container, { isActive }));
    return;
  }

  await votesStore.load();
  await dayPlanStore.load();
  await customPlacesStore.load();
  await loadRoutes();

  if (isActive && !isActive()) return;

  if (!listenersAttached) {
    listenersAttached = true;
    // Store subscriptions live for the app's lifetime, but #app gets
    // overwritten every time the user switches tabs — if Explore isn't the
    // currently-mounted view, skip the re-render rather than crashing on
    // DOM that's no longer there (mirrors the guard in dayplan.js's renderDay).
    const refresh = () => {
      if (!container.querySelector(".explore")) return;
      if (state.mode === "swipe") return;
      if (state.mode === "routes") return;
      if (state.mode === "route-detail") return;
      if (state.mode === "detail") renderDetail(container);
      else renderList(container);
    };
    votesStore.onChange(refresh);
    dayPlanStore.onChange(refresh);
    customPlacesStore.onChange(refresh);
  }

  if (state.mode === "swipe") openSwipeMode(container);
  else if (state.mode === "detail") renderDetail(container);
  else if (state.mode === "routes") openRoutesMode(container);
  else if (state.mode === "route-detail") openRouteDetail(container);
  else renderChrome(container);
}

// Rebuilds the whole view, including the search input and filter chips.
// Only called on tab entry or when a filter chip is clicked — never on
// every keystroke, so the search input never loses focus mid-typing.
// Queue = every place the current user hasn't voted on yet, respecting
// whatever category filter was active when the button was pressed (lets
// someone swipe through just "the wineries" instead of everything).
function openSwipeMode(container) {
  const personName = localStore.getProfileName();
  const candidates = allPlaces().filter((p) => {
    if (state.category !== "all" && p.category !== state.category) return false;
    return !personName || votesStore.myVoteFor(p.id, personName) === 0;
  });

  renderSwipe(container, {
    places: candidates,
    onVote: (placeId, value) => {
      if (personName) votesStore.cast(placeId, personName, value);
    },
    onExit: () => {
      state.mode = "list";
      renderChrome(container);
    },
  });
}

function renderChrome(container) {
  const categories = [...new Set(allPlaces().map((p) => p.category))];

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
        <button type="button" class="filter-chip tag-nightlife ${state.lowEffortOnly ? "is-active" : ""}" data-loweffort="1">😌 Low-Effort, No Drive</button>
      </div>
      <div class="explore-actions-row">
        <button type="button" class="routes-mode-toggle ${state.mode === "routes" || state.mode === "route-detail" ? "is-active" : ""}">🗺️ Routes</button>
        <button type="button" class="swipe-mode-toggle">⚡ Swipe & Vote</button>
        <button type="button" class="add-place-toggle">➕ Add a place</button>
      </div>
      <div class="add-place-form" hidden></div>
      <p class="explore__count"></p>
      <div class="place-list"></div>
    </section>
  `;

  container.querySelector(".swipe-mode-toggle").addEventListener("click", () => {
    state.mode = "swipe";
    openSwipeMode(container);
  });

  container.querySelector(".routes-mode-toggle").addEventListener("click", () => {
    if (state.mode === "routes" || state.mode === "route-detail") {
      state.mode = "list";
      state.selectedRouteId = null;
      renderChrome(container);
    } else {
      state.mode = "routes";
      openRoutesMode(container);
    }
  });

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
  container.querySelector("[data-loweffort]")?.addEventListener("click", () => {
    state.lowEffortOnly = !state.lowEffortOnly;
    renderChrome(container);
  });
  wireAddPlaceForm(container);

  renderList(container);
}

// Updates only the count + card list — leaves the search input and filter
// chips untouched so typing doesn't get interrupted by a DOM rebuild.
function renderList(container) {
  const filtered = allPlaces().filter((p) => {
    if (state.category !== "all" && p.category !== state.category) return false;
    if (state.topPicksOnly && !p.top_pick) return false;
    if (state.lowEffortOnly && !(p.tags || []).includes("low_effort_no_drive")) return false;
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
      state.mode = "detail";
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
  const p = allPlaces().find((place) => place.id === state.selectedId);
  if (!p) {
    state.selectedId = null;
    state.mode = "list";
    renderChrome(container);
    return;
  }

  const meta = categoryMeta(p.category);
  const closed = isClosedToday(p);
  // drive_time_range is the raw doc string and often already embeds the
  // distance (e.g. "10 min (4.4 km)") — distance_km is the same figure
  // parsed out separately for comparisons, not a second value to display.
  const drive = p.drive_time_range ? escapeHtml(p.drive_time_range) : "";
  const tags = (p.tags || []).map((t) => `<span class="chip">${escapeHtml(humanizeTag(t))}</span>`).join("");
  const fallbackPhoto = fallbackPhotoFor(meta.group);
  const heroPhoto = p.photo_url || fallbackPhoto;

  container.innerHTML = `
    <section class="explore explore--detail">
      <div class="detail-hero">
        <img class="detail-hero__img" src="${escapeHtml(heroPhoto)}" alt=""
             onerror="this.onerror=null; this.src='${escapeHtml(fallbackPhoto)}';" />
        <button type="button" class="back-button back-button--on-hero">← Back to Explore</button>
        <div class="detail-hero__overlay">
          <p class="detail-hero__category">${meta.emoji} ${escapeHtml(meta.label)}</p>
          <h1>${escapeHtml(p.name)}</h1>
          <p class="detail-hero__meta">${drive}${drive && p.location_area ? " · " : ""}${escapeHtml(p.location_area || "")}</p>
        </div>
      </div>

      <div class="detail-chips">
        ${p.rating ? `<span class="chip chip--rating">★ ${p.rating}${p.review_count ? ` (${p.review_count})` : ""}</span>` : ""}
        ${closed ? `<span class="chip chip--closed">Closed today</span>` : ""}
        ${p.booking_required ? `<span class="chip">Booking recommended</span>` : ""}
        ${p.top_pick ? `<span class="chip chip--rating">🏆 Top Pick</span>` : ""}
        ${p.added_by ? `<span class="chip">➕ Added by ${escapeHtml(p.added_by)}</span>` : ""}
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
    state.mode = "list";
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

  // Custom places don't have why_it_fits (that's a doc-specific field) —
  // description is their equivalent one-line summary on the card.
  const summary = p.why_it_fits || p.description;
  const addedBy = p.added_by ? `<span class="chip">➕ ${escapeHtml(p.added_by)}</span>` : "";

  return `
    <article class="place-card" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
      <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
      <div class="place-card__body">
        <h3>${escapeHtml(p.name)}</h3>
        <p class="place-card__meta">${drive}${escapeHtml(p.location_area || "")}</p>
        ${summary ? `<p class="place-card__why">${escapeHtml(summary)}</p>` : ""}
        <div class="place-card__footer">${rating}${closedBadge}${addedBy}${voteRowHtml(p.id)}</div>
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

function openRoutesMode(container) {
  const routes = getRoutes();
  container.innerHTML = `
    <section class="explore">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">
        <h1 style="margin:0;">🗺️ Routes</h1>
        <button type="button" class="back-button" data-back-explore>← Back to Explore</button>
      </div>
      <p style="font-size:0.82rem;color:var(--text2);margin:0 0 0.8rem;">
        Pre-planned sequences of places. Tap one to see the full walk/drive.
      </p>
      <div class="route-list">
        ${routes.map(routeCardHtml).join("")}
      </div>
    </section>
  `;

  container.querySelector("[data-back-explore]").addEventListener("click", () => {
    state.mode = "list";
    state.selectedRouteId = null;
    renderChrome(container);
  });

  container.querySelectorAll(".route-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedRouteId = card.dataset.routeId;
      state.mode = "route-detail";
      openRouteDetail(container);
    });
  });
}

function openRouteDetail(container) {
  const route = getRoutes().find((r) => r.id === state.selectedRouteId);
  if (!route) {
    state.mode = "routes";
    openRoutesMode(container);
    return;
  }

  renderRouteDetail(container, route, {
    onBack: () => {
      state.selectedRouteId = null;
      state.mode = "routes";
      openRoutesMode(container);
    },
    onAddToDay: (routeId, date) => {
      dayPlanStore.addRoute(routeId, date);
    },
  });
}

// Category is a <select> constrained to the existing taxonomy (not free
// text) so a user-added place slots into the same filter/color-group
// system as every doc-sourced one — no "unknown category" fallback needed.
function wireAddPlaceForm(container) {
  const toggle = container.querySelector(".add-place-toggle");
  const formHost = container.querySelector(".add-place-form");

  toggle.addEventListener("click", () => {
    formHost.hidden = !formHost.hidden;
    if (!formHost.hidden && !formHost.innerHTML) renderAddPlaceForm(formHost);
  });
}

function renderAddPlaceForm(formHost) {
  const categoryOptions = Object.entries(CATEGORY_META)
    .map(([key, meta]) => `<option value="${key}">${meta.emoji} ${escapeHtml(meta.label)}</option>`)
    .join("");

  formHost.innerHTML = `
    <form class="add-place-fields">
      <input type="text" name="name" placeholder="Name" required />
      <select name="category">${categoryOptions}</select>
      <input type="text" name="location_area" placeholder="Location (e.g. Marzamemi)" />
      <textarea name="description" placeholder="Why add this? What's it like?"></textarea>
      <input type="url" name="maps_url" placeholder="Google Maps link (optional)" />
      <input type="tel" name="phone" placeholder="Phone (optional)" />
      <input type="url" name="photo_url" placeholder="Photo URL (optional)" />
      <button type="submit">Add place</button>
    </form>
  `;

  formHost.querySelector(".add-place-fields").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const name = data.get("name").trim();
    if (!name) return;

    customPlacesStore.add({
      name,
      category: data.get("category"),
      location_area: data.get("location_area").trim() || null,
      description: data.get("description").trim() || null,
      maps_url: data.get("maps_url").trim() || null,
      phone: data.get("phone").trim() || null,
      photo_url: data.get("photo_url").trim() || null,
      added_by: localStore.getProfileName(),
    });

    form.reset();
    formHost.hidden = true;
  });
}
