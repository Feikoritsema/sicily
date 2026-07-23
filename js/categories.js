// Category taxonomy per implementation_plan.md §8, tag-color groups per §9.3, emoji per §9.4.
export const CATEGORY_META = {
  beach_club: { emoji: "🏖️", group: "coast", label: "Beach Clubs" },
  wild_beach: { emoji: "🌊", group: "coast", label: "Wild Beaches" },
  boat_activity: { emoji: "🚤", group: "coast", label: "Boat Trips" },
  restaurant_casual: { emoji: "🍝", group: "food", label: "Casual Restaurants" },
  restaurant_fine_dining: { emoji: "⭐", group: "food", label: "Fine Dining" },
  bar_nightlife: { emoji: "🍷", group: "nightlife", label: "Bars & Nightlife" },
  winery: { emoji: "🍇", group: "wine", label: "Wineries" },
  food_experience: { emoji: "👩‍🍳", group: "food", label: "Food Experiences" },
  culture_town: { emoji: "🏛️", group: "culture", label: "Baroque Towns" },
  culture_landmark: { emoji: "🏛️", group: "culture", label: "Landmarks" },
  cafe_dessert: { emoji: "🍋", group: "food", label: "Cafés & Dessert" },
  nature_hike: { emoji: "🥾", group: "nature", label: "Nature & Hiking" },
  day_trip: { emoji: "🚗", group: "nature", label: "Day Trips" },
  adventure_activity: { emoji: "🐴", group: "nature", label: "Adventure" },
};

export function categoryMeta(category) {
  return CATEGORY_META[category] || { emoji: "📍", group: "food", label: category };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isClosedToday(place, date = new Date()) {
  const weekday = WEEKDAYS[date.getDay()];
  return Array.isArray(place.closed_days) && place.closed_days.includes(weekday);
}

// For a "YYYY-MM-DD" trip date (as stored in day_plan_days/day_plan_assignments)
// rather than "today" — parsed at noon local time so no timezone can roll it
// onto the adjacent day the way midnight-UTC parsing sometimes does.
export function isClosedOnDate(place, dateStr) {
  return isClosedToday(place, new Date(`${dateStr}T12:00:00`));
}

export function weekdayName(dateStr) {
  return WEEKDAYS[new Date(`${dateStr}T12:00:00`).getDay()];
}
