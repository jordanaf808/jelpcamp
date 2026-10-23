// Pins the campsite page end to end, with the RIDB API mocked.
//
// The fixture is a real response, stored as received:
// GET /facilities/233115?full=true, captured 2026-10-02.
const test = require('node:test')
const assert = require('node:assert')
const mongoose = require('mongoose')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const User = require('../models/user')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'

let app

test.before(async () => {
	;({app} = await setup.start())
	// From here on a request nobody mocked fails instead of reaching the network.
	// supertest talks to the app on 127.0.0.1, so that host stays open.
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

// The timeouts matter: the route's catch block logs and sends no response, so
// an error inside it would otherwise hang the test instead of failing it.
//
// One mock, so this also proves the page costs one RIDB request: a second
// request would be refused.
test(
	'the campsite page shows the facility, its photos, its links and its parent area',
	{timeout: 10000},
	async () => {
		const ridb = nock(RIDB)
			.get('/api/v1/facilities/233115')
			.query({full: 'true'})
			.reply(200, facility)

		const res = await request(app).get('/campsites/show/233115')
		assert.strictEqual(res.status, 200)

		const shows = (text) =>
			assert.ok(res.text.includes(text), `page should contain ${text}`)
		shows(facility.FacilityName)
		shows(facility.RECAREA[0].RecAreaName)
		for (const media of facility.MEDIA) shows(media.URL)
		for (const link of facility.LINK) {
			shows(link.URL)
			shows(link.Title)
		}

		assert.ok(ridb.isDone(), `requests never made: ${ridb.pendingMocks()}`)
	},
)

// Not a captured response: the real record with its parent removed. RIDB's
// docs say a facility can "stand on its own" without a parent rec area.
test(
	'a facility with no parent rec area still gets a page',
	{timeout: 10000},
	async () => {
		nock(RIDB)
			.get('/api/v1/facilities/1')
			.query({full: 'true'})
			.reply(200, {
				...facility,
				FacilityID: '1',
				ParentRecAreaID: '',
				RECAREA: [],
			})

		const res = await request(app).get('/campsites/show/1')
		assert.strictEqual(res.status, 200)
		assert.ok(res.text.includes(facility.FacilityName))
	},
)

// <script> and <script defer> match; <script src="..."> does not.
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi

// The map loads through google.maps.importLibrary(). Google publishes its
// loader as an inline script, which this app's CSP would block without any
// visible error, so the loader is a file and this checks the page uses it.
test(
	'the campsite page loads the map from files, with no inline script',
	{timeout: 10000},
	async () => {
		nock(RIDB)
			.get('/api/v1/facilities/2')
			.query({full: 'true'})
			.reply(200, {...facility, FacilityID: '2'})

		const res = await request(app).get('/campsites/show/2')
		assert.strictEqual(res.status, 200)
		assert.deepStrictEqual(res.text.match(INLINE_SCRIPT) ?? [], [])

		// Loader first: gmap.js calls google.maps.importLibrary() as it runs.
		assert.match(
			res.text,
			/<script src="\/js\/gmapLoader\.js"><\/script>\s*<script src="\/js\/gmap\.js"><\/script>/,
		)
		// The loader reads the key from here.
		assert.match(res.text, /<div id="map"[^>]*\bdata-maps-key="/)
		// No script tag for the API itself: the loader adds it in the browser.
		assert.doesNotMatch(res.text, /maps\.googleapis\.com\/maps\/api\/js/)
	},
)

// The campsite page once loaded its own jQuery and Bootstrap as well as the
// footer's, so each click on the photo carousel or the accordion was handled
// by two Bootstraps. The redesigned page uses neither.
test('the campsite page loads neither jQuery nor Bootstrap', async () => {
	nock(RIDB)
		.get('/api/v1/facilities/5')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '5'})

	const res = await request(app).get('/campsites/show/5')
	assert.strictEqual(res.status, 200)

	// Script tags and stylesheet links: Bootstrap came as both.
	const urls = [
		...res.text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g),
	].map(([, url]) => url)
	for (const library of ['jquery', 'bootstrap']) {
		const found = urls.filter((url) => url.includes(library))
		assert.deepStrictEqual(found, [], `${library} is loaded`)
	}
})

// A Render PR preview copies production's MAPS_API_KEY, which the preview's
// hostname is not allowed to use. The route reads the key on each request, so
// these tests set the environment without reloading the app.
const withEnv = (t, vars) => {
	const saved = Object.fromEntries(
		Object.keys(vars).map((name) => [name, process.env[name]]),
	)
	Object.assign(process.env, vars)
	t.after(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	})
}

const KEYS = {
	MAPS_API_KEY: 'production-maps-key',
	PREVIEW_MAPS_API_KEY: 'preview-maps-key',
}

const mapsKeyOn = (res) => res.text.match(/\bdata-maps-key="([^"]*)"/)?.[1]

// The route renders the page from three places: a first visit, a repeat visit,
// and a repeat visit by a user whose favorites include the campsite.
test('on a preview, every render of the campsite page uses PREVIEW_MAPS_API_KEY', async (t) => {
	withEnv(t, {IS_PULL_REQUEST: 'true', ...KEYS})
	nock(RIDB)
		.get('/api/v1/facilities/6')
		.query({full: 'true'})
		.times(3)
		.reply(200, {...facility, FacilityID: '6'})

	const firstVisit = await request(app).get('/campsites/show/6')
	const repeatVisit = await request(app).get('/campsites/show/6')

	const agent = request.agent(app)
	const registered = await agent
		.post('/register')
		.type('form')
		.send({username: 'maps', password: 'maps-pw'})
	assert.strictEqual(registered.headers.location, '/campsites')
	const {_id} = await User.findOne({username: 'maps'})
	await agent.post(`/user/${_id}/6`)
	const {favorites} = await User.findById(_id)
	assert.strictEqual(favorites.length, 1, 'the favorite was not saved')
	const favoriteVisit = await agent.get('/campsites/show/6')

	const visits = {firstVisit, repeatVisit, favoriteVisit}
	for (const [visit, res] of Object.entries(visits)) {
		assert.strictEqual(res.status, 200, visit)
		assert.strictEqual(mapsKeyOn(res), 'preview-maps-key', visit)
	}
})

// Render sets the STRING 'false' outside previews, and 'false' is truthy.
test("IS_PULL_REQUEST 'false' is not a preview: the page uses MAPS_API_KEY", async (t) => {
	withEnv(t, {IS_PULL_REQUEST: 'false', ...KEYS})
	nock(RIDB)
		.get('/api/v1/facilities/7')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '7'})

	const res = await request(app).get('/campsites/show/7')
	assert.strictEqual(res.status, 200)
	assert.strictEqual(mapsKeyOn(res), 'production-maps-key')
})

// The favorites page lists each saved campsite's state and rec area, and reads
// them from the Campsite document, not from RIDB.
test('a first visit stores the campsite with its state and rec area', async () => {
	nock(RIDB)
		.get('/api/v1/facilities/8')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '8'})

	const res = await request(app).get('/campsites/show/8')
	assert.strictEqual(res.status, 200)

	const stored = await Campsite.findOne({id: 8}).lean()
	assert.strictEqual(stored.state, 'OR')
	assert.strictEqual(stored.recAreaName, 'Wallowa Whitman National Forest')
})

// Every write mongoose sends to the campsites collection while fn runs.
const campsiteWritesDuring = async (fn) => {
	const writes = []
	mongoose.set('debug', (collection, method) => {
		if (
			collection === 'campsites' &&
			/^(insert|update|replace|findOneAnd|bulkWrite|delete)/.test(method)
		) {
			writes.push(method)
		}
	})
	try {
		await fn()
	} finally {
		mongoose.set('debug', false)
	}
	return writes
}

// Campsites saved before the redesign have neither field.
test('a visit fills in state and rec area on a campsite stored without them', async () => {
	await Campsite.create({
		name: facility.FacilityName,
		id: 9,
		geometry: facility.GEOJSON,
	})
	nock(RIDB)
		.get('/api/v1/facilities/9')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '9'})

	const writes = await campsiteWritesDuring(async () => {
		const res = await request(app).get('/campsites/show/9')
		assert.strictEqual(res.status, 200)
	})
	// One update of the two fields. This also shows the spy sees writes.
	assert.deepStrictEqual(writes, ['updateOne'])

	const stored = await Campsite.findOne({id: 9}).lean()
	assert.strictEqual(stored.state, 'OR')
	assert.strictEqual(stored.recAreaName, 'Wallowa Whitman National Forest')
})

test('a visit writes nothing to a campsite that already has state and rec area', async () => {
	await Campsite.create({
		name: facility.FacilityName,
		id: 10,
		geometry: facility.GEOJSON,
		state: 'XX',
		recAreaName: 'Stored Area',
	})
	nock(RIDB)
		.get('/api/v1/facilities/10')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '10'})

	const writes = await campsiteWritesDuring(async () => {
		const res = await request(app).get('/campsites/show/10')
		assert.strictEqual(res.status, 200)
	})
	assert.deepStrictEqual(writes, [])

	const stored = await Campsite.findOne({id: 10}).lean()
	assert.strictEqual(stored.state, 'XX')
	assert.strictEqual(stored.recAreaName, 'Stored Area')
})

// The fill-in writes only its two fields. save() validates the whole document,
// so an old one that fails today's schema would turn the page into a 500. This
// one has no geometry, which the schema requires.
test("a campsite that fails today's schema still gets its page and its fields", async () => {
	await Campsite.collection.insertOne({name: facility.FacilityName, id: 11})
	nock(RIDB)
		.get('/api/v1/facilities/11')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '11'})

	const res = await request(app).get('/campsites/show/11')
	assert.strictEqual(res.status, 200)

	const stored = await Campsite.findOne({id: 11}).lean()
	assert.strictEqual(stored.state, 'OR')
	assert.strictEqual(stored.recAreaName, 'Wallowa Whitman National Forest')
})

// RIDB sends FacilityDirections as HTML: the captured record's is
// "<p>From Baker City…</p>". Escaped, the page would print the tags as text, so
// the route sanitizes it, and FacilityUseFeeDescription with it, the way it
// sanitizes FacilityDescription.
test(
	'the directions render as markup, not as escaped tags',
	{timeout: 10000},
	async () => {
		nock(RIDB)
			.get('/api/v1/facilities/12')
			.query({full: 'true'})
			.reply(200, {...facility, FacilityID: '12'})

		const res = await request(app).get('/campsites/show/12')
		assert.strictEqual(res.status, 200)
		assert.ok(res.text.includes('<p>From Baker City, Oregon'))
		assert.ok(!res.text.includes('&lt;p&gt;From Baker City'))
		// The fees are plain text, and show as they are.
		assert.ok(
			res.text.includes(
				'Payment in full will be charged to your credit card upon completion of the reservation.',
			),
		)
	},
)

test(
	'a script in the directions or the fees is stripped',
	{timeout: 10000},
	async () => {
		nock(RIDB)
			.get('/api/v1/facilities/13')
			.query({full: 'true'})
			.reply(200, {
				...facility,
				FacilityID: '13',
				FacilityDirections:
					'<p>Turn left at the lake.</p><script>alert("directions")</script>',
				FacilityUseFeeDescription:
					'Twenty dollars a night.<script>alert("fees")</script>',
			})

		const res = await request(app).get('/campsites/show/13')
		assert.strictEqual(res.status, 200)
		assert.ok(res.text.includes('<p>Turn left at the lake.</p>'))
		assert.ok(res.text.includes('Twenty dollars a night.'))
		assert.ok(!res.text.includes('alert("directions")'))
		assert.ok(!res.text.includes('alert("fees")'))
		assert.ok(!res.text.includes('alert(&#34;'))
	},
)
