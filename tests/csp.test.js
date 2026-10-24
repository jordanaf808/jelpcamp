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
const list = require('./fixtures/ridb-facilities-list-full.json')

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
// The scheme is optional: //host/file.js is external too.
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc="((?:https?:)?\/\/[^"]+)"/g

// The site is served over https, so that is what //host/file.js loads as.
const externalScripts = (html) =>
	[...html.replace(HTML_COMMENT, '').matchAll(EXTERNAL_SCRIPT)].map(
		([, src]) => (src.startsWith('//') ? `https:${src}` : src),
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

test('script-src allows no public CDN as a whole host', async () => {
	const res = await request(app).get('/login')
	const sources = scriptSrc(res)
	assert.deepStrictEqual(
		PUBLIC_CDNS.filter((host) => sources.includes(host)),
		[],
	)
})

// One page per set of script tags. The layout's own are all on this site, so
// /login has none from elsewhere. /campsites adds Mapbox, and the campsite page
// adds the Google map's and the Flickr embed.
test('/login, with only the layout, loads no external script', async () => {
	const res = await request(app).get('/login')
	assert.strictEqual(res.status, 200)
	assert.deepStrictEqual(externalScripts(res.text), [])
})

test('every external script on /campsites is allowed by script-src', async () => {
	nock(RIDB).get('/api/v1/facilities').query(true).reply(200, list)
	assertScriptsAllowed(await request(app).get('/campsites'))
})

test('every external script on a campsite page is allowed by script-src', async () => {
	nock(RIDB)
		.get('/api/v1/facilities/233115')
		.query({full: 'true'})
		.reply(200, facility)
	assertScriptsAllowed(await request(app).get('/campsites/show/233115'))
})

// A src can leave the scheme out: //host/file.js loads over the page's own.
// The Flickr embed on the campsite page is written that way, and a check that
// only reads URLs starting with http never sees it.
test('the script check reads a src that has no scheme', async () => {
	nock(RIDB)
		.get('/api/v1/facilities/6')
		.query({full: 'true'})
		.reply(200, {...facility, FacilityID: '6'})
	const res = await request(app).get('/campsites/show/6')
	assert.strictEqual(res.status, 200)
	assert.ok(
		externalScripts(res.text).includes(
			'https://embedr.flickr.com/assets/client-code.js',
		),
		`the check found: ${externalScripts(res.text).join(', ')}`,
	)
})

// The sources this app listed for Bootstrap, jQuery, Popper and Font Awesome:
// four whole hosts, in one directive or another, and Popper's one file on
// jsDelivr. No page loads them any more, so no directive names them. Another
// file on jsDelivr or cdnjs, listed by its full URL as app.js says, is not one
// of these.
const REMOVED_SOURCES = [
	'https://code.jquery.com',
	'https://stackpath.bootstrapcdn.com',
	'https://cdnjs.cloudflare.com',
	'https://cdn.jsdelivr.net',
	'https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js',
]

test('the CSP names none of the removed CDN sources, in any directive', async () => {
	const res = await request(app).get('/login')
	const named = res.headers['content-security-policy']
		.split(';')
		.flatMap((directive) => {
			const [name, ...sources] = directive.trim().split(/\s+/)
			return sources
				.filter((source) => REMOVED_SOURCES.includes(source))
				.map((source) => `${name} ${source}`)
		})
	assert.deepStrictEqual(named, [])
})
