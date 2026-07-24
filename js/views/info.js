import { escapeHtml, retryStateHtml } from "../util.js";
import { renderMarkdown } from "../markdown.js";
import { VILLA } from "../constants.js";
import { peopleStore } from "../people.js";

let practicalCache = null;
let eventsCache = null;
let listenersAttached = false;

export async function render(container, { isActive } = {}) {
  container.innerHTML = `<section class="view-empty"><h1>Info</h1><p class="view-empty__hint">Loading…</p></section>`;

  try {
    if (!practicalCache) {
      practicalCache = await fetch("./data/practical-info.json").then((r) => r.json());
    }
    if (!eventsCache) {
      eventsCache = await fetch("./data/events.json").then((r) => r.json());
    }
  } catch {
    container.innerHTML = retryStateHtml("Info");
    container.querySelector("[data-retry-load]")?.addEventListener("click", () => render(container, { isActive }));
    return;
  }
  await peopleStore.load();

  if (isActive && !isActive()) return;

  container.innerHTML = `
    <section class="info">
      <h1>Info</h1>
      <div class="emergency-section"></div>
      <div class="accordion-section"></div>
    </section>
  `;

  if (!listenersAttached) {
    listenersAttached = true;
    peopleStore.onChange(() => {
      const section = container.querySelector(".emergency-section");
      if (section) renderEmergency(section);
    });
  }

  renderEmergency(container.querySelector(".emergency-section"));
  renderAccordion(container.querySelector(".accordion-section"));
}

function renderEmergency(section) {
  const people = peopleStore.all();
  const insuranceRows = people.length
    ? people
        .map(
          (p) => `<li>${escapeHtml(p.name)}: ${p.insurance_info ? escapeHtml(p.insurance_info) : `<span class="view-empty__hint">not added yet</span>`}</li>`
        )
        .join("")
    : `<li class="view-empty__hint">Nobody's added insurance info yet — see Group Info.</li>`;

  section.innerHTML = `
    <h2 class="lists-heading emergency-heading">🆘 Emergency</h2>
    <ul class="packing-list">
      <li><strong>Villa host</strong> — <a class="detail-action detail-action--inline" href="tel:${VILLA.phone.replace(/[^+\d]/g, "")}">📞 ${escapeHtml(VILLA.phone)}</a></li>
      <li><strong>Emergency (EU-wide)</strong> — <a class="detail-action detail-action--inline" href="tel:112">📞 112</a></li>
      <li><strong>Ambulance</strong> — <a class="detail-action detail-action--inline" href="tel:118">📞 118</a></li>
    </ul>
    <p class="dayplan-slot">Insurance</p>
    <ul class="packing-list">${insuranceRows}</ul>
    <a class="edit-group-info-link" href="#profile">✏️ Edit my info in Group Info</a>
  `;
}

// Events used to be its own always-expanded section; Feiko asked for it to
// behave like every other Info topic — a collapsed-by-default accordion
// item, not a special case.
function eventsAccordionItem() {
  const events = [...eventsCache].sort((a, b) => a.date.localeCompare(b.date));

  const rows = events
    .map(
      (e) => `
      <li class="packing-item event-item">
        <div>
          <div><strong>${escapeHtml(e.name)}</strong> <span class="chip">${escapeHtml(e.date)}</span></div>
          <p class="place-card__meta">${escapeHtml(e.location)}</p>
          <p class="assignment-note">${escapeHtml(e.description)}</p>
          ${e.maps_url ? `<a class="detail-action detail-action--inline" href="${e.maps_url}" target="_blank" rel="noopener">📍 Open in Maps</a>` : ""}
        </div>
      </li>`
    )
    .join("");

  return `
    <details class="practical-item">
      <summary class="lists-heading">📅 Events</summary>
      <div class="practical-body">
        <ul class="packing-list">${rows || `<li class="view-empty__hint">No events in this window.</li>`}</ul>
      </div>
    </details>`;
}

function renderAccordion(section) {
  const sorted = [...practicalCache].sort((a, b) => a.order - b.order);

  const practicalItems = sorted
    .map(
      (item) => `
      <details class="practical-item">
        <summary class="lists-heading">${item.icon} ${escapeHtml(item.title)}</summary>
        <div class="practical-body">${renderMarkdown(item.markdown)}</div>
      </details>`
    )
    .join("");

  section.innerHTML = eventsAccordionItem() + practicalItems;
}
