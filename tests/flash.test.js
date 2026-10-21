// Pins flash messages end to end: a message queued during one request shows on
// the next page that visitor loads, and on no page after that.
//
// Two callers matter beyond the routes' own req.flash() calls. passport's
// failureFlash option calls req.flash(type, msg) by name, so the function must
// keep that shape. validateUser passes an array of messages, not a string.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const list = require('./fixtures/ridb-facilities-list-full.json')

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

test.beforeEach(() => {
	setup.resetRateLimiters()
})

test('a failed login shows its message on the next page, and only once', async () => {
	const agent = request.agent(app)
	const res = await agent
		.post('/login')
		.type('form')
		.send({username: 'nobody', password: 'wrong'})
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/login')

	const first = await agent.get('/login')
	assert.match(first.text, /Wrong Username and\/or Password\.\.\./)

	const second = await agent.get('/login')
	assert.doesNotMatch(second.text, /Wrong Username/)
})

test('a rejected registration shows its validation message on the next page', async () => {
	// One character is under userSchema's minimum of 3, so validateUser rejects
	// it and flashes Joi's messages as an array.
	const agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'flash-check', password: 'x'})
	assert.strictEqual(res.status, 302)

	// With no Referer, "back" is /, which redirects to /campsites. app.js reads
	// the messages on every request, so the message has to survive that hop.
	assert.strictEqual(res.headers.location, '/')
	const hop = await agent.get('/')
	assert.strictEqual(hop.headers.location, '/campsites')

	nock('https://ridb.recreation.gov')
		.get('/api/v1/facilities')
		.query(true)
		.reply(200, list)
	const next = await agent.get('/campsites')
	assert.strictEqual(next.status, 200)
	assert.match(next.text, /length must be at least 3 characters long/)
})

// A visitor with no messages passes through / without a session write.
test('/ sends a visitor to /campsites with no session cookie', async () => {
	const res = await request(app).get('/')
	assert.strictEqual(res.headers.location, '/campsites')
	assert.strictEqual(res.headers['set-cookie'], undefined)
})

// Reading the flash messages must not write to the session. express-session
// only skips saving a new session (saveUninitialized: false) while nothing has
// modified it, and every page reads the messages to render its header.
test('a visitor who is not logged in gets no session cookie', async () => {
	const res = await request(app).get('/login')
	assert.strictEqual(res.status, 200)
	assert.strictEqual(res.headers['set-cookie'], undefined)
})
