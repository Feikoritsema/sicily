// One representative photo per tag-color-group (§9.3), used when a place
// has no photo_url of its own. Hand-picked from Unsplash (license explicitly
// permits hotlinking/free use — https://unsplash.com/license) — no API key
// or account needed since these are a fixed, curated handful of URLs, not a
// live search.
export const GROUP_FALLBACK_PHOTO = {
  coast: "https://images.unsplash.com/photo-1663716535415-6c340ae68199?w=1200&q=80&auto=format&fit=crop",
  food: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=1200&q=80&auto=format&fit=crop",
  wine: "https://images.unsplash.com/photo-1718703357732-8c7aef2b6b51?w=1200&q=80&auto=format&fit=crop",
  culture: "https://images.unsplash.com/photo-1691165634940-459457b337f1?w=1200&q=80&auto=format&fit=crop",
  nature: "https://images.unsplash.com/photo-1741789597656-7200ecdbf3b4?w=1200&q=80&auto=format&fit=crop",
  nightlife: "https://images.unsplash.com/photo-1516961412704-d6726cf53803?w=1200&q=80&auto=format&fit=crop",
};

export function fallbackPhotoFor(group) {
  return GROUP_FALLBACK_PHOTO[group] || GROUP_FALLBACK_PHOTO.food;
}
