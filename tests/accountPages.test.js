// The redesigned favorites, login, register and comment pages. Each test reads
// the rendered HTML.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')
const User = require('../models/user')

let app
let agent
let user
let comment

const geometry = {TYPE: 'Point', COORDINATES: [0, 0]}

test.before(async () => {
	;({app} = await setup.start())
	agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'elmer', password: 'elmer-pw'})
	assert.strictEqual(
		res.headers.location,
		'/campsites',
		'registration should log the agent in',
	)
	user = await User.findOne({username: 'elmer'})
	await Campsite.create({
		name: 'Full Record Camp',
		id: 11,
		state: 'OR',
		recAreaName: 'Siuslaw National Forest',
		geometry,
	})
	await Campsite.create({name: 'Old Record Camp', id: 12, geometry})
	await Campsite.create({name: 'Comment Camp', id: 13, geometry})
	comment = await Comment.create({
		text: 'a comment over ten characters',
		author: {id: user._id, username: user.username},
	})
	await Comment.create({
		text: 'another comment over ten',
		author: {id: user._id, username: user.username},
	})
})

test.after(async () => {
	await setup.stop()
})

const favorite = async (...ids) => {
	const camps = await Campsite.find({id: {$in: ids}})
	await User.updateOne({_id: user._id}, {favorites: camps.map((c) => c._id)})
}

const stat = (html, label) =>
	html.match(
		new RegExp(
			`<span class="account-stat__value">(\\d+)</span>\\s*<span class="account-stat__label">${label}</span>`,
		),
	)?.[1]

// The rows of the favorites table, as text.
const rows = (html) =>
	[...html.matchAll(/<tr class="account-row">([\s\S]*?)<\/tr>/g)].map((m) =>
		m[1]
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim(),
	)

test('the favorites page shows each favorite with its state and rec area', async () => {
	await favorite(11)
	const res = await agent.get(`/user/${user._id}`)
	assert.strictEqual(res.status, 200)
	const [row] = rows(res.text)
	assert.match(row, /^1 Full Record Camp Siuslaw National Forest OR/)
})

test('the favorites page shows a dash for a missing state or rec area', async () => {
	await favorite(12)
	const res = await agent.get(`/user/${user._id}`)
	assert.match(rows(res.text)[0], /^1 Old Record Camp — —/)
})

test('the favorites page numbers rows from 1 and keeps the remove form', async () => {
	await favorite(11, 12)
	const res = await agent.get(`/user/${user._id}`)
	const found = rows(res.text)
	assert.strictEqual(found.length, 2)
	assert.match(found[1], /^2 /)
	assert.match(
		res.text,
		new RegExp(`action="/user/${user._id}/12\\?_method=DELETE"`),
	)
	assert.match(res.text, /href="\/campsites\/show\/11"/)
})

test('the favorites page shows the favorites count and the comment count', async () => {
	await favorite(11, 12)
	const res = await agent.get(`/user/${user._id}`)
	assert.strictEqual(stat(res.text, 'Favorites'), '2')
	assert.strictEqual(stat(res.text, 'Comments'), '2')
})

test('the favorites page shows an empty state with no favorites', async () => {
	await favorite()
	const res = await agent.get(`/user/${user._id}`)
	assert.deepStrictEqual(rows(res.text), [])
	assert.match(res.text, /class="account-empty"/)
	assert.strictEqual(stat(res.text, 'Favorites'), '0')
})

// Every field needs a <label>. This finds each input's id and looks for a
// label that names it.
for (const path of ['/login', '/register']) {
	test(`${path} ties a label to each field`, async () => {
		const res = await request(app).get(path)
		const inputs = [...res.text.matchAll(/<input\b[^>]*>/g)]
			.map((m) => m[0])
			.filter((tag) => !/type="submit"/.test(tag))
		assert.strictEqual(inputs.length, 2)
		for (const tag of inputs) {
			const id = tag.match(/\bid="([^"]+)"/)?.[1]
			assert.ok(id, `${tag} needs an id`)
			assert.match(res.text, new RegExp(`<label\\b[^>]*for="${id}"`), id)
		}
	})
}

test('the new-comment page uses a labelled textarea', async () => {
	const res = await agent.get('/campsites/13/comments/new')
	assert.match(res.text, /<textarea\b[^>]*name="comment\[text\]"/)
	assert.match(res.text, /<label\b[^>]*for="comment-text"/)
})

test('the edit-comment page validates, has no back link, and links to the campsite', async () => {
	const res = await agent.get(`/campsites/13/comments/${comment._id}/edit`)
	assert.strictEqual(res.status, 200)
	assert.match(res.text, /<form\b[^>]*class="[^"]*validated-form/)
	assert.match(res.text, /<script src="\/js\/validateForms\.js"><\/script>/)
	assert.match(res.text, /<textarea\b[^>]*name="comment\[text\]"[^>]*required/)
	assert.match(res.text, /<label\b[^>]*for="comment-text"/)
	assert.match(res.text, /_method=PUT/)
	assert.doesNotMatch(res.text, /data-back/)
	assert.match(res.text, /href="\/campsites\/show\/13"/)
})
