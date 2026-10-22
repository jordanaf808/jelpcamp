// Pins how a view adds its own stylesheet to the shared layout: it passes
// `stylesheets` to the header include, e.g.
//   include("../partials/header", {stylesheets: ['/stylesheets/show.css']})
// The links go in <head>, after wandur.css, so a page's rules win over the base
// rules at equal specificity.
const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const ejs = require('ejs')

const HEADER = path.join(__dirname, '..', 'views', 'partials', 'header.ejs')
const STYLESHEET_LINK = /<link rel="stylesheet" href="([^"]*)"/g

const render = (locals) =>
	ejs.renderFile(HEADER, {currentUser: null, ...locals})
const head = (html) => html.slice(0, html.indexOf('</head>'))
const stylesheets = (html) =>
	[...head(html).matchAll(STYLESHEET_LINK)].map((m) => m[1])

test('without stylesheets, the head links only the shared ones', async () => {
	const links = stylesheets(await render({}))
	assert.strictEqual(links.at(-1), '/stylesheets/wandur.css')
})

test('each stylesheet a view passes is linked in <head>, in order, after wandur.css', async () => {
	const links = stylesheets(
		await render({
			stylesheets: ['/stylesheets/one.css', '/stylesheets/two.css'],
		}),
	)
	assert.deepStrictEqual(links.slice(-3), [
		'/stylesheets/wandur.css',
		'/stylesheets/one.css',
		'/stylesheets/two.css',
	])
})

test('a stylesheet href is escaped', async () => {
	const html = await render({stylesheets: ['/x.css"><script>']})
	assert.ok(!html.includes('/x.css"><script>'))
	assert.ok(head(html).includes('href="/x.css&#34;&gt;&lt;script&gt;"'))
})
