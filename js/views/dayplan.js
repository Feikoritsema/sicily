import { TRIP_DATES } from "../constants.js";

export function render(container) {
  const tabs = TRIP_DATES.map((d) => `<button type="button" class="day-tab" data-date="${d}">${d.slice(5)}</button>`).join("");

  container.innerHTML = `
    <section class="view-empty">
      <h1>Day Plan</h1>
      <div class="day-tabs">${tabs}</div>
      <p class="view-empty__hint">Assigning places to a day (time slot, booked toggle, closed-day warnings) lands here in build order §10 step 5.</p>
    </section>
  `;
}
