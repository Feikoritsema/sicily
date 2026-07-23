import { TRIP_START, TRIP_END, TRIP_DATES } from "../constants.js";
import { escapeHtml } from "../util.js";
import { loadPlaces, placesById } from "../places-data.js";
import { categoryMeta, isClosedOnDate } from "../categories.js";
import { dayPlanStore, dayPlanDaysStore } from "../day-plan.js";

const SLOT_ORDER = ["morning", "afternoon", "evening", ""];
const SLOT_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", "": "Unscheduled" };

let listenersAttached = false;

export async function render(container) {
  container.innerHTML = `<section class="view-empty"><h1>Today</h1><p class="view-empty__hint">Loading…</p></section>`;

  await loadPlaces();
  await dayPlanStore.load();
  await dayPlanDaysStore.load();

  if (!listenersAttached) {
    listenersAttached = true;
    const refresh = () => renderContent(container);
    dayPlanStore.onChange(refresh);
    dayPlanDaysStore.onChange(refresh);
  }

  renderContent(container);
}

function tripStatus(now) {
  const start = new Date(TRIP_START);
  const end = new Date(TRIP_END);
  const msPerDay = 24 * 60 * 60 * 1000;

  if (now < start) {
    const days = Math.ceil((start - now) / msPerDay);
    return { label: `${days} day${days === 1 ? "" : "s"} until the trip starts`, todayDate: null };
  }
  if (now <= end) {
    const dayNum = Math.floor((now - start) / msPerDay) + 1;
    const todayDate = now.toISOString().slice(0, 10);
    return { label: `Day ${dayNum} of 9`, todayDate: TRIP_DATES.includes(todayDate) ? todayDate : null };
  }
  return { label: "Trip complete", todayDate: null };
}

function siestaOrSundayBanner(now) {
  const hour = now.getHours();
  const banners = [];
  if (now.getDay() === 0) {
    banners.push("🕊️ Quiet Sunday — some shops/restaurants may be closed or run reduced hours.");
  }
  if (hour >= 13 && hour < 16) {
    banners.push("🌞 Siesta hours (1–4pm) — many shops/restaurants close for a few hours; a good window for a pool break.");
  }
  return banners;
}

function renderContent(container) {
  const now = new Date();
  const { label, todayDate } = tripStatus(now);

  if (!todayDate) {
    container.innerHTML = `
      <section class="view-empty">
        <h1>Today</h1>
        <p class="today__status">${label}</p>
        <a class="edit-group-info-link" href="#info">🆘 Emergency card</a>
      </section>
    `;
    return;
  }

  const day = dayPlanDaysStore.get(todayDate);
  const assignments = dayPlanStore.assignmentsForDate(todayDate);
  const banners = siestaOrSundayBanner(now);

  const grouped = SLOT_ORDER.map((slot) => ({
    slot,
    items: assignments.filter((a) => (a.time_slot || "") === slot),
  })).filter((g) => g.items.length > 0);

  const planHtml = assignments.length
    ? grouped
        .map(
          ({ slot, items }) => `
        <h3 class="dayplan-slot">${SLOT_LABEL[slot]}</h3>
        <div class="place-list">${items.map((a) => todayCardHtml(a, todayDate)).join("")}</div>`
        )
        .join("")
    : `<p class="view-empty__hint">Nothing planned for today yet — see Day Planner.</p>`;

  container.innerHTML = `
    <section class="today">
      <h1>Today</h1>
      <p class="today__status">${label}</p>

      ${banners.map((b) => `<p class="today-banner">${b}</p>`).join("")}

      ${day.notes ? `<p class="detail-text detail-text--why">📝 ${escapeHtml(day.notes)}</p>` : ""}
      ${day.designated_driver ? `<p class="detail-text">🚗 Designated driver tonight: <strong>${escapeHtml(day.designated_driver)}</strong></p>` : ""}

      ${planHtml}

      <a class="edit-group-info-link" href="#info">🆘 Emergency card</a>
    </section>
  `;
}

function todayCardHtml(assignment, date) {
  const place = placesById(assignment.place_id);
  if (!place) return "";

  const meta = categoryMeta(place.category);
  const closedBadge = isClosedOnDate(place, date) ? `<span class="chip chip--closed">Closed today</span>` : "";
  const bookedBadge = place.booking_required
    ? `<span class="chip">${assignment.booked ? "✅ Booked" : "⏳ Not booked yet"}</span>`
    : "";

  return `
    <article class="place-card">
      <div class="place-card__badge tag-${meta.group}">${meta.emoji}</div>
      <div class="place-card__body">
        <h3>${escapeHtml(place.name)}</h3>
        <p class="place-card__meta">${escapeHtml(place.location_area || "")}</p>
        <div class="place-card__footer">${closedBadge}${bookedBadge}</div>
      </div>
    </article>
  `;
}
