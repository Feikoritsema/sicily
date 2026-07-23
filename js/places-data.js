let cache = null;

export async function loadPlaces() {
  if (!cache) {
    const res = await fetch("./data/places.json");
    cache = await res.json();
  }
  return cache;
}

export function placesById(id) {
  return cache?.find((p) => p.id === id) || null;
}
