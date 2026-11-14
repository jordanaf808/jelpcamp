// Pins the homepage's scene hero (views/campsites/index.ejs; the plan is
// docs/hero-3d-model/plan.md): the element, its two scripts, and the modules
// it imports. The scene itself needs WebGL, so a browser checks the rest.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const list = require('./fixtures/ridb-facilities-list-full.json')

const RIDB = 'https://ridb.recreation.gov'

let app
let html

test.before(async () => {
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
	nock(RIDB).get('/api/v1/facilities').query(true).reply(200, list)
	const res = await request(app).get('/campsites')
	assert.strictEqual(res.status, 200)
	html = res.text
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const sceneTag = () => {
	const tag = html.match(/<wandur-campsite\b[^>]*>/)
	assert.ok(tag, 'the homepage should have <wandur-campsite>')
	return tag[0]
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

test('the homepage has the scene element, and loads its scripts from this site, deferred', () => {
	const tag = sceneTag()
	for (const name of ['data-three-src', 'data-scene-src']) {
		assert.match(
			attr(tag, name) ?? '',
			/^\/[^/]/,
			`${name}: a path on this site`,
		)
	}
	for (const file of ['wandurCampsite', 'heroSearch']) {
		assert.match(
			html,
			new RegExp(`<script src="/js/${file}\\.js" defer></script>`),
			file,
		)
	}
})

// The element import()s these, so no <script> tag names them and
// tests/csp.test.js never sees them. A module that 404s, or comes back with a
// type the browser won't run, leaves the hero without its scene, silently.
test('every module the scene imports is served as JavaScript', async () => {
	const tag = sceneTag()
	const queue = [attr(tag, 'data-three-src'), attr(tag, 'data-scene-src')]
	const seen = new Set()
	while (queue.length) {
		const path = queue.shift()
		if (seen.has(path)) continue
		seen.add(path)
		const res = await request(app).get(path).buffer(true)
		assert.strictEqual(res.status, 200, path)
		assert.match(res.headers['content-type'], /javascript/, path)
		const source = res.text ?? res.body.toString()
		// `from './x.js'`, a bare `import './x.js'`, and `import('./x.js')`.
		// Only relative module paths, the only kind these modules use: a
		// looser match finds strings inside minified three.js.
		const imports = /\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.m?js)["']/g
		for (const [, spec] of source.matchAll(imports)) {
			queue.push(new URL(spec, `http://site${path}`).pathname)
		}
	}
	// three.module.js imports it: proof the minified build kept the import,
	// and that the search above read minified code.
	assert.ok(seen.has('/vendor/three/three.core.js'), [...seen].join(', '))
})
