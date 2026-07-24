export const TRIP_START = "2026-09-25";
export const TRIP_END = "2026-10-03";

export const TRIP_DATES = Array.from({ length: 9 }, (_, i) => {
  const d = new Date(TRIP_START);
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});

export const VILLA = {
  name: "Villa Suq",
  address: "Via San Michele Arcangelo, 24, 96017 Noto (SR)",
  phone: "+39 333 2631840",
};

// Placeholder — swap for the real shared playlist link once Feiko sends it.
export const SPOTIFY_PLAYLIST_URL = "https://open.spotify.com/playlist/";

// No traveler names are hardcoded here on purpose — the doc never names the
// 5 travelers, so the profile view's name picker starts empty and falls back
// to "type your name" until people have picked once (see js/views/profile.js).
export const KNOWN_NAMES = [];

// Egbert's birthday falls during the trip (Oct 2, day 8 of 9) — shown on
// Today as its own small countdown alongside the main trip status.
export const SPECIAL_OCCASIONS = [{ person: "Egbert", label: "birthday", date: "2026-10-02", emoji: "🎂" }];
