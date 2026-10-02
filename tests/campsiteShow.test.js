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
