// "Feitjesspel!" — 438 verified "guess the number" trivia facts (real,
// sourced numbers — see context/fact_game_*.md for the research). Static
// content, fetched once and cached, same pattern as places-data.js.

let cache = null;

export async function loadFactGame() {
  if (!cache) {
    const res = await fetch("./data/fact-game.json");
    cache = await res.json();
  }
  return cache;
}

// Avoids immediately repeating whatever fact was just shown, when the pool is large enough to.
export function randomFact(exclude) {
  if (!cache || cache.length === 0) return null;
  if (cache.length === 1) return cache[0];
  let pick;
  do {
    pick = cache[Math.floor(Math.random() * cache.length)];
  } while (exclude && pick.question === exclude.question);
  return pick;
}
