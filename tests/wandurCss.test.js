// wandur.css loads after main.css, and both style every page until the cleanup
// PR. A class both files style picks up main.css's rules too. .flash-stack
// did: main.css made it a fixed, click-through overlay on top of the nav, so
// the flash messages could not be dismissed.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const read = (file) =>
	fs.readFileSync(path.join(__dirname, '../public/stylesheets', file), 'utf8')

// The class names a stylesheet's selectors use. Declaration blocks are
// removed first, so numbers such as 0.5 and URLs are never read as classes.
const selectorClasses = (css) => {
	const selectors = css
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\{[^{}]*\}/g, '{}')
	return new Set(
		[...selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(([, name]) => name),
	)
}

// The legacy block styles these on purpose, to keep old pages readable.
const LEGACY = ['card', 'search-description', 'favorites-list', 'btn']

test('wandur.css styles no class that main.css styles, apart from its legacy block', () => {
	const main = selectorClasses(read('main.css'))
	const shared = [...selectorClasses(read('wandur.css'))].filter(
		(name) => main.has(name) && !LEGACY.includes(name),
	)
	assert.deepStrictEqual(shared, [])
})

test('the class reader finds main.css classes, so an empty result means something', () => {
	const main = selectorClasses(read('main.css'))
	for (const name of ['flash-stack', 'campcard', 'navbar']) {
		assert.ok(main.has(name), name)
	}
})
