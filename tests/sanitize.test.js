// Pins middleware/sanitize.js, which replaced express-mongo-sanitize's own
// middleware: that one assigns req.query, and Express 5 made req.query
// read-only. A bare Express app is enough, so this needs no database.
//
// The query test also covers the Express 5 getter: the handler reads req.query
// after the middleware ran, so an in-place edit that the getter re-parsed away
// would fail it.
const test = require('node:test')
const assert = require('node:assert')
const express = require('express')
const request = require('supertest')
const sanitizeRequest = require('../middleware/sanitize')

const app = express()
app.use(express.urlencoded({extended: true}))
app.use(sanitizeRequest)
const echo = (req, res) => res.json({body: req.body ?? null, query: req.query})
app.get('/echo', echo)
app.post('/echo', echo)

test('strips operator and dotted keys from the body, keeping nested fields', async () => {
	const res = await request(app)
		.post('/echo')
		.type('form')
		.send('comment[text]=hello&comment[$where]=1&username[$gt]=&a.b=1')
	assert.strictEqual(res.status, 200)
	assert.deepStrictEqual(res.body.body, {comment: {text: 'hello'}, username: {}})
})

test('strips operator and dotted keys from the query string', async () => {
	const res = await request(app).get('/echo?$where=1&a.b=2&search=kept')
	assert.strictEqual(res.status, 200)
	assert.deepStrictEqual(res.body.query, {search: 'kept'})
})
