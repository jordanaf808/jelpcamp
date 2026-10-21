// Pins the shared layout every page renders inside: views/partials/header.ejs
// opens the document and <main>, and footer.ejs closes them.
// headerBack.ejs is the same layout, kept so no view's include line changes.
//
// Before the redesign each partial was a whole document, so every page had a
// stray </body></html> in the middle, and the Google-map campsite page loaded
// Mapbox too.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const User = require('../models/user')
const list = require('./fixtures/ridb-facilities-list-full.json')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'
const USERNAME = 'layout-check'

let app
let agent
let userId
// Each page is fetched once, here, because RIDB responses are cached per
// process and a second request would never reach nock.
const pages = {}

test.before(async () => {
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
	nock(RIDB).get('/api/v1/facilities').query(true).times(2).reply(200, list)
	nock(RIDB).get('/api/v1/facilities/233115').query(true).reply(200, facility)

	agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: USERNAME, password: 'layout-check-pw'})
	assert.strictEqual(res.headers.location, '/campsites')
	userId = String((await User.findOne({username: USERNAME}))._id)
	await Campsite.create({
		name: 'Layout check',
		id: 1,
		geometry: {TYPE: 'Point', COORDINATES: [0, 0]},
	})

	const anon = request(app)
	pages['/login'] = await anon.get('/login')
	pages['/register'] = await anon.get('/register')
	pages['/campsites'] = await anon.get('/campsites')
	pages['/campsites/search'] = await anon.get('/campsites/search?search=layout')
	pages['/campsites/show/233115'] = await anon.get('/campsites/show/233115')
	pages['/user/:id'] = await agent.get(`/user/${userId}`)
	pages['/campsites/1/comments/new'] = await agent.get(
		'/campsites/1/comments/new',
	)
	for (const [path, res] of Object.entries(pages)) {
		assert.strictEqual(res.status, 200, path)
	}
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const count = (html, pattern) => (html.match(pattern) ?? []).length
const LOGGED_IN = ['/user/:id', '/campsites/1/comments/new']

// The site's own nav, not some other <nav> a page might add.
const mainNav = (html) => {
	const nav = html.match(/<nav\b[^>]*aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/)
	assert.ok(nav, 'the page should have <nav aria-label="Main">')
	return nav[1]
}

test(
	'every page is one HTML document with one <main>, closed by the footer',
	{todo: 'header and headerBack are still two whole documents'},
	() => {
		for (const [path, {text}] of Object.entries(pages)) {
			for (const tag of [/<!DOCTYPE html>/gi, /<html\b/g, /<\/html>/g]) {
				assert.strictEqual(count(text, tag), 1, `${path}: ${tag}`)
			}
			for (const tag of [/<body\b/g, /<\/body>/g, /<\/main>/g]) {
				assert.strictEqual(count(text, tag), 1, `${path}: ${tag}`)
			}
			assert.strictEqual(count(text, /<main id="main"/g), 1, path)
			const order = ['<main id="main"', '</main>', '<footer', '</body>'].map(
				(tag) => text.indexOf(tag),
			)
			assert.deepStrictEqual(
				[...order].sort((a, b) => a - b),
				order,
				`${path}: main, then footer, then </body>`,
			)
		}
	},
)

test(
	'every page starts with a skip link to <main>',
	{todo: 'no skip link yet'},
	() => {
		for (const [path, {text}] of Object.entries(pages)) {
			const skip = text.search(/<a\b[^>]*href="#main"/)
			assert.notStrictEqual(skip, -1, path)
			assert.ok(skip < text.indexOf('<nav'), `${path}: before the nav`)
		}
	},
)

test(
	'every page loads the WANDUR fonts, stylesheet and scripts',
	{todo: 'the layout does not load them yet'},
	() => {
		for (const [path, {text}] of Object.entries(pages)) {
			const fonts = text.match(
				/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/,
			)
			assert.ok(fonts, `${path}: Google Fonts`)
			for (const family of [
				'family=Barlow+Condensed:wght@500;600;700',
				'family=Barlow:wght@400;500;600',
				'family=JetBrains+Mono:wght@400;500',
				'display=swap',
			]) {
				assert.ok(fonts[1].includes(family), `${path}: ${family}`)
			}

			// After main.css, so its rules win where both style an element.
			const main = text.indexOf('href="/stylesheets/main.css"')
			const wandur = text.indexOf('href="/stylesheets/wandur.css"')
			assert.notStrictEqual(wandur, -1, `${path}: wandur.css`)
			assert.ok(main < wandur, `${path}: wandur.css after main.css`)

			for (const script of ['nav', 'flash', 'back']) {
				assert.match(
					text,
					new RegExp(`<script src="/js/${script}\\.js" defer></script>`),
					`${path}: ${script}.js`,
				)
			}
		}
	},
)

test(
	'Mapbox loads once on the list pages and nowhere else',
	{todo: 'headerBack loads Mapbox on every page that uses it'},
	() => {
		const mapbox = {
			'/campsites': 1,
			'/campsites/search': 1,
			'/campsites/show/233115': 0,
			'/login': 0,
			'/user/:id': 0,
			'/campsites/1/comments/new': 0,
		}
		for (const [path, expected] of Object.entries(mapbox)) {
			const {text} = pages[path]
			assert.strictEqual(
				count(text, /<script\b[^>]*src="[^"]*mapbox-gl\.js"/g),
				expected,
				`${path}: mapbox-gl.js`,
			)
			assert.strictEqual(
				count(text, /<link\b[^>]*href="[^"]*mapbox-gl\.css"/g),
				expected,
				`${path}: mapbox-gl.css`,
			)
		}
	},
)

test(
	'the nav shows Campsites, Login and Register to a visitor',
	{todo: 'the nav has no Campsites link yet'},
	() => {
		for (const [path, {text}] of Object.entries(pages)) {
			if (LOGGED_IN.includes(path)) continue
			const nav = mainNav(text)
			assert.match(nav, /<a\b[^>]*href="\/campsites"[^>]*>\s*Campsites\s*</)
			assert.match(nav, /<a\b[^>]*href="\/login"[^>]*>\s*Login\s*</)
			assert.match(nav, /<a\b[^>]*href="\/register"[^>]*>\s*Register\s*</)
			assert.doesNotMatch(nav, /Logout|favorites/, path)
		}
	},
)

test(
	"the nav shows Campsites, the user's favorites and Logout to a user",
	{todo: 'the nav has no Campsites link yet'},
	() => {
		for (const path of LOGGED_IN) {
			const nav = mainNav(pages[path].text)
			assert.match(nav, /<a\b[^>]*href="\/campsites"[^>]*>\s*Campsites\s*</)
			assert.match(
				nav,
				new RegExp(
					`<a\\b[^>]*href="/user/${userId}"[^>]*>\\s*${USERNAME}(?:'|&#39;)s favorites\\s*<`,
				),
			)
			assert.match(nav, /<a\b[^>]*href="\/logout"[^>]*>\s*Logout\s*</)
			assert.doesNotMatch(nav, /href="\/login"|href="\/register"/, path)
		}
	},
)

// The redesign drops the nav's "Go Back." link. back.js stays, for the link on
// the edit-comment page.
test(
	'the nav has no back link',
	{todo: 'headerBack still has a Go Back link'},
	() => {
		for (const [path, {text}] of Object.entries(pages)) {
			assert.doesNotMatch(mainNav(text), /data-back|Go Back/, path)
		}
	},
)

// The menu button is for nav.js. It points at the links it shows and hides.
test(
	'the nav has a menu button that controls the links',
	{todo: 'the nav has no menu button yet'},
	() => {
		const {text} = pages['/login']
		const button = text.match(/<button\b[^>]*aria-controls="([^"]+)"[^>]*>/)
		assert.ok(button, 'a button with aria-controls')
		assert.match(button[0], /aria-expanded="false"/)
		assert.match(text, new RegExp(`<nav\\b[^>]*id="${button[1]}"`))
	},
)

// Bootstrap's alert plugin, still loaded by the footer, handles any click on
// [data-dismiss="alert"]. flash.js handles these buttons instead, so only one
// of them may claim the click.
test(
	'a flash message has a dismiss button for flash.js, not for Bootstrap',
	{todo: 'flash messages still use data-dismiss'},
	async () => {
		const visitor = request.agent(app)
		setup.resetRateLimiters()
		await visitor
			.post('/login')
			.type('form')
			.send({username: 'nobody', password: 'wrong'})
		const {text} = await visitor.get('/login')

		const flash = text.match(
			/<div\b[^>]*class="flash flash--error"[^>]*>[\s\S]*?<\/div>/,
		)
		assert.ok(flash, 'an error flash')
		assert.match(flash[0], /Wrong Username and\/or Password\.\.\./)
		assert.match(flash[0], /<button\b[^>]*data-flash-dismiss/)
		assert.doesNotMatch(text, /data-dismiss=/)
	},
)
