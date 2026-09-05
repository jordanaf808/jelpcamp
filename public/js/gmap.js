// Google Maps callback for the campsite show page.
// Values are passed via data-attributes on #map so this file stays a static
// asset — the CSP allows script-src 'self' with no inline scripts.
// Must be global: the Maps loader invokes it via &callback=initMap.
function initMap() {
  const mapEl = document.getElementById('map');
  const center = {
    lat: Number(mapEl.dataset.lat),
    lng: Number(mapEl.dataset.lng),
  };

  const map = new google.maps.Map(mapEl, {
    zoom: 8,
    center: center,
    scrollwheel: false,
  });

  // Built as a DOM node rather than an HTML string so the facility name from
  // the RIDB API cannot inject markup.
  const title = document.createElement('h5');
  title.textContent = mapEl.dataset.name;
  const infowindow = new google.maps.InfoWindow({ content: title });

  const marker = new google.maps.Marker({ position: center, map: map });
  marker.addListener('click', function () {
    infowindow.open(map, marker);
  });
}
