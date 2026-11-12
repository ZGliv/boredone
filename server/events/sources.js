// Public calendars that were checked by hand (11 Nov 2026): each answered a single GET
// with the stated format and its robots.txt allows the path. A source is only asked
// when the search centre falls inside its area. None of these publish coordinates,
// so their events arrive with lat/lng null until they are matched to a known place.
const PITTSBURGH = { lat: 40.4406, lng: -79.9959, radiusKm: 30 };
export const CITY_SOURCES = [
  { id: "shadyave", kind: "ical", name: "Shady Ave", url: "https://shadyave.com/events/month/?ical=1", home: "https://shadyave.com/events/", area: PITTSBURGH, timeZone: "America/New_York" },
  { id: "sustainable-pittsburgh", kind: "ical", name: "Sustainable Pittsburgh", url: "https://sustainablepittsburgh.org/events-calendar/?ical=1", home: "https://sustainablepittsburgh.org/events-calendar/", area: PITTSBURGH, timeZone: "America/New_York" },
  { id: "city-of-asylum", kind: "jsonld", name: "City of Asylum", url: "https://cityofasylum.org/events/", home: "https://cityofasylum.org/events/", area: PITTSBURGH, timeZone: "America/New_York" },
];
