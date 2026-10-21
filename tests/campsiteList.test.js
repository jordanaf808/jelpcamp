// Pins the list pages' requests to RIDB, and / sending visitors to the list.
//
// The index and search ask RIDB for full records (full: true), which carry the
// photos, address and parent rec area the cards show.
//
// RIDB responses are cached per process, so each request here differs from
// the others in its query.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const list = require('./fixtures/ridb-facilities-list-full.json')

const RIDB = 'https://ridb.recreation.gov'

let app

test.before(async () => {
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const get = (path) => request(app).get(path).timeout(5000)

test(
	'/ redirects to /campsites',
	{todo: '/ still renders landing.ejs'},
	async () => {
		const res = await get('/')
		assert.strictEqual(res.status, 302)
		assert.strictEqual(res.headers.location, '/campsites')
	},
)

test(
	'the index asks RIDB for full records and lists each facility it can map',
	{todo: 'the index still sends full: false'},
	async () => {
		const ridb = nock(RIDB)
			.get('/api/v1/facilities')
			.query({query: 'hiking', limit: '25', full: 'true', sort: 'Date'})
			.reply(200, list)

		const res = await get('/campsites')
		assert.strictEqual(res.status, 200)
		assert.ok(ridb.isDone(), `requests never made: ${ridb.pendingMocks()}`)

		for (const id of ['233115', '900001', '900002']) {
			assert.ok(
				res.text.includes(`/campsites/show/${id}`),
				`the page should link facility ${id}`,
			)
		}
		// No coordinates, so mutateData leaves it out.
		assert.ok(!res.text.includes('/campsites/show/900003'))
	},
)

test(
	'the search asks RIDB for full records',
	{todo: 'the search does not send full yet'},
	async () => {
		const ridb = nock(RIDB)
			.get('/api/v1/facilities')
			.query({
				query: 'lake',
				state: 'OR',
				limit: '10',
				sort: 'Date',
				full: 'true',
			})
			.reply(200, list)

		const res = await get('/campsites/search?search=lake&state=OR&limit=10')
		assert.strictEqual(res.status, 200)
		assert.ok(ridb.isDone(), `requests never made: ${ridb.pendingMocks()}`)
	},
)
