// Boredone's own icon set: drawn on a 24 grid, one 1.6 px round stroke, no
// fills. Each entry is one SVG path string. Add new icons here in the same
// hand; never import another icon library.
import { normalizeKind, venueGroup } from "../venues.js";

export const ICONS = {
  // Navigation
  map: "M3.6 6.3 9 4.1l6 2.3 5.4-2.1v13.5L15 20l-6-2.3-5.4 2.1Z M9 4.1v13.6 M15 6.4V20",
  pile: "M4.4 8.6 12 4.8l7.6 3.8L12 12.3Z M4.4 12.5l7.6 3.7 7.6-3.7 M4.4 16.3 12 20l7.6-3.7",
  board: "M4.5 4.5h3.2v3.2H4.5Z M10.4 4.5h3.2v3.2h-3.2Z M16.3 4.5h3.2v3.2h-3.2Z M4.5 10.4h3.2v3.2H4.5Z M10.4 10.4h3.2v3.2h-3.2Z M16.3 10.4h3.2v3.2h-3.2Z M4.5 16.3h3.2v3.2H4.5Z M10.4 16.3h3.2v3.2h-3.2Z M16.3 16.3h3.2v3.2h-3.2Z",
  journal: "M5.6 18.4V5.2c0-.8.6-1.4 1.4-1.4h11.4v13.6H7.1c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5h11.3 M14.2 3.8v6.1l-1.9-1.3-1.9 1.3V3.8",
  settings: "M4 7.2h8.6 M16.6 7.2H20 M14.6 5v4.4 M4 16.8h3.4 M11.4 16.8H20 M9.4 14.6V19",

  // Actions
  add: "M12 5v14 M5 12h14",
  check: "M5 12.6l4.4 4.3L19 7.2",
  close: "M6.5 6.5l11 11 M17.5 6.5l-11 11",
  back: "M14.8 5.2 8 12l6.8 6.8",
  forward: "M9.2 5.2 16 12l-6.8 6.8",
  down: "M6.2 9.4 12 15.2l5.8-5.8",
  directions: "M4.6 19v-4.6c0-2 1.6-3.6 3.6-3.6h11 M15.2 6.8l4 4-4 4",
  shuffle: "M4 7.2h3c2 0 3.1.8 4.2 2.5l1.8 2.9c1.1 1.7 2.2 2.4 4.2 2.4H20 M17.6 12.6 20 15l-2.4 2.4 M4 15h3c1 0 1.7-.2 2.4-.7 M13.8 9.4c.8-1.4 1.8-2.2 3.4-2.2H20 M17.6 4.8 20 7.2l-2.4 2.4",
  clock: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z M12 7.6V12l2.9 1.9",
  link: "M10.4 13.6a3.4 3.4 0 0 0 4.8 0l3-3a3.4 3.4 0 0 0-4.8-4.8l-1 1 M13.6 10.4a3.4 3.4 0 0 0-4.8 0l-3 3a3.4 3.4 0 0 0 4.8 4.8l1-1",
  note: "M6 3.8h8.6l3.4 3.4v13H6Z M14.4 3.8v3.6H18 M9 11.6h6 M9 14.8h6 M9 18h3.4",
  place: "M12 20.4s6-5.5 6-10.4a6 6 0 0 0-12 0c0 4.9 6 10.4 6 10.4Z M12 10h.01",
  locate: "M4.4 11.4 19.4 4.6l-6.8 15-1.6-6.2Z",

  // Kinds of place
  food: "M6.2 3.6v5.2a2.4 2.4 0 0 0 4.8 0V3.6 M8.6 3.6v16.8 M17.6 20.4V3.6c-2 1.3-3 3.9-3 7.3h3",
  bakery: "M4.4 13a7.6 5.4 0 0 1 15.2 0v5.6c0 .6-.5 1-1 1H5.4c-.6 0-1-.4-1-1Z M9 9.4l1.6 3.2 M13.2 8.6l1.6 3.2",
  icecream: "M7.4 10.4h9.2 M7.4 10.4a4.6 4.6 0 0 1 9.2 0 M8 10.4l4 10 4-10",
  cocktail: "M4.4 5h15.2L12 13.2Z M12 13.2v7 M8 20.2h8 M15.8 2.8l-2 4",
  beer: "M6 7.2h9v11.6c0 .9-.7 1.6-1.6 1.6H7.6c-.9 0-1.6-.7-1.6-1.6Z M15 10.2h1.8c1.2 0 2.2 1 2.2 2.2v2.4c0 1.2-1 2.2-2.2 2.2H15 M6 7.2c0-1.6 2.2-2.6 3.4-1.6.7-1.4 3.4-1.4 4.2.3.9-.2 1.4.4 1.4 1.3 M9.4 11v6 M11.8 11v6",
  wine: "M8 3.6h8l.4 4a4.4 4.4 0 0 1-8.8 0Z M12 12v8.4 M8.6 20.4h6.8",
  coffee: "M4.8 9.2h11v5.2a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z M15.8 10.6h1.5a2.3 2.3 0 0 1 0 4.6h-1.5 M8.8 3.6c-.8 1 .8 2 0 3 M12.2 3.6c-.8 1 .8 2 0 3",
  film: "M4.4 5.4h15.2v13.2H4.4Z M8 5.4v13.2 M16 5.4v13.2 M4.4 9.6H8 M4.4 14.4H8 M16 9.6h3.6 M16 14.4h3.6",
  theatre: "M3.6 4.4h16.8 M5 4.4c0 6 1.5 10.2 4.6 12.2 M19 4.4c0 6-1.5 10.2-4.6 12.2 M3.6 19.6h16.8",
  music: "M9 17.4V5.6l10-2v11.8 M9 17.4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z M19 15.4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  mic: "M9.6 4.6a2.4 2.4 0 0 1 4.8 0v5.8a2.4 2.4 0 0 1-4.8 0Z M6.6 10.4a5.4 5.4 0 0 0 10.8 0 M12 15.8v4.6 M9 20.4h6",
  dance: "M18 13a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z M6 13h12 M12 7c-2 1.8-2 10.2 0 12 M12 7c2 1.8 2 10.2 0 12 M12 3v4",
  play: "M5 5h14v14H5Z M9 9h.01 M15 9h.01 M12 12h.01 M9 15h.01 M15 15h.01",
  sports: "M6.4 20.6V3.6 M6.4 4.2h10.8l-2.4 3.6 2.4 3.6H6.4",
};

const KIND_ICONS = {
  restaurant: "food",
  bakery: "bakery",
  ice_cream: "icecream",
  bar: "cocktail",
  nightclub: "dance",
  dance_studio: "dance",
  pub: "beer",
  brewery: "beer",
  biergarten: "beer",
  winery: "wine",
  cafe: "coffee",
  coffee_shop: "coffee",
  cinema: "film",
  theatre: "theatre",
  theater: "theatre",
  music_venue: "music",
  comedy_club: "mic",
  historic_house: "theatre",
  bowling_alley: "sports",
  miniature_golf: "sports",
  bicycle_rental: "sports",
  horseback_riding: "sports",
  ice_rink: "sports",
  trampoline_park: "sports",
  obstacle_course: "sports",
  pickleball_court: "sports",
  golf_simulator: "sports",
};
const GROUP_ICONS = { food: "food", drinks: "cocktail", coffee: "coffee", culture: "theatre", play: "play" };

// The icon name for a place's category ("coffee_shop", "Music venue", ...).
export function kindIcon(category = "") {
  const kind = normalizeKind(category);
  return KIND_ICONS[kind] || GROUP_ICONS[venueGroup(kind)] || "place";
}
