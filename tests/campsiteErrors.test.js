// Pins what the campsite routes do when something fails: they answer.
//
// Each route's catch block used to log the error and send nothing, so the
// request stayed open until the browser gave up. The .timeout() on every
// request here is what turns that into a failed test and not a hung one: it
// aborts the request, where a test timeout alone would leave it open.
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
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const get = (path) => request(app).get(path).timeout(2000)
const todo = {todo: 'the routes do not respond yet'}

test('the index page answers when RIDB fails', todo, async () => {
	nock(RIDB).get('/api/v1/facilities').query(true).reply(500)
	const res = await get('/campsites')
	assert.strictEqual(res.status, 500)
})

test('the search page answers when RIDB fails', todo, async () => {
	nock(RIDB).get('/api/v1/facilities').query(true).reply(500)
	const res = await get('/campsites/search?search=lake')
	assert.strictEqual(res.status, 500)
})

test('a campsite page answers when RIDB fails', todo, async () => {
	nock(RIDB).get('/api/v1/facilities/3').query(true).reply(500)
	const res = await get('/campsites/show/3')
	assert.strictEqual(res.status, 500)
})

// Not a captured response: the real record with its coordinates removed, in the
// shape RIDB uses for a facility that has none. The index and search pages
// filter these out, but the page itself is reachable by URL. It cannot be
// stored, because the Campsite schema requires a geometry.
test(
	'a campsite page answers for a facility with no coordinates',
	todo,
	async () => {
		nock(RIDB)
			.get('/api/v1/facilities/4')
			.query(true)
			.reply(200, {
				...facility,
				FacilityID: '4',
				GEOJSON: {TYPE: '', COORDINATES: null},
			})
		const res = await get('/campsites/show/4')
		assert.strictEqual(res.status, 500)
	},
)
