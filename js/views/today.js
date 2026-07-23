import { TRIP_START, TRIP_END } from "../constants.js";

export function render(container) {
  const now = new Date();
  const start = new Date(TRIP_START);
  const end = new Date(TRIP_END);
  const msPerDay = 24 * 60 * 60 * 1000;

  let status;
  if (now < start) {
    const days = Math.ceil((start - now) / msPerDay);
    status = `${days} day${days === 1 ? "" : "s"} until the trip starts`;
  } else if (now <= end) {
    const dayNum = Math.floor((now - start) / msPerDay) + 1;
    status = `Day ${dayNum} of 9`;
  } else {
    status = "Trip complete";
  }

  container.innerHTML = `
    <section class="view-empty">
      <h1>Today</h1>
      <p class="today__status">${status}</p>
      <p class="view-empty__hint">Today's assigned places, closures, and the Designated Driver widget land here once Day Planner and Explore are wired up (build order §10, steps 4-8).</p>
    </section>
  `;
}
