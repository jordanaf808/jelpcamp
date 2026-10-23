// Pins what the redesigned list pages, /campsites and /campsites/search, render:
// the cards, the search form and its pre-fill, and how Mapbox loads.
//
// Both pages render from the same partials: views/partials/searchForm.ejs,
// facilityCard.ejs and campsiteMap.ejs.
//
// RIDB responses are cached per process, so /campsites is fetched once, and
// each search uses its own query.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const nock = require('nock')
const setup = require('./setup')
const list = require('./fixtures/ridb-facilities-list-full.json')

const RIDB = 'https://ridb.recreation.gov'
const FACILITIES = {
	233115: 'UNION CREEK CAMPGROUND',
	900001: 'FIXTURE PEAK TRAILHEAD',
	900002: 'FIXTURE RIVER CAMPGROUND',
}

let app
const pages = {}

const get = (path) => request(app).get(path).timeout(5000)

test.before(async () => {
	;({app} = await setup.start())
	nock.disableNetConnect()
	nock.enableNetConnect('127.0.0.1')
	nock(RIDB).get('/api/v1/facilities').query(true).times(3).reply(200, list)

	pages.index = await get('/campsites')
	pages.search = await get('/campsites/search?search=pages')
	pages.prefilled = await get(
		'/campsites/search?search=lake&activities=100047&state=OR&limit=10',
	)
	for (const [name, res] of Object.entries(pages)) {
		assert.strictEqual(res.status, 200, name)
	}
})

test.after(async () => {
	nock.cleanAll()
	nock.enableNetConnect()
	await setup.stop()
})

const mainOf = (html) => {
	const start = html.indexOf('<main id="main"')
	const end = html.indexOf('</main>')
	assert.ok(start !== -1 && end > start, 'the page should have one <main>')
	return html.slice(start, end)
}

const formOf = (html) => {
	const form = html.match(
		/<form\b[^>]*action="\/campsites\/search"[^>]*>[\s\S]*?<\/form>/,
	)
	assert.ok(form, 'the page should have the search form')
	return form[0]
}

// The <select> with this name, from its opening tag to </select>.
const selectOf = (form, name) => {
	const select = form.match(
		new RegExp(`<select\\b[^>]*name="${name}"[^>]*>[\\s\\S]*?</select>`),
	)
	assert.ok(select, `the form should have a ${name} select`)
	return select[0]
}

// The card that links this facility: the <article> around its link.
const cardOf = (html, id) => {
	const cards = mainOf(html)
		.split(/(?=<article\b)/)
		.slice(1)
	const card = cards.find((c) => c.includes(`/campsites/show/${id}"`))
	assert.ok(card, `the page should have a card for ${id}`)
	return card.slice(0, card.indexOf('</article>'))
}

const listPages = () => [
	['/campsites', pages.index.text],
	['/campsites/search', pages.search.text],
]

test('each list page renders every mapped facility with its name and link', () => {
	for (const [path, html] of listPages()) {
		const main = mainOf(html)
		for (const [id, name] of Object.entries(FACILITIES)) {
			assert.ok(main.includes(`href="/campsites/show/${id}"`), `${path}: ${id}`)
			assert.ok(main.includes(name), `${path}: ${id}'s name`)
		}
		assert.ok(!html.includes('/campsites/show/900003'), path)
	}
})

test('each facility has its own card, with its name in a heading', () => {
	for (const [path, html] of listPages()) {
		for (const [id, name] of Object.entries(FACILITIES)) {
			assert.match(
				cardOf(html, id),
				new RegExp(`<h3\\b[^>]*>[\\s\\S]*${name}[\\s\\S]*</h3>`),
				`${path}: ${id}`,
			)
		}
	}
})

// The description is clamped to 3 lines. A link in it would be hidden while
// Tab still reached it, so the card shows a plain-text summary.
test("a card's only link is its name, and its summary is escaped once", () => {
	for (const [path, html] of listPages()) {
		const card = cardOf(html, '233115')
		assert.strictEqual(
			(card.match(/<a\b/g) ?? []).length,
			1,
			`${path}: one link`,
		)
		assert.match(
			card,
			/class="facility-card__desc">[^<]*<\/p>/,
			`${path}: no RIDB HTML`,
		)
		assert.doesNotMatch(card, /&amp;amp;/, `${path}: escaped once`)
		assert.match(card, /One of Eastern Oregon’s largest/, path)
	}
})

test('a facility with no photo gets the placeholder, and one with a photo gets a lazy <img>', () => {
	for (const [path, html] of listPages()) {
		const empty = cardOf(html, '900001')
		assert.match(empty, /FACILITY PHOTO/, `${path}: 900001's placeholder`)
		assert.doesNotMatch(empty, /<img\b/, `${path}: 900001 has no <img>`)
		// No state and no rec area: both are left out, not printed as null.
		assert.doesNotMatch(empty, /null/, `${path}: 900001 prints no null`)

		const photo = list.RECDATA[0].MEDIA.find((m) => m.IsPrimary).URL
		const img = cardOf(html, '233115').match(/<img\b[^>]*>/)
		assert.ok(img, `${path}: 233115 has an <img>`)
		assert.ok(img[0].includes(`src="${photo}"`), `${path}: its photo`)
		assert.match(img[0], /\bloading="lazy"/, `${path}: lazy`)
		assert.match(img[0], /\balt="/, `${path}: alt`)
	}
})

test('each list page has one <h1>', () => {
	for (const [path, html] of listPages()) {
		assert.strictEqual((html.match(/<h1\b/g) ?? []).length, 1, path)
	}
})

test('every field in the search form has a <label>', () => {
	for (const [path, html] of listPages()) {
		const form = formOf(html)
		const controls = [...form.matchAll(/<(input|select)\b[^>]*>/g)]
		assert.strictEqual(controls.length, 4, `${path}: four fields`)
		for (const [control] of controls) {
			const id = control.match(/\bid="([^"]+)"/)?.[1]
			assert.ok(id, `${path}: ${control} needs an id`)
			assert.match(
				form,
				new RegExp(`<label\\b[^>]*\\bfor="${id}"`),
				`${path}: #${id} needs a <label for>`,
			)
		}
	}
})

test('the search form keeps its action, method and field names', () => {
	for (const [path, html] of listPages()) {
		const form = formOf(html)
		assert.match(form, /^<form\b[^>]*method="GET"/i, path)
		assert.match(form, /<input\b[^>]*name="search"/, path)
		for (const name of ['activities', 'state', 'limit']) selectOf(form, name)
	}
})

test('a search comes back with its choices selected among the existing options', () => {
	const form = formOf(pages.prefilled.text)
	assert.match(form, /<input\b[^>]*name="search"[^>]*value="lake"/)

	const chosen = {activities: '100047', state: 'OR', limit: '10'}
	const labels = {activities: 'ARCHERY', state: 'Oregon', limit: '10'}
	for (const [name, value] of Object.entries(chosen)) {
		const select = selectOf(form, name)
		const options = [...select.matchAll(/<option\b[^>]*>[^<]*<\/option>/g)]
		const matching = options.filter(([o]) => o.includes(`value="${value}"`))
		assert.strictEqual(matching.length, 1, `${name}: one ${value} option`)
		assert.match(matching[0][0], /\bselected\b/, `${name}: it is selected`)
		assert.ok(matching[0][0].includes(labels[name]), `${name}: its label`)
		const selected = options.filter(([o]) => /\bselected\b/.test(o))
		assert.strictEqual(selected.length, 1, `${name}: one selected option`)
	}
	// The same select on the index, without a search, has the same options.
	for (const name of Object.keys(chosen)) {
		const count = (html) =>
			(selectOf(formOf(html), name).match(/<option\b/g) ?? []).length
		assert.strictEqual(
			count(pages.prefilled.text),
			count(pages.index.text),
			`${name}: no extra option`,
		)
	}
})

test('the map panel counts the facilities it plots', () => {
	for (const [path, html] of listPages()) {
		assert.ok(mainOf(html).includes('MAP · 3 FACILITIES'), path)
	}
})

// mapContract.test.js allows both plain or both deferred. Deferred keeps
// mapbox-gl.js (about 1.85 MB raw) from blocking the landing page's first paint.
test('mapbox-gl.js and map.js are both deferred', () => {
	for (const [path, html] of listPages()) {
		for (const file of ['mapbox-gl\\.js', '/js/map\\.js']) {
			const tag = html.match(
				new RegExp(`<script\\b[^>]*src="[^"]*${file}"[^>]*>`),
			)
			assert.ok(tag, `${path}: ${file}`)
			assert.match(tag[0], /\sdefer\b/, `${path}: ${file} is deferred`)
		}
	}
})

// Bootstrap 4 and Font Awesome go in the cleanup PR, which must not need to
// touch these views. The flash list in <main> comes from the layout and uses
// none either.
const BOOTSTRAP_OR_FA = new RegExp(
	'^(' +
		[
			'container(-fluid|-sm|-md|-lg|-xl)?',
			'row',
			'no-gutters',
			'col(-(sm|md|lg|xl))?(-(\\d+|auto))?',
			'(offset|order)-.+',
			'btn(-.+)?',
			'card(-.+)?',
			'(form|custom|input-group)(-.+)?',
			'jumbotron(-fluid)?',
			'display-\\d',
			'lead',
			'small',
			'badge(-.+)?',
			'alert(-.+)?',
			'nav(bar)?(-.+)?',
			'list-(group|unstyled|inline)(-.+)?',
			'(text|font|bg|border|rounded|shadow)(-.+)?',
			'[mp][trblxy]?(-(sm|md|lg|xl))?-n?(\\d|auto)',
			'[wh]-(25|50|75|100|auto)',
			'(d|flex|justify-content|align-(items|self|content)|float|position|overflow)-.+',
			'(fixed|sticky)-(top|bottom)',
			'sr-only(-focusable)?',
			'(in)?visible',
			'img-(fluid|thumbnail)',
			'h[1-6]',
			'(collapse|collapsing|show|fade|active|disabled|close|clearfix|stretched-link)',
			'fa[srlbd]?',
			'fa-.+',
		].join('|') +
		')$',
)

test('no Bootstrap or Font Awesome class is left in <main>', () => {
	for (const [path, html] of listPages()) {
		const classes = [...mainOf(html).matchAll(/\bclass="([^"]*)"/g)]
			.flatMap(([, value]) => value.split(/\s+/))
			.filter(Boolean)
		assert.ok(classes.length > 0, `${path}: some classes`)
		const found = classes.filter((name) => BOOTSTRAP_OR_FA.test(name))
		assert.deepStrictEqual(found, [], path)
	}
})
