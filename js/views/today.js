import { TRIP_START, TRIP_END, TRIP_DATES, SPECIAL_OCCASIONS, SPOTIFY_PLAYLIST_URL } from "../constants.js";
import { escapeHtml, retryStateHtml } from "../util.js";
import { loadPlaces, placesById } from "../places-data.js";
import { categoryMeta, isClosedOnDate } from "../categories.js";
import { dayPlanStore, dayPlanDaysStore } from "../day-plan.js";
import { randomFunFact } from "../fun-facts.js";
import { localStore } from "../local-store.js";
import { votesStore } from "../votes.js";
import { peopleStore } from "../people.js";
import { quickPollsStore, quickPollVotesStore } from "../quick-polls.js";
import { loadFactGame, randomFact } from "../fact-game.js";

const SLOT_ORDER = ["morning", "afternoon", "evening", ""];
const SLOT_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", "": "Unscheduled" };
const MAX_POLL_OPTIONS = 4;

let listenersAttached = false;
let mountedContainer = null;
let deferredInstallPrompt = null;
let pollFormOpen = false;
let factGameState = { fact: null, revealed: false };

// #app is shared/reused across every view — a store's onChange listener fires
// for the app's whole lifetime even after the user has navigated away from
// Today, so every re-render here must first confirm Today is still the
// mounted view (same guard pattern as explore.js/dayplan.js/lists.js/info.js).
function isTodayMounted(container) {
  return !!container.querySelector(".today, .today-empty");
}

// Chrome/Android fires this when the PWA install criteria are met; iOS Safari never
// fires it (no such API there), so the hint below falls back to manual instructions.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (mountedContainer && isTodayMounted(mountedContainer)) renderContent(mountedContainer);
});

export async function render(container, { isActive } = {}) {
  mountedContainer = container;
  container.innerHTML = `<section class="view-empty"><h1>Today</h1><p class="view-empty__hint">Loading…</p></section>`;

  try {
    await loadPlaces();
  } catch {
    container.innerHTML = retryStateHtml("Today");
    container.querySelector("[data-retry-load]")?.addEventListener("click", () => render(container, { isActive }));
    return;
  }

  await dayPlanStore.load();
  await dayPlanDaysStore.load();
  await votesStore.load();
  await peopleStore.load();
  await quickPollsStore.load();
  await quickPollVotesStore.load();

  // Feitjesspel is a bonus/optional feature — a failed fetch shouldn't block
  // the rest of Today (day plan, checklist, etc.) the way the critical
  // places.json load above does, so this failure is caught locally and just
  // means the card doesn't render, rather than the whole view failing.
  try {
    await loadFactGame();
    if (!factGameState.fact) factGameState.fact = randomFact();
  } catch {
    // no fact pool available this session — factGameHtml() renders nothing
  }

  if (isActive && !isActive()) return;

  if (!listenersAttached) {
    listenersAttached = true;
    const refresh = () => {
      if (!isTodayMounted(container)) return;
      renderContent(container);
    };
    dayPlanStore.onChange(refresh);
    dayPlanDaysStore.onChange(refresh);
    votesStore.onChange(refresh);
    peopleStore.onChange(refresh);
    quickPollsStore.onChange(refresh);
    quickPollVotesStore.onChange(refresh);
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

function specialOccasionLines(now) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return SPECIAL_OCCASIONS.map((occ) => {
    const diffDays = Math.ceil((new Date(occ.date) - now) / msPerDay);
    if (diffDays < 0) return null;
    if (diffDays === 0) return `${occ.emoji} Happy ${occ.label}, ${occ.person}! 🎉`;
    return `${occ.emoji} ${diffDays} day${diffDays === 1 ? "" : "s"} until ${occ.person}'s ${occ.label}`;
  }).filter(Boolean);
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

function quickLinksHtml() {
  return `
    <div class="today-quicklinks">
      <a class="edit-group-info-link" href="#info">🆘 Emergency card</a>
      <a class="edit-group-info-link" href="${SPOTIFY_PLAYLIST_URL}" target="_blank" rel="noopener">🎵 Trip Playlist</a>
    </div>`;
}

function greetingHtml() {
  const name = localStore.getProfileName();
  return name ? `<p class="today__greeting">Welcome back, ${escapeHtml(name)} 👋</p>` : "";
}

// One trip-wide poll "live" at a time (see quick-polls.js's current()) — anyone
// can start one, vote, or close it once decided, matching this app's existing
// no-per-action-ownership permission model (5 trusted people, no auth).
function pollFormHtml() {
  return `
    <form class="poll-form">
      <input type="text" name="question" placeholder="Quick poll question…" required />
      <input type="text" name="option0" placeholder="Option A" required />
      <input type="text" name="option1" placeholder="Option B" required />
      <input type="text" name="option2" placeholder="Option C (optional)" />
      <input type="text" name="option3" placeholder="Option D (optional)" />
      <div class="poll-form__actions">
        <button type="submit">Start poll</button>
        <button type="button" data-cancel-poll-form>Cancel</button>
      </div>
    </form>`;
}

function pollHtml() {
  const poll = quickPollsStore.current();

  if (!poll) {
    return `
      <div class="poll-card">
        ${pollFormOpen ? pollFormHtml() : `<button type="button" class="poll-start-btn" data-start-poll>📊 Start a quick poll</button>`}
      </div>`;
  }

  const name = localStore.getProfileName();
  const myChoice = name ? quickPollVotesStore.myChoiceFor(poll.id, name) : null;
  const rows = poll.options
    .map((opt) => {
      const count = quickPollVotesStore.tallyFor(poll.id, opt);
      return `
        <button type="button" class="poll-option ${opt === myChoice ? "is-mine" : ""}" data-choice="${escapeHtml(opt)}">
          <span>${escapeHtml(opt)}</span>
          <span class="poll-option__count">${count}</span>
        </button>`;
    })
    .join("");

  return `
    <div class="poll-card">
      <div class="poll-card__header">
        <p class="poll-card__question">📊 ${escapeHtml(poll.question)}</p>
        <button type="button" class="poll-card__close" data-close-poll>✕ Done</button>
      </div>
      <div class="poll-options">${rows}</div>
    </div>`;
}

function wirePoll(container) {
  container.querySelector("[data-start-poll]")?.addEventListener("click", () => {
    pollFormOpen = true;
    renderContent(container);
  });
  container.querySelector("[data-cancel-poll-form]")?.addEventListener("click", () => {
    pollFormOpen = false;
    renderContent(container);
  });
  container.querySelector(".poll-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = localStore.getProfileName();
    if (!name) return;
    const data = new FormData(e.target);
    const question = data.get("question").trim();
    const options = Array.from({ length: MAX_POLL_OPTIONS }, (_, i) => data.get(`option${i}`).trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    pollFormOpen = false;
    quickPollsStore.create(question, options, name);
  });
  container.querySelectorAll("[data-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = localStore.getProfileName();
      const poll = quickPollsStore.current();
      if (!name || !poll) return;
      quickPollVotesStore.cast(poll.id, name, btn.dataset.choice);
    });
  });
  container.querySelector("[data-close-poll]")?.addEventListener("click", () => {
    const poll = quickPollsStore.current();
    if (poll) quickPollsStore.close(poll.id);
  });
}

// A Dutch friend-group trivia tradition: someone names a fact ("how many
// liters of wine did Italy drink in 2024?"), everyone guesses out loud, then
// reveals the real number. Question-only until "Reveal," then a fresh fact
// is one tap away — no scoring/multiplayer state, just "give me a random
// fact" per the actual ask.
function factGameHtml() {
  const f = factGameState.fact;
  if (!f) return "";

  return `
    <div class="fact-game-card">
      <div class="fact-game-card__header">
        <p class="fact-game-card__label">🎲 Feitjesspel!</p>
        <span class="fact-game-card__category">${f.emoji} ${escapeHtml(f.category)}</span>
      </div>
      <p class="fact-game-card__question">${escapeHtml(f.question)}</p>
      ${
        factGameState.revealed
          ? `<p class="fact-game-card__answer">${escapeHtml(f.answer)}</p>
             ${f.note ? `<p class="fact-game-card__note">${escapeHtml(f.note)}</p>` : ""}
             <button type="button" class="fact-game-card__next" data-next-fact>🎲 Next fact</button>`
          : `<button type="button" class="fact-game-card__reveal" data-reveal-fact>Reveal the number</button>`
      }
    </div>`;
}

function wireFactGame(container) {
  container.querySelector("[data-reveal-fact]")?.addEventListener("click", () => {
    factGameState.revealed = true;
    renderContent(container);
  });
  container.querySelector("[data-next-fact]")?.addEventListener("click", () => {
    factGameState = { fact: randomFact(factGameState.fact), revealed: false };
    renderContent(container);
  });
}

// Auto-detected from real app state (not manually checked off) — each item
// reflects something the person has actually done, so it stays honest for
// both a brand-new person and someone who's already been using the app.
function checklistItems(name) {
  const packing = localStore.getPersonalPacking() || {};
  const packingTouched = Object.values(packing).some((items) => (items || []).some((i) => i.checked || i.custom));

  const me = peopleStore.get(name);
  const groupInfoFilled = !!(
    me &&
    (me.dietary_restrictions || me.flight_arrival || me.flight_departure || me.special_occasion || me.insurance_info || me.comfortable_night_driving)
  );

  const visited = localStore.getVisitedTabs();

  return [
    { emoji: "🗺️", label: "Browse Explore and vote on a place", done: votesStore.hasAnyVoteBy(name), href: "#explore" },
    { emoji: "🎒", label: "Check off or add a packing item", done: packingTouched, href: "#lists" },
    { emoji: "✏️", label: "Fill in your Group Info", done: groupInfoFilled, href: "#profile" },
    { emoji: "📅", label: "Take a look at the Day Planner", done: visited.includes("dayplan"), href: "#dayplan" },
    { emoji: "ℹ️", label: "Check Practical Info & the Emergency card", done: visited.includes("info"), href: "#info" },
  ];
}

function checklistHtml() {
  const name = localStore.getProfileName();
  if (!name || localStore.isChecklistDismissed()) return "";

  const items = checklistItems(name);
  if (items.every((i) => i.done)) return ""; // fully onboarded — stop taking up space

  const rows = items
    .map(
      (i) => `
      <a class="checklist-item ${i.done ? "is-done" : ""}" href="${i.href}">
        <span class="checklist-item__check">${i.done ? "✅" : "☐"}</span>
        <span>${escapeHtml(i.label)}</span>
      </a>`
    )
    .join("");

  return `
    <div class="checklist-card">
      <div class="checklist-card__header">
        <p class="checklist-card__title">👋 Getting started</p>
        <button type="button" class="checklist-card__dismiss" data-dismiss-checklist aria-label="Dismiss">✕</button>
      </div>
      ${rows}
    </div>`;
}

function wireChecklist(container) {
  container.querySelector("[data-dismiss-checklist]")?.addEventListener("click", () => {
    localStore.dismissChecklist();
    renderContent(container);
  });
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function installHintHtml() {
  if (isStandaloneDisplay() || localStore.isInstallHintDismissed()) return "";

  if (isIOSDevice()) {
    return `
      <div class="install-hint">
        <span>📲 Add this to your Home Screen: tap <strong>Share</strong> (<strong>Deel</strong>) → <strong>Add to Home Screen</strong> (<strong>Zet op Beginscherm</strong>) — works offline once installed.</span>
        <button type="button" class="install-hint__dismiss" data-dismiss-install aria-label="Dismiss">✕</button>
      </div>`;
  }

  if (deferredInstallPrompt) {
    return `
      <div class="install-hint">
        <span>📲 Install this app for one-tap access and full offline use.</span>
        <button type="button" class="install-hint__action" data-install-action>Install</button>
        <button type="button" class="install-hint__dismiss" data-dismiss-install aria-label="Dismiss">✕</button>
      </div>`;
  }

  return "";
}

function wireInstallHint(container) {
  container.querySelector("[data-dismiss-install]")?.addEventListener("click", () => {
    localStore.dismissInstallHint();
    renderContent(container);
  });
  container.querySelector("[data-install-action]")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    renderContent(container);
  });
}

function renderContent(container) {
  const now = new Date();
  const { label, todayDate } = tripStatus(now);
  const occasionLines = specialOccasionLines(now);

  if (!todayDate) {
    container.innerHTML = `
      <section class="view-empty today-empty">
        <h1>Today</h1>
        ${greetingHtml()}
        ${checklistHtml()}
        ${pollHtml()}
        ${factGameHtml()}
        ${installHintHtml()}
        <p class="today__status">${label}</p>
        ${occasionLines.map((l) => `<p class="today__status today__status--occasion">${l}</p>`).join("")}

        <div class="fun-fact-card">
          <p class="fun-fact-card__label">🍋 Did you know?</p>
          <p class="fun-fact-card__text">${escapeHtml(randomFunFact())}</p>
        </div>

        ${quickLinksHtml()}
      </section>
    `;
    wireInstallHint(container);
    wireChecklist(container);
    wirePoll(container);
    wireFactGame(container);
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
      ${greetingHtml()}
      ${checklistHtml()}
      ${pollHtml()}
      ${factGameHtml()}
      ${installHintHtml()}
      <p class="today__status">${label}</p>
      ${occasionLines.map((l) => `<p class="today__status today__status--occasion">${l}</p>`).join("")}

      ${banners.map((b) => `<p class="today-banner">${b}</p>`).join("")}

      ${day.notes ? `<p class="detail-text detail-text--why">📝 ${escapeHtml(day.notes)}</p>` : ""}
      ${day.designated_driver ? `<p class="detail-text">🚗 Designated driver tonight: <strong>${escapeHtml(day.designated_driver)}</strong></p>` : ""}

      ${planHtml}

      ${quickLinksHtml()}
    </section>
  `;
  wireInstallHint(container);
  wireChecklist(container);
  wirePoll(container);
  wireFactGame(container);
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
