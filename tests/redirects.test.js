// Pins the "back" redirects end to end through the real app. utils/safeBack.js
// has its own unit test; this one proves the routes actually use it, and that
// browsers are allowed to send it a same-site Referer in the first place.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')
const Campsite = require('../models/campsite')

// Requests claim a fixed Host, so a same-site Referer can be written in advance.
const HOST = 'yelpcamp.test'

let app
let agent

test.before(async () => {
	app = (await setup.start()).app
	agent = request.agent(app)

	// Posting a comment sits behind isLoggedIn and looks its campsite up by the
	// numeric RIDB id, so it needs a logged-in session and a campsite document.
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'back-check', password: 'back-check-pw'})
	assert.strictEqual(res.headers.location, '/campsites', 'registration should log the agent in')
	await Campsite.create({name: 'Back check', id: 1, geometry: {TYPE: 'Point', COORDINATES: [0, 0]}})
})

test.after(async () => {
	await setup.stop()
})

// Nine characters is under commentSchema's minimum of 10, so validateComment
// rejects it and redirects "back".
const postInvalidComment = (referer) =>
	agent
		.post('/campsites/1/comments')
		.set('Host', HOST)
		.set('Referer', referer)
		.type('form')
		.send({'comment[text]': 'too short'})

test('a rejected comment returns to the referring page on this site', async () => {
	const res = await postInvalidComment(`http://${HOST}/campsites/1/comments/new`)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/campsites/1/comments/new')
})

test('a rejected comment sent from another site goes to /, not back to that site', async () => {
	const res = await postInvalidComment('https://evil.example/phish')
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/')
})

test('pages send Referrer-Policy: same-origin, so browsers include a same-site Referer', async () => {
	const res = await agent.get('/login')
	assert.strictEqual(res.headers['referrer-policy'], 'same-origin')
})

// The edit page sits behind checkCommentOwnership, which used to send a logged
// out visitor "back" — and on this page the referrer is this page, so the
// browser would arrive here again and be redirected again.
test('the edit page sends a logged-out visitor to /login, not back to itself', async () => {
	const edit = '/campsites/1/comments/64b000000000000000000001/edit'
	const res = await request(app)
		.get(edit)
		.set('Host', HOST)
		.set('Referer', `http://${HOST}${edit}`)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/login')
})

// isLoggedIn remembers where to send someone after they log in. A POST url is
// not a page: coming back to /campsites/1/comments as a GET matches no route.
test('logging in after a rejected POST lands on a page, not on the POST url', async () => {
	const anon = request.agent(app)

	const blocked = await anon.post('/campsites/1/comments').set('Host', HOST)
	assert.strictEqual(blocked.headers.location, '/login')

	const loggedIn = await anon
		.post('/login')
		.set('Host', HOST)
		.type('form')
		.send({username: 'back-check', password: 'back-check-pw'})
	assert.strictEqual(loggedIn.headers.location, '/campsites')
})

// Nothing parses a body for this request, so req.body is {} on Express 4 and
// undefined on Express 5. validateComment has to reject it either way.
test('a comment post with no form body is rejected, not a 500', async () => {
	const res = await agent.post('/campsites/1/comments').set('Host', HOST)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/')
})
