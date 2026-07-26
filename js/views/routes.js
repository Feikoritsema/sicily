import { escapeHtml } from "../util.js";
import { placesById } from "../places-data.js";
import { categoryMeta } from "../categories.js";
import { dayPlanStore } from "../day-plan.js";
import { TRIP_DATES } from "../constants.js";

export function routeCardHtml(route) {
  const walkTotal = route.total_walk_min ? `${route.total_walk_min} min walk` : "";
  const stopCount = route.stops.length;
  const transportLabel = route.transport === "walk" ? "🚶‍♂️ Walk from villa" : "🚗 Drive to Noto";

  return `
    <article class="route-card" data-route-id="${escapeHtml(route.id)}" role="button" tabindex="0">
      <div class="route-card__header">
        <div class="route-card__emoji">${route.emoji}</div>
        <div>
          <div class="route-card__title">${escapeHtml(route.name)}</div>
          <div class="route-card__stats">
            <span>📍 ${stopCount} stop${stopCount > 1 ? "s" : ""}</span>
            ${walkTotal ? `<span>🚶 ${walkTotal}</span>` : ""}
            <span>🕐 ${route.start_time}–${route.end_time}</span>
          </div>
        </div>
      </div>
      <div class="route-card__body">${escapeHtml(route.description)}</div>
      <div class="route-card__tags">
        <span class="chip chip--transport">${transportLabel}</span>
      </div>
    </article>
  `;
}

export function renderRouteDetail(container, route, { onBack, onAddToDay }) {
  const timelineHtml = route.stops.map((stop, i) => {
    const place = placesById(stop.place_id);
    if (!place) return "";

    const meta = categoryMeta(place.category);
    const rating = place.rating ? `★ ${place.rating}` : "";
    const walkTime = stop.walk_to_next_min != null
      ? `<span class="walk-badge">🚶 ${stop.walk_to_next_min} min walk</span>`
      : "";
    const isLast = i === route.stops.length - 1;

    return `
      <div class="timeline-stop">
        <div class="timeline-dot tag-${meta.group}">${meta.emoji}</div>
        <div class="timeline-body">
          <div class="timeline-body__name">${escapeHtml(place.name)}</div>
          <div class="timeline-body__meta">${meta.emoji} ${escapeHtml(meta.label)}${rating ? ` · ${rating}` : ""}</div>
          ${stop.note ? `<div class="timeline-body__note">${escapeHtml(stop.note)}</div>` : ""}
          ${walkTime}
          ${place.walk_from_villa_min && i === 0 ? `<span class="walk-badge walk-badge-villa">🚶 Villa → ${place.walk_from_villa_min} min walk</span>` : ""}
          <div class="timeline-actions">
            ${dayAssignInline(place.id)}
          </div>
        </div>
      </div>
      ${!isLast ? `<div class="timeline-connector"></div>` : ""}
    `;
  }).join("");

  const dateOptions = TRIP_DATES.map((d) => `<option value="${d}">${d.slice(5)}</option>`).join("");

  container.innerHTML = `
    <section class="explore explore--detail">
      <div class="route-detail-header">
        <button type="button" class="back-button" data-route-back>← Back to Routes</button>
      </div>
      <div class="route-hero">
        <div class="route-hero__emoji">${route.emoji}</div>
        <h1>${escapeHtml(route.name)}</h1>
        <div class="route-hero__meta">
          <span>📍 ${route.stops.length} stop${route.stops.length > 1 ? "s" : ""}</span>
          ${route.total_walk_min ? `<span>🚶 ${route.total_walk_min} min total walking</span>` : ""}
          <span>🕐 ${route.start_time}–${route.end_time}</span>
        </div>
        <p class="route-hero__desc">${escapeHtml(route.description)}</p>
        <div class="route-add-day">
          <select class="route-date-pick">${dateOptions}</select>
          <button type="button" class="route-add-btn" data-route-add="${escapeHtml(route.id)}">📋 Add all to day</button>
        </div>
      </div>
      <div class="timeline">${timelineHtml}</div>
    </section>
  `;

  container.querySelector("[data-route-back]").addEventListener("click", onBack);

  container.querySelector("[data-route-add]").addEventListener("click", () => {
    const date = container.querySelector(".route-date-pick").value;
    onAddToDay(route.id, date);
    const btn = container.querySelector("[data-route-add]");
    btn.textContent = "✅ Added!";
    setTimeout(() => { btn.textContent = "📋 Add all to day"; }, 2000);
  });

  container.querySelectorAll(".day-assign-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const form = btn.nextElementSibling;
      if (form) form.hidden = !form.hidden;
    });
  });
  container.querySelectorAll(".day-assign-submit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const widget = btn.closest(".day-assign");
      if (!widget) return;
      const placeId = widget.dataset.placeId;
      const date = widget.querySelector(".day-assign-date").value;
      const slot = widget.querySelector(".day-assign-slot").value;
      dayPlanStore.add(date, placeId, slot);
      const form = widget.querySelector(".day-assign-form");
      if (form) form.hidden = true;
    });
  });
  container.querySelectorAll(".day-assign-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dayPlanStore.remove(btn.dataset.assignmentId);
    });
  });
}

function dayAssignInline(placeId) {
  const assigned = dayPlanStore.assignmentsFor(placeId);
  const chips = assigned
    .map((a) => `
      <span class="chip day-assign-chip">
        ${escapeHtml(a.date.slice(5))}${a.time_slot ? ` · ${escapeHtml(a.time_slot)}` : ""}
        <button type="button" class="day-assign-remove" data-assignment-id="${a.id}" aria-label="Remove">×</button>
      </span>`)
    .join("");
  const dateOptions = TRIP_DATES.map((d) => `<option value="${d}">${d.slice(5)}</option>`).join("");
  const slotOptions = [
    ["", "Any time"],
    ["morning", "Morning"],
    ["afternoon", "Afternoon"],
    ["evening", "Evening"],
  ].map(([v, label]) => `<option value="${v}">${label}</option>`).join("");

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
