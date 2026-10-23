// Regression test: no live page may ship an inline <script>.
//
// script-src has no 'unsafe-inline', so the browser refuses inline script with
// no visible error — the page renders, the code never runs, and only the
// DevTools console says so. That is how form validation on these three pages sat
// dead from PR #5 (2026-09-04) until 2026-09-13. This checks the rendered HTML,
// which is what the browser's CSP check actually sees.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')
const User = require('../models/user')
const facility = require('./fixtures/ridb-facility-233115-full.json')

let agent
let commentId

test.before(async () => {
	const {app} = await setup.start()
	agent = request.agent(app)

	// The new-comment form sits behind isLoggedIn and looks its campsite up by the
	// numeric RIDB id, so it needs a logged-in session and a campsite document.
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'csp-check', password: 'csp-check-pw'})
	assert.strictEqual(
		res.headers.location,
		'/campsites',
		'registration should log the agent in',
	)
	const user = await User.findOne({username: 'csp-check'})
	const comment = await Comment.create({
		text: 'A comment to edit.',
		author: {id: user._id, username: user.username},
	})
	commentId = comment._id
	await Campsite.create({
		name: 'CSP check',
		id: 1,
		geometry: {TYPE: 'Point', COORDINATES: [0, 0]},
		comments: [comment._id],
	})

	// The campsite page asks RIDB for its facility. Logged in, it has the
	// comment form.
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
	nock('https://ridb.recreation.gov')
		.get('/api/v1/facilities/2')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '2'})
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

// <script> and <script defer> match; <script src="..."> does not.
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi

// The comment's id exists only once test.before has run, so each path is a
// function, called inside its test.
const PAGES = [
	{name: '/login', path: () => '/login'},
	{name: '/register', path: () => '/register'},
	{name: '/campsites/1/comments/new', path: () => '/campsites/1/comments/new'},
	{
		name: '/campsites/1/comments/:comment_id/edit',
		path: () => `/campsites/1/comments/${commentId}/edit`,
		todo: 'views/comments/edit.ejs loads validateForms.js with #104',
	},
	{
		name: '/campsites/show/2',
		path: () => '/campsites/show/2',
	},
]

for (const {name, path, todo} of PAGES) {
	test(
		`${name} ships no inline script and loads validateForms.js`,
		{todo},
		async () => {
			const res = await agent.get(path())
			assert.strictEqual(res.status, 200)
			assert.deepStrictEqual(res.text.match(INLINE_SCRIPT) ?? [], [])
			assert.match(res.text, /<script src="\/js\/validateForms\.js"><\/script>/)
		},
	)
}
