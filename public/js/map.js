console.log('map.js says hi!')

// Values are passed via data-attributes on #map so this file stays a static
// asset — the CSP allows script-src 'self' with no inline scripts.
const mapEl = document.getElementById('map')
const mapToken = mapEl.dataset.token
const campsites = JSON.parse(mapEl.dataset.campsites)

const map = new mapboxgl.Map({
	accessToken: mapToken,
	container: 'map',
	style: 'mapbox://styles/mapbox/dark-v10',
	center: [-113.787, 48.7596], // starting position [lng, lat] Glacial Nat'l Park.
	zoom: 2, // starting zoom
})

map.addControl(
	new mapboxgl.NavigationControl({showCompass: false}),
	'top-right',
)

map.on('load', function () {
	// Add a new source from our GeoJSON data and
	// set the 'cluster' option to true. GL-JS will
	// add the point_count property to your source data.
	map.addSource('campsites', {
		type: 'geojson',
		// Point to GeoJSON data. This example visualizes all M1.0+ earthquakes
		// from 12/22/15 to 1/21/16 as logged by USGS' Earthquake hazards program.
		data: campsites,
		cluster: true,
		clusterMaxZoom: 14, // Max zoom to cluster points on
		clusterRadius: 50, // Radius of each cluster when clustering points (defaults to 50)
	})

	map.addLayer({
		id: 'clusters',
		type: 'circle',
		source: 'campsites',
		filter: ['has', 'point_count'],
		paint: {
			// Step expressions (https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-step),
			// as the legend in views/partials/campsiteMap.ejs shows them:
			//   * 2 to 9 facilities: olive, radius 18
			//   * 10 or more: orange, radius 23
			'circle-color': [
				'step',
				['get', 'point_count'],
				'#c9d4a0',
				2,
				'#8a9a4b',
				10,
				'#e8792b',
			],
			'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23],
			'circle-stroke-width': 1,
			'circle-stroke-color': 'rgba(201, 212, 160, 0.4)',
		},
	})

	map.addLayer({
		id: 'cluster-count',
		type: 'symbol',
		source: 'campsites',
		filter: ['has', 'point_count'],
		layout: {
			'text-field': '{point_count_abbreviated}',
			'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
			'text-size': 12,
		},
		paint: {
			'text-color': '#0c0f08',
		},
	})

	map.addLayer({
		id: 'unclustered-point',
		type: 'circle',
		source: 'campsites',
		filter: ['!', ['has', 'point_count']],
		paint: {
			'circle-color': '#c9d4a0',
			'circle-radius': 7,
			'circle-stroke-width': 2,
			'circle-stroke-color': '#0c0f08',
		},
	})

	// inspect a cluster on click
	map.on('click', 'clusters', function (e) {
		var features = map.queryRenderedFeatures(e.point, {
			layers: ['clusters'],
		})
		var clusterId = features[0].properties.cluster_id
		map
			.getSource('campsites')
			.getClusterExpansionZoom(clusterId, function (err, zoom) {
				if (err) return

				map.easeTo({
					center: features[0].geometry.coordinates,
					zoom: zoom,
				})
			})
	})

	// When a click event occurs on a feature in
	// the unclustered-point layer, open a popup at
	// the location of the feature, built from its properties.
	//
	// Content is assembled as DOM nodes and handed to setDOMContent, not built as
	// an HTML string for setHTML. The name and type come from the RIDB API, so an
	// HTML string would interpolate third-party text straight into markup. Same
	// reason gmap.js builds its InfoWindow with textContent.
	map.on('click', 'unclustered-point', function (e) {
		var coordinates = e.features[0].geometry.coordinates.slice()
		const name = e.features[0].properties.title
		const type = e.features[0].properties.type
		const id = e.features[0].id
		const geo = e.features[0].geometry.coordinates

		// Ensure that if the map is zoomed out such that
		// multiple copies of the feature are visible, the
		// popup appears over the copy being pointed to.
		while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
			coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360
		}

		// Styled in public/stylesheets/campsites.css. data-campsites is lower
		// case, so the CSS sets the name and type in capitals.
		const content = document.createElement('div')
		content.className = 'map-popup__body'

		const title = document.createElement('p')
		title.className = 'map-popup__name'
		title.textContent = name

		// e.g. "campground · 48.80°N 113.67°W"
		const meta = document.createElement('p')
		meta.className = 'map-popup__meta'
		meta.textContent =
			type +
			' · ' +
			Math.abs(geo[1]).toFixed(2) +
			(geo[1] < 0 ? '°S ' : '°N ') +
			Math.abs(geo[0]).toFixed(2) +
			(geo[0] < 0 ? '°W' : '°E')

		const link = document.createElement('a')
		// encodeURIComponent keeps a FacilityID from breaking out of the path.
		link.href = '/campsites/show/' + encodeURIComponent(id)
		link.className = 'map-popup__link'
		link.textContent = 'More information →'
		content.append(title, meta, link)

		new mapboxgl.Popup({className: 'map-popup', maxWidth: '260px'})
			.setLngLat(coordinates)
			.setDOMContent(content)
			.addTo(map)
	})

	map.on('mouseenter', 'clusters', function () {
		map.getCanvas().style.cursor = 'pointer'
	})
	map.on('mouseleave', 'clusters', function () {
		map.getCanvas().style.cursor = ''
	})
})
