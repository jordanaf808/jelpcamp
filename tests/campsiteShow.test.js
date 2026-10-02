// Pins the campsite page end to end, with the RIDB API mocked.
//
// The fixture is a real response, stored as received:
// GET /facilities/233115?full=true, captured 2026-10-02.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
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

// Without full=true RIDB returned this same record with these five lists
// empty. The photos (MEDIA) were present either way.
const compact = {
	...facility,
	LINK: [],
	RECAREA: [],
	ACTIVITY: [],
	FACILITYADDRESS: [],
	ORGANIZATION: [],
}

// The timeout matters: the route's catch block logs and sends no response, so
// an error inside it would otherwise hang the test instead of failing it.
test(
	'the campsite page shows the facility, its photos, its links and its parent area',
	{timeout: 10000},
	async () => {
		const ridb = nock(RIDB)
			.get('/api/v1/facilities/233115')
			.reply(200, compact)
			.get('/api/v1/facilities/233115/media')
			.reply(200, {RECDATA: facility.MEDIA})
			.get('/api/v1/facilities/233115/links')
			.reply(200, {RECDATA: facility.LINK})
			.get('/api/v1/recareas/1113')
			.reply(200, facility.RECAREA[0])

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
