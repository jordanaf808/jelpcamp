// Pins utils/safeBack.js, which replaced res.redirect('back'). Express 4 used
// the Referer header as-is, so a request arriving from another site could be
// bounced back to it; Express 5 removed 'back' altogether. A bare Express app
// is enough, so this needs no database.
const test = require('node:test')
const assert = require('node:assert')
const express = require('express')
const request = require('supertest')
const safeBack = require('../utils/safeBack')

const app = express()
app.get('/back', (req, res) => res.redirect(safeBack(req)))

// Every request claims the same Host, so "this site" is predictable.
const HOST = 'yelpcamp.test'
const back = (referer) => {
	const req = request(app).get('/back').set('Host', HOST)
	return referer === undefined ? req : req.set('Referer', referer)
}

test('returns to the referring page on this site, query string included', async () => {
	const res = await back(`http://${HOST}/campsites/show/1?tab=comments`)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/campsites/show/1?tab=comments')
})

test('falls back to / when there is no referrer', async () => {
	const res = await back()
	assert.strictEqual(res.headers.location, '/')
})

test('falls back to / when the referrer is another site', async () => {
	const res = await back('https://evil.example/login')
	assert.strictEqual(res.headers.location, '/')
})

test('falls back to / for a same-site referrer with a protocol-relative path', async () => {
	const res = await back(`http://${HOST}//evil.example`)
	assert.strictEqual(res.headers.location, '/')
})

test('falls back to / when the referrer is not a URL', async () => {
	const res = await back('not a url')
	assert.strictEqual(res.headers.location, '/')
})

// Browsers keep the original Referer when they follow a redirect, so a GET
// answered with its own url would arrive again unchanged, forever.
test('falls back to / when a GET is referred by the page it is already on', async () => {
	const res = await back(`http://${HOST}/back`)
	assert.strictEqual(res.headers.location, '/')
})
