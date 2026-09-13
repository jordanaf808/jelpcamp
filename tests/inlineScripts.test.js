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
const setup = require('./setup')
const Campsite = require('../models/campsite')

let agent

test.before(async () => {
	const {app} = await setup.start()
	agent = request.agent(app)

	// The new-comment form sits behind isLoggedIn and looks its campsite up by the
	// numeric RIDB id, so it needs a logged-in session and a campsite document.
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'csp-check', password: 'csp-check-pw'})
	assert.strictEqual(res.headers.location, '/campsites', 'registration should log the agent in')
	await Campsite.create({name: 'CSP check', id: 1, geometry: {TYPE: 'Point', COORDINATES: [0, 0]}})
})

test.after(async () => {
	await setup.stop()
})

// <script> and <script defer> match; <script src="..."> does not.
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi

for (const path of ['/login', '/register', '/campsites/1/comments/new']) {
	test(`${path} ships no inline script and loads validateForms.js`, async () => {
		const res = await agent.get(path)
		assert.strictEqual(res.status, 200)
		assert.deepStrictEqual(res.text.match(INLINE_SCRIPT) ?? [], [])
		assert.match(res.text, /<script src="\/js\/validateForms\.js"><\/script>/)
	})
}
