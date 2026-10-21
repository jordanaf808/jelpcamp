// Pins what the two map scripts read from the page. The map keys only work on
// the live hostnames, so nobody sees a map before a deploy. A template change
// that drops one of these attributes, or loads a script in the wrong order,
// breaks a map with no error anywhere but the browser console. This fails
// first.
//
// public/js/map.js (Mapbox, on /campsites and /campsites/search) reads
//   #map[data-token], and #map[data-campsites] as {features: [...]}.
//   mapbox-gl.js must load before it.
// public/js/gmap.js (Google, on the campsite page) reads
//   #map[data-lat], [data-lng], [data-name] and [data-map-id].
//   public/js/gmapLoader.js reads [data-maps-key] and must load before gmap.js.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const list = require('./fixtures/ridb-facilities-list-full.json')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'

let app

test.before(async () => {
	process.env.MAPBOX_API_KEY = 'test-mapbox-token'
	process.env.MAPS_API_KEY = 'test-maps-key'
	process.env.MAPS_MAP_ID = 'test-map-id'
	delete process.env.IS_PULL_REQUEST
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const ENTITIES = {'&#34;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>'}
const unescape = (value) =>
	value
		.replace(/&#34;|&#39;|&lt;|&gt;/g, (entity) => ENTITIES[entity])
		.replace(/&amp;/g, '&')

// The attributes of the one element with id="map", in either quote style.
const mapAttributes = (html) => {
	const elements = [...html.matchAll(/<\w+\b([^>]*\bid="map"[^>]*)>/g)]
	assert.strictEqual(elements.length, 1, 'the page should have one #map')
	const attributes = {}
	for (const [, name, double, single] of elements[0][1].matchAll(
		/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g,
	)) {
		attributes[name] = unescape(double ?? single)
	}
	return attributes
}

// Where a script with this file name first loads, or -1.
const scriptAt = (html, file) =>
	html.search(new RegExp(`<script\\b[^>]*\\bsrc="[^"]*/${file}"`))

const assertMapboxContract = (res) => {
	assert.strictEqual(res.status, 200)
	const map = mapAttributes(res.text)

	assert.strictEqual(map['data-token'], 'test-mapbox-token')

	const campsites = JSON.parse(map['data-campsites'])
	assert.ok(Array.isArray(campsites.features), 'data-campsites has features')
	// The fixture's fourth facility has no coordinates and is left out.
	assert.strictEqual(campsites.features.length, 3)
	for (const feature of campsites.features) {
		const [lng, lat] = feature.geometry.coordinates
		assert.strictEqual(typeof lng, 'number')
		assert.strictEqual(typeof lat, 'number')
		assert.strictEqual(typeof feature.properties.title, 'string')
		assert.strictEqual(typeof feature.properties.type, 'string')
		assert.ok(feature.id, 'a feature needs its facility id for the popup link')
	}
	assert.deepStrictEqual(
		campsites.features.map((feature) => feature.id),
		['233115', '900001', '900002'],
	)

	const mapbox = scriptAt(res.text, 'mapbox-gl\\.js')
	const mapJs = scriptAt(res.text, 'js/map\\.js')
	assert.notStrictEqual(mapbox, -1, 'mapbox-gl.js should load')
	assert.notStrictEqual(mapJs, -1, 'map.js should load')
	assert.ok(mapbox < mapJs, 'mapbox-gl.js must load before map.js')
}

test('/campsites gives map.js its token and campsites', async () => {
	nock(RIDB).get('/api/v1/facilities').query(true).reply(200, list)
	assertMapboxContract(await request(app).get('/campsites'))
})

test('/campsites/search gives map.js its token and campsites', async () => {
	nock(RIDB).get('/api/v1/facilities').query(true).reply(200, list)
	assertMapboxContract(
		await request(app).get('/campsites/search?search=contract'),
	)
})

test('the campsite page gives gmap.js and its loader what they read', async () => {
	nock(RIDB).get('/api/v1/facilities/233115').query(true).reply(200, facility)

	const res = await request(app).get('/campsites/show/233115')
	assert.strictEqual(res.status, 200)
	const map = mapAttributes(res.text)

	const [lng, lat] = facility.GEOJSON.COORDINATES
	assert.strictEqual(Number(map['data-lat']), lat)
	assert.strictEqual(Number(map['data-lng']), lng)
	assert.strictEqual(map['data-name'], facility.FacilityName)
	assert.strictEqual(map['data-map-id'], 'test-map-id')
	assert.strictEqual(map['data-maps-key'], 'test-maps-key')

	const loader = scriptAt(res.text, 'js/gmapLoader\\.js')
	const gmap = scriptAt(res.text, 'js/gmap\\.js')
	assert.notStrictEqual(loader, -1, 'gmapLoader.js should load')
	assert.notStrictEqual(gmap, -1, 'gmap.js should load')
	assert.ok(loader < gmap, 'gmapLoader.js must load before gmap.js')
})
