// Pins what the error handler in app.js sends: plain text, and for a server
// error, a fixed message.
//
// An error's message is not ours to trust. Mongoose writes the value it could
// not cast into its message, and that value can come straight from the URL.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')

let app
let agent

test.before(async () => {
	;({app} = await setup.start())
	agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'alice', password: 'alice-pw'})
	assert.strictEqual(
		res.headers.location,
		'/campsites',
		'registration should log the agent in',
	)
})

test.after(async () => {
	await setup.stop()
})

const todo = {todo: 'the handler sends the error message as HTML today'}

test('a page that does not exist is a 404 in plain text', todo, async () => {
	const res = await request(app).get('/no-such-page')
	assert.strictEqual(res.status, 404)
	assert.strictEqual(res.text, 'Page Not Found')
	assert.match(res.headers['content-type'], /^text\/plain/)
})

// The comment form looks its campsite up by the id in the URL. The id is a
// Number in the schema, so anything else is a cast error, and Mongoose quotes
// the value in that error's message.
test(
	"a server error sends a fixed message, not the error's own",
	todo,
	async () => {
		const id = encodeURIComponent('<img src=x>')
		const res = await agent.get(`/campsites/${id}/comments/new`)
		assert.strictEqual(res.status, 500)
		assert.strictEqual(res.text, 'Something went wrong.')
		assert.match(res.headers['content-type'], /^text\/plain/)
	},
)
