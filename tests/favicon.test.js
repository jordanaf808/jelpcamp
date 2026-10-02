// Regression test: the favicon is served, and every page family links it.
//
// There are three separate <head> blocks: landing.ejs has its own, and every
// other view includes partials/header.ejs or partials/headerBack.ejs. A page
// without the link makes the browser ask for /favicon.ico, which does not
// exist, so that page logs a 404 on every load.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')
const Campsite = require('../models/campsite')

let agent

test.before(async () => {
	const {app} = await setup.start()
	agent = request.agent(app)

	// Every view that uses headerBack.ejs sits behind a login or the RIDB API.
	// The new-comment form needs a logged-in session and a campsite document.
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'favicon-check', password: 'favicon-check-pw'})
	assert.strictEqual(
		res.headers.location,
		'/campsites',
		'registration should log the agent in',
	)
	await Campsite.create({
		name: 'Favicon check',
		id: 1,
		geometry: {TYPE: 'Point', COORDINATES: [0, 0]},
	})
})

test.after(async () => {
	await setup.stop()
})

test('/favicon.svg is served as an SVG image', async () => {
	const res = await agent.get('/favicon.svg')
	assert.strictEqual(res.status, 200)
	assert.match(res.headers['content-type'], /^image\/svg\+xml/)
})

const FAVICON_LINK =
	/<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" \/>/

const pages = {
	'/': 'landing.ejs',
	'/login': 'partials/header.ejs',
	'/campsites/1/comments/new': 'partials/headerBack.ejs',
}

for (const [path, template] of Object.entries(pages)) {
	test(`${path} links the favicon (${template})`, async () => {
		const res = await agent.get(path)
		assert.strictEqual(res.status, 200)
		assert.match(res.text, FAVICON_LINK)
	})
}
