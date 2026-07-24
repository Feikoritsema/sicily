import { TRIP_DATES } from "../constants.js";
import { escapeHtml, retryStateHtml } from "../util.js";
import { loadPlaces, placesById } from "../places-data.js";
import { categoryMeta, isClosedOnDate } from "../categories.js";
import { dayPlanStore, dayPlanDaysStore } from "../day-plan.js";
import { peopleStore } from "../people.js";

const SLOT_ORDER = ["morning", "afternoon", "evening", ""];
const SLOT_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", "": "Unscheduled" };

let listenersAttached = false;
const state = { date: null };

export async function render(container, { isActive } = {}) {
  container.innerHTML = `<section class="view-empty"><h1>Day Plan</h1><p class="view-empty__hint">Loading…</p></section>`;

  try {
    await loadPlaces();
  } catch {
    container.innerHTML = retryStateHtml("Day Plan");
    container.querySelector("[data-retry-load]")?.addEventListener("click", () => render(container, { isActive }));
    return;
  }

  await dayPlanStore.load();
  await dayPlanDaysStore.load();
  await peopleStore.load();

  if (isActive && !isActive()) return;

  if (!state.date) state.date = pickDefaultDate();

  if (!listenersAttached) {
    listenersAttached = true;
    const refresh = () => renderDay(container);
    dayPlanStore.onChange(refresh);
    dayPlanDaysStore.onChange(refresh);
    peopleStore.onChange(refresh);
  }

  renderChrome(container);
}

function pickDefaultDate() {
  const today = new Date().toISOString().slice(0, 10);
  return TRIP_DATES.includes(today) ? today : TRIP_DATES[0];
}

function renderChrome(container) {
  const tabs = TRIP_DATES.map(
    (d) => `<button type="button" class="day-tab ${d === state.date ? "is-active" : ""}" data-date="${d}">${d.slice(5)}</button>`
  ).join("");

  container.innerHTML = `
    <section class="dayplan">
      <h1>Day Plan</h1>
      <div class="day-tabs">${tabs}</div>
      <div class="dayplan-body"></div>
    </section>
  `;

  container.querySelectorAll(".day-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.date = btn.dataset.date;
      renderChrome(container);
    });
  });

  renderDay(container);
}

function renderDay(container) {
  const body = container.querySelector(".dayplan-body");
  if (!body) return; // view no longer mounted (tab switched away)

  const date = state.date;
  const day = dayPlanDaysStore.get(date);
  const assignments = dayPlanStore.assignmentsForDate(date);

  const grouped = SLOT_ORDER.map((slot) => ({
    slot,
    items: assignments.filter((a) => (a.time_slot || "") === slot),
  })).filter((g) => g.items.length > 0);

  const listHtml = assignments.length
    ? grouped.map(({ slot, items }) => sectionHtml(slot, items, date)).join("")
    : `
      <p class="view-empty__hint">Nothing planned yet for this day.</p>
      <button type="button" class="detail-action" data-jump-explore>Browse Top Picks in Explore</button>
    `;

  body.innerHTML = `
    <textarea class="dayplan-note" placeholder="Notes for this day…">${escapeHtml(day.notes || "")}</textarea>
    ${driverWidgetHtml(day)}
    ${listHtml}
  `;

  body.querySelector(".dayplan-note").addEventListener("blur", (e) => {
    dayPlanDaysStore.setNotes(date, e.target.value);
  });

  body.querySelector(".driver-select")?.addEventListener("change", (e) => {
    dayPlanDaysStore.setDesignatedDriver(date, e.target.value);
  });

  body.querySelector("[data-jump-explore]")?.addEventListener("click", () => {
    location.hash = "explore";
  });

  body.querySelectorAll(".assignment-remove").forEach((btn) => {
    btn.addEventListener("click", () => dayPlanStore.remove(btn.dataset.assignmentId));
  });
  body.querySelectorAll(".assignment-booked").forEach((cb) => {
    cb.addEventListener("change", () => dayPlanStore.setBooked(cb.dataset.assignmentId, cb.checked));
  });
}

function driverWidgetHtml(day) {
  const candidates = peopleStore.all().filter((p) => p.comfortable_night_driving);

  if (!candidates.length) {
    return `<p class="view-empty__hint">Nobody's flagged themselves as comfortable driving at night yet — see Group Info.</p>`;
  }

  const options = [`<option value="">— Pick a driver —</option>`]
    .concat(candidates.map((p) => `<option value="${escapeHtml(p.name)}" ${day.designated_driver === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`))
    .join("");

  return `
    <label class="driver-widget">
      🚗 Designated driver tonight
      <select class="driver-select">${options}</select>
    </label>
  `;
}

function sectionHtml(slot, items, date) {
  return `
    <h3 class="dayplan-slot">${SLOT_LABEL[slot]}</h3>
    <div class="place-list">${items.map((a) => assignmentCardHtml(a, date)).join("")}</div>
  `;
}

function assignmentCardHtml(assignment, date) {
  const place = placesById(assignment.place_id);
  if (!place) return "";

  const meta = categoryMeta(place.category);
  const notes = [];

  if (isClosedOnDate(place, date)) {
    notes.push(`<p class="assignment-note assignment-note--warn">⚠ Closed on this day (${escapeHtml(place.closed_days.join(", "))}).</p>`);
  }
  if (place.drive_minutes_max && place.drive_minutes_max > 35) {
    notes.push(`<p class="assignment-note">🚗 Long drive (${escapeHtml(place.drive_time_range || "")}) — see Info → Night Driving for the "stay over instead" option.</p>`);
  }
  if ((place.tags || []).includes("weather-dependent-booking")) {
    notes.push(`<p class="assignment-note">🌤 Weather-dependent booking — most operators offer free rescheduling, worth keeping a backup day free.</p>`);
  }
  if (place.category === "nature_hike") {
    notes.push(`<p class="assignment-note">🥾 Hiking day — check the Packing list's hiking-gear category.</p>`);
  }

  const bookedToggle = place.booking_required
    ? `<label class="assignment-booked-label">
         <input type="checkbox" class="assignment-booked" data-assignment-id="${assignment.id}" ${assignment.booked ? "checked" : ""}/>
         Booked
       </label>`
    : "";

  return `
    <article class="place-card assignment-card">
      <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
      <div class="place-card__body">
        <h3>${escapeHtml(place.name)}</h3>
        <p class="place-card__meta">${escapeHtml(place.location_area || "")}</p>
        ${notes.join("")}
        <div class="place-card__footer">
          ${bookedToggle}
          <button type="button" class="assignment-remove" data-assignment-id="${assignment.id}">Remove</button>
        </div>
      </div>
    </article>
  `;
}
