export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Migrated tags are raw snake_case identifiers (e.g. "low_effort_no_drive") —
// this is display-only prettifying, never used for comparisons.
export function humanizeTag(tag) {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Shared "couldn't load a static JSON file" state — a fetch() of e.g.
// places.json/practical-info.json can reject (network down, first-ever
// offline visit before the service worker has cached it) or return malformed
// JSON. Every view that hits this renders the same retry affordance instead
// of leaving "Loading…" up forever with no way out short of a manual reload.
export function retryStateHtml(title) {
  return `
    <section class="view-empty">
      <h1>${escapeHtml(title)}</h1>
      <p class="view-empty__hint">Couldn't load — check your connection and try again.</p>
      <button type="button" class="detail-action" data-retry-load>Try again</button>
    </section>`;
}
