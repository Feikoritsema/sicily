let routesCache = null;

export async function loadRoutes() {
  if (routesCache) return routesCache;
  const res = await fetch("./data/routes.json");
  if (!res.ok) throw new Error(`Failed to load routes: ${res.status}`);
  routesCache = await res.json();
  return routesCache;
}

export function getRoutes() {
  return routesCache || [];
}

export function routeById(id) {
  return (routesCache || []).find((r) => r.id === id) || null;
}

export function stopsByRouteId(routeId) {
  const route = routeById(routeId);
  return route ? route.stops : [];
}
