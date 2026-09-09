// Pins the login rate limiter, and in doing so exercises tests/setup.js end to
// end: ephemeral DB, guard, app boot, and store reset.
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

const attempt = () =>
	request(app).post('/login').type('form').send({username: 'nobody', password: 'wrong'})

test('the 11th login attempt is refused with 429', async () => {
	for (let i = 1; i <= 10; i++) {
		const res = await attempt()
		assert.notStrictEqual(res.status, 429, `request ${i} should be within the budget`)
	}

	const blocked = await attempt()
	assert.strictEqual(blocked.status, 429)
	// The handler re-renders the login view rather than sending a bare body, so
	// the 429 is a page a user can actually read.
	assert.match(blocked.headers['content-type'], /text\/html/)
	assert.match(blocked.text, /Too many login attempts/)
})

test('resetRateLimiters clears the counter between tests', async () => {
	// beforeEach ran resetRateLimiters, so the previous test's exhausted budget
	// must not carry over. Without the explicit store this request would 429.
	const res = await attempt()
	assert.notStrictEqual(res.status, 429)
})

test('the limiter still reports its budget in RateLimit-* headers', async () => {
	const res = await attempt()
	assert.ok(res.headers['ratelimit-remaining'], 'standardHeaders should be on')
	assert.strictEqual(res.headers['ratelimit-remaining'], '9')
	assert.strictEqual(res.headers['x-ratelimit-remaining'], undefined, 'legacy headers off')
})
