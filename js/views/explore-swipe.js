// Tinder-style swipe-to-vote mode (implementation_plan.md-adjacent — see
// ~/.claude/plans/staged-munching-crab.md §C). A third mode inside Explore,
// not a new tab. Swipe-left is a real 👎 (value -1), swipe-right a real 👍
// (value 1) — matches the vote semantics used everywhere else in Explore,
// since the `votes` schema has no neutral "skip" state to represent one.
// A button fallback ships alongside the drag gesture for reliability
// (mouse/trackpad, accessibility) and because pointer-drag isn't easily
// automatable for testing.

import { escapeHtml } from "../util.js";
import { categoryMeta, isClosedToday } from "../categories.js";
import { fallbackPhotoFor } from "../photo-fallback.js";

const SWIPE_THRESHOLD = 90;

export function renderSwipe(container, { places, onVote, onExit }) {
  const queue = [...places];
  let index = 0;
  let votedCount = 0;
  let showInfo = false; // reset per card in drawCurrentCard

  container.innerHTML = `<section class="explore explore--swipe"><div class="swipe-host"></div></section>`;
  const host = container.querySelector(".swipe-host");
  drawCurrentCard();

  function drawCurrentCard() {
    showInfo = false;

    if (index >= queue.length) {
      host.innerHTML = `
        <div class="swipe-done">
          <h1>All caught up! 🎉</h1>
          <p class="view-empty__hint">${votedCount} vote${votedCount === 1 ? "" : "s"} cast this session.</p>
          <button type="button" class="detail-action swipe-exit">Back to Explore</button>
        </div>
      `;
      host.querySelector(".swipe-exit").addEventListener("click", onExit);
      return;
    }

    const place = queue[index];

    host.innerHTML = `
      <div class="swipe-header">
        <span class="view-empty__hint">${index + 1} of ${queue.length}</span>
        <button type="button" class="swipe-exit-btn" aria-label="Exit swipe mode">✕</button>
      </div>
      <div class="swipe-card">
        <img class="swipe-card__img" src="" alt="" />
        <button type="button" class="swipe-info-btn" aria-label="More info">ⓘ</button>
        <div class="swipe-card__overlay"></div>
      </div>
      <div class="swipe-actions">
        <button type="button" class="swipe-btn swipe-btn--no" aria-label="Thumbs down">👎</button>
        <button type="button" class="swipe-btn swipe-btn--yes" aria-label="Thumbs up">👍</button>
      </div>
    `;

    const meta = categoryMeta(place.category);
    const photo = place.photo_url || fallbackPhotoFor(meta.group);
    const img = host.querySelector(".swipe-card__img");
    img.src = photo;
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackPhotoFor(meta.group);
    };

    redrawOverlay(place, meta);

    host.querySelector(".swipe-exit-btn").addEventListener("click", onExit);
    host.querySelector(".swipe-btn--no").addEventListener("click", () => commit(place, -1));
    host.querySelector(".swipe-btn--yes").addEventListener("click", () => commit(place, 1));
    host.querySelector(".swipe-info-btn").addEventListener("click", () => {
      showInfo = !showInfo;
      redrawOverlay(place, meta);
    });
    wireDrag(host.querySelector(".swipe-card"), place);
  }

  function redrawOverlay(place, meta) {
    const overlay = host.querySelector(".swipe-card__overlay");
    if (!overlay) return;

    const drive = place.drive_time_range ? escapeHtml(place.drive_time_range) : "";
    const location = escapeHtml(place.location_area || "");
    const summary = place.why_it_fits || place.description;

    overlay.innerHTML = `
      <p class="detail-hero__category">${meta.emoji} ${escapeHtml(meta.label)}</p>
      <h1>${escapeHtml(place.name)}</h1>
      <p class="detail-hero__meta">${drive}${drive && location ? " · " : ""}${location}</p>
      ${summary ? `<p class="swipe-card__summary">${escapeHtml(summary)}</p>` : ""}
      ${showInfo ? extraInfoHtml(place) : ""}
    `;
  }

  function extraInfoHtml(place) {
    const closed = isClosedToday(place);
    const chips = [
      place.rating ? `<span class="chip chip--rating">★ ${place.rating}${place.review_count ? ` (${place.review_count})` : ""}</span>` : "",
      closed ? `<span class="chip chip--closed">Closed today</span>` : "",
      place.booking_required ? `<span class="chip">Booking recommended</span>` : "",
      place.top_pick ? `<span class="chip chip--rating">🏆 Top Pick</span>` : "",
      place.added_by ? `<span class="chip">➕ ${escapeHtml(place.added_by)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const tags = (place.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");

    const links = [
      place.maps_url ? `<a class="detail-action detail-action--inline" href="${place.maps_url}" target="_blank" rel="noopener">📍 Maps</a>` : "",
      place.phone ? `<a class="detail-action detail-action--inline" href="tel:${place.phone.replace(/[^+\d]/g, "")}">📞 ${escapeHtml(place.phone)}</a>` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="swipe-card__extra">
        ${chips || tags ? `<div class="detail-chips">${chips}${tags}</div>` : ""}
        ${place.description && place.why_it_fits ? `<p class="swipe-card__summary">${escapeHtml(place.description)}</p>` : ""}
        ${place.closed_days ? `<p class="swipe-card__summary">Closed: ${escapeHtml((place.closed_days || []).join(", "))}</p>` : ""}
        ${links ? `<div class="swipe-card__links">${links}</div>` : ""}
      </div>
    `;
  }

  function commit(place, value) {
    onVote(place.id, value);
    votedCount += 1;
    index += 1;
    drawCurrentCard();
  }

  function wireDrag(cardEl, place) {
    let startX = null;
    let dragging = false;

    cardEl.addEventListener("pointerdown", (e) => {
      // Let the info button and any links inside the expanded overlay behave
      // like normal tappable elements — don't start a drag/vote gesture there.
      if (e.target.closest(".swipe-info-btn, .swipe-card__links a")) return;
      startX = e.clientX;
      dragging = true;
      cardEl.setPointerCapture(e.pointerId);
      cardEl.style.transition = "none";
    });

    cardEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      cardEl.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      const dx = e.clientX - startX;
      cardEl.style.transition = "transform 200ms ease";

      if (dx > SWIPE_THRESHOLD) {
        cardEl.style.transform = `translateX(120%) rotate(20deg)`;
        setTimeout(() => commit(place, 1), 180);
      } else if (dx < -SWIPE_THRESHOLD) {
        cardEl.style.transform = `translateX(-120%) rotate(-20deg)`;
        setTimeout(() => commit(place, -1), 180);
      } else {
        cardEl.style.transform = "translateX(0) rotate(0)";
      }
    };

    cardEl.addEventListener("pointerup", endDrag);
    cardEl.addEventListener("pointercancel", endDrag);
  }
}
