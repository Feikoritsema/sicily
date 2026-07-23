// Tinder-style swipe-to-vote mode (implementation_plan.md-adjacent — see
// ~/.claude/plans/staged-munching-crab.md §C). A third mode inside Explore,
// not a new tab. Swipe-left is a real 👎 (value -1), swipe-right a real 👍
// (value 1) — matches the vote semantics used everywhere else in Explore,
// since the `votes` schema has no neutral "skip" state to represent one.
// A button fallback ships alongside the drag gesture for reliability
// (mouse/trackpad, accessibility) and because pointer-drag isn't easily
// automatable for testing.

import { escapeHtml } from "../util.js";
import { categoryMeta } from "../categories.js";
import { fallbackPhotoFor } from "../photo-fallback.js";

const SWIPE_THRESHOLD = 90;

export function renderSwipe(container, { places, onVote, onExit }) {
  const queue = [...places];
  let index = 0;
  let votedCount = 0;

  container.innerHTML = `<section class="explore explore--swipe"><div class="swipe-host"></div></section>`;
  const host = container.querySelector(".swipe-host");
  drawCurrentCard();

  function drawCurrentCard() {
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
    const meta = categoryMeta(place.category);
    const photo = place.photo_url || fallbackPhotoFor(meta.group);
    const summary = place.why_it_fits || place.description;

    host.innerHTML = `
      <div class="swipe-header">
        <span class="view-empty__hint">${index + 1} of ${queue.length}</span>
        <button type="button" class="swipe-exit-btn" aria-label="Exit swipe mode">✕</button>
      </div>
      <div class="swipe-card">
        <img class="swipe-card__img" src="${escapeHtml(photo)}" alt=""
             onerror="this.onerror=null; this.src='${escapeHtml(fallbackPhotoFor(meta.group))}';" />
        <div class="swipe-card__overlay">
          <p class="detail-hero__category">${meta.emoji} ${escapeHtml(meta.label)}</p>
          <h1>${escapeHtml(place.name)}</h1>
          <p class="detail-hero__meta">${escapeHtml(place.location_area || "")}</p>
          ${summary ? `<p class="swipe-card__summary">${escapeHtml(summary)}</p>` : ""}
        </div>
      </div>
      <div class="swipe-actions">
        <button type="button" class="swipe-btn swipe-btn--no" aria-label="Thumbs down">👎</button>
        <button type="button" class="swipe-btn swipe-btn--yes" aria-label="Thumbs up">👍</button>
      </div>
    `;

    host.querySelector(".swipe-exit-btn").addEventListener("click", onExit);
    host.querySelector(".swipe-btn--no").addEventListener("click", () => commit(place, -1));
    host.querySelector(".swipe-btn--yes").addEventListener("click", () => commit(place, 1));
    wireDrag(host.querySelector(".swipe-card"), place);
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
