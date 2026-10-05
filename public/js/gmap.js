// Draws the Google map on the campsite show page.
// Values are passed via data-attributes on #map so this file stays a static
// asset — the CSP allows script-src 'self' with no inline scripts.
// gmapLoader.js must load first: it defines google.maps.importLibrary().
async function initMap() {
	// Each call resolves once that part of the API is loaded and has filled in
	// its classes under google.maps. The first call fetches the API itself.
	await google.maps.importLibrary('maps')
	await google.maps.importLibrary('marker')

	const mapEl = document.getElementById('map')
	const center = {
		lat: Number(mapEl.dataset.lat),
		lng: Number(mapEl.dataset.lng),
	}

	const map = new google.maps.Map(mapEl, {
		zoom: 8,
		center: center,
		scrollwheel: false,
		mapId: mapEl.dataset.mapId,
	})

	// Built as a DOM node rather than an HTML string so the facility name from
	// the RIDB API cannot inject markup.
	const title = document.createElement('h5')
	title.textContent = mapEl.dataset.name
	const infowindow = new google.maps.InfoWindow({content: title})

	// gmp-click only fires when gmpClickable is true; it defaults to false.
	const marker = new google.maps.marker.AdvancedMarkerElement({
		position: center,
		map: map,
		gmpClickable: true,
	})
	marker.addEventListener('gmp-click', function () {
		infowindow.open(map, marker)
	})
}

initMap()
