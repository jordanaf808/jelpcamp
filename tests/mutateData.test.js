// Pins what utils/mutateData.js gives the list pages for each facility. The
// redesigned cards read photo, state and recAreaName, and the map popups read
// lat and lng. map.js reads mapData.
//
// The fixture is a RECDATA list built from the captured facility 233115 plus
// three variants: no photos, address or rec area (900001); a video listed
// before photos with none marked primary (900002); no coordinates (900003).
const test = require('node:test')
const assert = require('node:assert')
const mutateData = require('../utils/mutateData')
const list = require('./fixtures/ridb-facilities-list-full.json')

const {recData, mapData} = mutateData(list.RECDATA)
const facility = (id) => recData.find((item) => item.FacilityID === id)
const source = (id) => list.RECDATA.find((item) => item.FacilityID === id)

test('a facility without coordinates is left out of both lists', () => {
	assert.deepStrictEqual(
		recData.map((item) => item.FacilityID),
		['233115', '900001', '900002'],
	)
	assert.deepStrictEqual(
		mapData.map((feature) => feature.id),
		['233115', '900001', '900002'],
	)
})

test('photo is the primary image', () => {
	const primary = source('233115').MEDIA.find((media) => media.IsPrimary)
	// The fixture's primary image is not its first, so this tells them apart.
	assert.notStrictEqual(primary, source('233115').MEDIA[0])
	assert.strictEqual(facility('233115').photo, primary.URL)
})

test('with no primary image, photo is the first image, not a video', () => {
	const media = source('900002').MEDIA
	assert.strictEqual(media[0].MediaType, 'Video')
	assert.strictEqual(facility('900002').photo, media[1].URL)
})

test('photo is null when the facility has no images', () => {
	assert.strictEqual(facility('900001').photo, null)
})

test('state is the first address state code, and null with no address', () => {
	assert.strictEqual(facility('233115').state, 'OR')
	assert.strictEqual(facility('900002').state, 'WA')
	assert.strictEqual(facility('900001').state, null)
})

test('recAreaName is the parent rec area name, and null with none', () => {
	assert.strictEqual(
		facility('233115').recAreaName,
		'Wallowa Whitman National Forest',
	)
	assert.strictEqual(facility('900001').recAreaName, null)
})

// GEOJSON.COORDINATES is [lng, lat], the GeoJSON order.
test('lat and lng come from GEOJSON, which lists longitude first', () => {
	assert.strictEqual(facility('233115').lat, 44.4149)
	assert.strictEqual(facility('233115').lng, -118.0107)
})

// A record from a request without full: true has none of the nested lists.
test('a record without MEDIA, FACILITYADDRESS or RECAREA gets nulls, not an error', () => {
	const bare = {
		FacilityID: '1',
		FacilityName: 'Bare',
		FacilityDescription: '',
		GEOJSON: {COORDINATES: [-100, 40], TYPE: 'Point'},
	}
	const [item] = mutateData([bare]).recData
	assert.strictEqual(item.photo, null)
	assert.strictEqual(item.state, null)
	assert.strictEqual(item.recAreaName, null)
})

// public/js/map.js reads exactly these from each feature.
test('each map feature keeps the shape map.js reads', () => {
	const [feature] = mapData
	assert.deepStrictEqual(Object.keys(feature).sort(), [
		'geometry',
		'id',
		'properties',
	])
	assert.deepStrictEqual(feature.properties, {
		title: 'UNION CREEK CAMPGROUND',
		type: 'Campground',
	})
	assert.deepStrictEqual(feature.geometry, source('233115').GEOJSON)
})

test('descriptions are still sanitized', () => {
	const [item] = mutateData([
		{
			...source('233115'),
			FacilityDescription: '<p>ok</p><script>alert(1)</script>',
		},
	]).recData
	assert.strictEqual(item.FacilityDescription, '<p>ok</p>')
})

// The cards show summary, a plain-text version of the description. The
// sanitized HTML keeps RIDB's links, which the card's 3-line clamp would hide
// while Tab still reached them.
const summaryOf = (html) =>
	mutateData([{...source('233115'), FacilityDescription: html}]).recData[0]
		.summary

test('summary is the description as plain text, with no tags', () => {
	assert.strictEqual(
		facility('900001').summary,
		'A trailhead with no photos and no parent area.',
	)
	const summary = facility('233115').summary
	assert.strictEqual(typeof summary, 'string')
	assert.doesNotMatch(summary, /<\/?[a-z][^>]*>/i)
	assert.match(summary, /^One of Eastern Oregon’s largest/)
})

test('summary drops links, keeping their text', () => {
	assert.strictEqual(
		summaryOf('<p>See <a href="https://example.com">this site</a>.</p>'),
		'See this site.',
	)
})

test('summary puts a space between blocks and drops the headings', () => {
	assert.strictEqual(
		summaryOf(
			'<h2>Overview</h2><p>One.</p><p>Two<br>lines.</p><ul><li>a</li><li>b</li></ul>',
		),
		'One. Two lines. a b',
	)
})

// The view escapes summary with <%= %>, so an entity left in it would show
// as text, e.g. "&amp;amp;".
test('summary decodes entities, so the view escapes them only once', () => {
	assert.strictEqual(
		summaryOf(
			'<p>Fish &amp; hike &lt;2 miles&gt; &quot;Union&quot; caf&eacute;</p>',
		),
		'Fish & hike <2 miles> "Union" café',
	)
})

test('summary is empty with no description', () => {
	assert.strictEqual(summaryOf(undefined), '')
	assert.strictEqual(summaryOf(''), '')
})

test('FacilityDescription stays the sanitized HTML', () => {
	const sanitizeDescription = require('../utils/sanitizeDescription')
	assert.strictEqual(
		facility('233115').FacilityDescription,
		sanitizeDescription(source('233115').FacilityDescription),
	)
})
