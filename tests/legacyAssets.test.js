// Every page is redesigned, so none loads what the old pages needed: Bootstrap
// 4, jQuery, Popper, Font Awesome, main.css, back.js and offcanvas.js. Each
// page family is checked, because the layout is shared but a view can add its
// own tags.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')
const User = require('../models/user')
const list = require('./fixtures/ridb-facilities-list-full.json')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'
const USERNAME = 'legacy-check'

// Each page is fetched once, here, because RIDB responses are cached per
// process and a second request would never reach nock.
const pages = {}

test.before(async () => {
	const {app} = await setup.start()
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
	nock(RIDB).get('/api/v1/facilities').query(true).times(2).reply(200, list)
	nock(RIDB).get('/api/v1/facilities/233115').query(true).reply(200, facility)

	const agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: USERNAME, password: 'legacy-check-pw'})
	assert.strictEqual(res.headers.location, '/campsites')
	const user = await User.findOne({username: USERNAME})
	const comment = await Comment.create({
		text: 'A comment to edit.',
		author: {id: user._id, username: user.username},
	})
	await Campsite.create({
		name: 'Legacy check',
		id: 1,
		geometry: {TYPE: 'Point', COORDINATES: [0, 0]},
		comments: [comment._id],
	})

	const anon = request(app)
	pages['/campsites'] = await anon.get('/campsites')
	pages['/campsites/search'] = await anon.get('/campsites/search?search=legacy')
	pages['/campsites/show/233115'] = await anon.get('/campsites/show/233115')
	pages['/login'] = await anon.get('/login')
	pages['/register'] = await anon.get('/register')
	pages['/user/:id'] = await agent.get(`/user/${user._id}`)
	pages['/campsites/1/comments/new'] = await agent.get(
		'/campsites/1/comments/new',
	)
	pages['/campsites/1/comments/:id/edit'] = await agent.get(
		`/campsites/1/comments/${comment._id}/edit`,
	)
	for (const [path, res] of Object.entries(pages)) {
		assert.strictEqual(res.status, 200, path)
	}
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const OLD_ASSETS = [
	'bootstrapcdn',
	'jquery',
	'popper',
	'font-awesome',
	'/stylesheets/main.css',
	'/js/back.js',
	'/js/offcanvas.js',
]

const PATHS = [
	'/campsites',
	'/campsites/search',
	'/campsites/show/233115',
	'/user/:id',
	'/login',
	'/register',
	'/campsites/1/comments/new',
	'/campsites/1/comments/:id/edit',
]

for (const path of PATHS) {
	test(
		`${path} loads none of the old assets`,
		{todo: 'the cleanup PR removes them from the layout'},
		() => {
			const html = pages[path].text.toLowerCase()
			assert.deepStrictEqual(
				OLD_ASSETS.filter((asset) => html.includes(asset)),
				[],
			)
		},
	)
}
