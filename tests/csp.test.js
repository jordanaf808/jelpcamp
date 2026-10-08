// Pins two things about script-src, the list of places a page may load a
// script from.
//
// 1. It names files, not hosts, on the two CDNs that serve code this app never
//    chose. jsDelivr serves any npm package and cdnjs a large library set, so
//    allowing either host allows every script on it.
// 2. Every external script a page loads is on the list. The browser refuses
//    one that is not, and the page says nothing: it renders and the script
//    never runs.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const facility = require('./fixtures/ridb-facility-233115-full.json')

const RIDB = 'https://ridb.recreation.gov'
const PUBLIC_CDNS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com']

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

const scriptSrc = (res) =>
	res.headers['content-security-policy']
		.split(';')
		.map((directive) => directive.trim().split(/\s+/))
		.find(([name]) => name === 'script-src')
		.slice(1)

const HTML_COMMENT = /<!--[\s\S]*?-->/g
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g

const externalScripts = (html) =>
	[...html.replace(HTML_COMMENT, '').matchAll(EXTERNAL_SCRIPT)].map(
		([, url]) => url,
	)

// The two kinds of source this policy uses: a full URL allows that one file,
// and a bare origin allows the whole host.
const isAllowed = (url, sources) =>
	sources.includes(url) || sources.includes(new URL(url).origin)

const assertScriptsAllowed = (res) => {
	assert.strictEqual(res.status, 200)
	const scripts = externalScripts(res.text)
	assert.notStrictEqual(scripts.length, 0, 'the page should load a script')
	const sources = scriptSrc(res)
	assert.deepStrictEqual(
		scripts.filter((url) => !isAllowed(url, sources)),
		[],
		'script-src would block these',
	)
}

test(
	'script-src allows no public CDN as a whole host',
	{todo: 'both hosts are allowed as a whole today'},
	async () => {
		const res = await request(app).get('/login')
		const sources = scriptSrc(res)
		assert.deepStrictEqual(
			PUBLIC_CDNS.filter((host) => sources.includes(host)),
			[],
		)
	},
)

// One page per set of script tags: landing.ejs has its own, /login gets the
// footer's, and the campsite page adds headerBack's and its own.
for (const path of ['/', '/login']) {
	test(`every external script on ${path} is allowed by script-src`, async () => {
		assertScriptsAllowed(await request(app).get(path))
	})
}

test('every external script on a campsite page is allowed by script-src', async () => {
	nock(RIDB)
		.get('/api/v1/facilities/233115')
		.query({full: 'true'})
		.reply(200, facility)
	assertScriptsAllowed(await request(app).get('/campsites/show/233115'))
})
