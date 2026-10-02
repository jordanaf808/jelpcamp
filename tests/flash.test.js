// Pins flash messages end to end: a message queued during one request shows on
// the next page that visitor loads, and on no page after that.
//
// Two callers matter beyond the routes' own req.flash() calls. passport's
// failureFlash option calls req.flash(type, msg) by name, so the function must
// keep that shape. validateUser passes an array of messages, not a string.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')

let app

test.before(async () => {
	;({app} = await setup.start())
})

test.after(async () => {
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

	const next = await agent.get(res.headers.location)
	assert.match(next.text, /length must be at least 3 characters long/)
})

// Reading the flash messages must not write to the session. express-session
// only skips saving a new session (saveUninitialized: false) while nothing has
// modified it, and every page reads the messages to render its header.
test('a visitor who is not logged in gets no session cookie', async () => {
	const res = await request(app).get('/login')
	assert.strictEqual(res.status, 200)
	assert.strictEqual(res.headers['set-cookie'], undefined)
})
