// Explicit venue taxonomy shared by retrieval, ranking and presentation.
// Broad map classes (e.g. attraction) are not evidence of an outing venue.
export const VENUE_GROUPS = {
 food: ['restaurant','bakery','ice_cream'],
 drinks: ['bar','pub','biergarten','nightclub','brewery','winery'],
 coffee: ['cafe','coffee_shop'],
 culture: ['cinema','theatre','theater','music_venue','comedy_club','historic_house'],
 play: ['bowling_alley','miniature_golf','escape_game','amusement_arcade','art_studio','factory_tour','bicycle_rental','dance_studio','trampoline_park','obstacle_course','cat_lounge','horseback_riding','pickleball_court','axe_throwing','ice_rink','mahjong','golf_simulator','tabletop_gaming'],
};
export const VENUE_KINDS = new Set(Object.values(VENUE_GROUPS).flat());
export const SPORTS_KINDS = ['bowling_alley','miniature_golf','bicycle_rental','trampoline_park','obstacle_course','horseback_riding','pickleball_court','ice_rink','golf_simulator'];
export const VENUE_MOODS = [{category:'food',label:'Food'},{category:'drinks',label:'Bars'},{category:'coffee',label:'Coffee'},{category:'culture',label:'Entertainment'},{category:'play',label:'Games & creative'},{category:'sports',label:'Sports'}];
export const normalizeKind = value => String(value || '').toLowerCase().trim().replace(/[ -]+/g,'_');
export function venueGroup(category) {
 const kind=normalizeKind(category);
 return Object.keys(VENUE_GROUPS).find(group=>VENUE_GROUPS[group].includes(kind)) || null;
}
export function isVenue(place) { return !!venueGroup(place.category); }
export function matchesVenueMood(place, mood) { return isVenue(place) && (mood==='all' || (mood==='sports' ? SPORTS_KINDS.includes(normalizeKind(place.category)) : mood==='play' ? venueGroup(place.category)==='play' && !SPORTS_KINDS.includes(normalizeKind(place.category)) : venueGroup(place.category)===mood)); }
