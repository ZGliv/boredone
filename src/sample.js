// Fictional venues for an opt-in product walkthrough, never live recommendations.
const places = [
  { id: "sample-garden", name: "Riverbend Garden", category: "Garden", discoveryCategory: "outdoors", lat: 40.442, lng: -80.009, distanceKm: 1.1, address: "A fictional riverside stop in the sample neighborhood" },
  { id: "sample-cafe", name: "Little Fern Café", category: "Coffee shop", discoveryCategory: "food", lat: 40.445, lng: -79.999, distanceKm: 0.6, address: "A fictional café for a slow afternoon" },
  { id: "sample-gallery", name: "The Print Room", category: "Gallery", discoveryCategory: "culture", lat: 40.447, lng: -79.991, distanceKm: 0.9, address: "A fictional gallery around the corner" },
  { id: "sample-play", name: "Pocket Arcade", category: "Arcade", discoveryCategory: "play", lat: 40.438, lng: -79.997, distanceKm: 0.4, address: "A fictional spot for one more game" },
].map((place) => ({ ...place, source: "Sample", sourceUrl: "", website: "", hours: "Sample venue. No real opening hours.", fee: "Sample venue. No real admission price.", access: "Sample venue. Access not verified." }));
export function sampleResult(category = "all") {
  return { center: { lat: 40.44062, lng: -79.99589 }, radius: 3000, cityLabel: "Sample neighborhood", fetchedAt: new Date().toISOString(), category, places: places.filter((place) => category === "all" || place.discoveryCategory === category) };
}
