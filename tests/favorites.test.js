// Pins who may see and change a user's favorites. The routes name the user in
// the URL, /user/:id and /user/:id/:camp_id, so being logged in is not enough:
// the logged-in user must be the one the URL names.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const User = require('../models/user')

let app
let alice
let bobId
let campsite

const register = async (username) => {
	const agent = request.agent(app)
	const res = await agent
		.post('/register')
		.type('form')
		.send({username, password: `${username}-pw`})
	assert.strictEqual(
		res.headers.location,
		'/campsites',
		'registration should log the agent in',
	)
	return agent
}

test.before(async () => {
	;({app} = await setup.start())
	alice = await register('alice')
	await register('bob')
	bobId = String((await User.findOne({username: 'bob'}))._id)
	campsite = await Campsite.create({
		name: 'Favorites check',
		id: 1,
		geometry: {TYPE: 'Point', COORDINATES: [0, 0]},
	})
})

test.after(async () => {
	await setup.stop()
})

const favoritesOf = async (username) =>
	(await User.findOne({username})).favorites.map(String)

test('a user can add a campsite to their own favorites', async () => {
	const aliceId = String((await User.findOne({username: 'alice'}))._id)
	const res = await alice.post(`/user/${aliceId}/1`)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/campsites/show/1')
	assert.deepStrictEqual(await favoritesOf('alice'), [String(campsite._id)])
})

test("a user cannot add to another user's favorites", async () => {
	await alice.post(`/user/${bobId}/1`)
	assert.deepStrictEqual(await favoritesOf('bob'), [])
})

test("a user cannot remove from another user's favorites", async () => {
	await User.updateOne({username: 'bob'}, {favorites: [campsite._id]})
	await alice.delete(`/user/${bobId}/1`)
	assert.deepStrictEqual(await favoritesOf('bob'), [String(campsite._id)])
})

test('a user can open their own profile page', async () => {
	const aliceId = String((await User.findOne({username: 'alice'}))._id)
	const res = await alice.get(`/user/${aliceId}`)
	assert.strictEqual(res.status, 200)
})

// The profile page lists that user's favorites.
test(
	"a user cannot open another user's profile page",
	{todo: 'not enforced yet'},
	async () => {
		const res = await alice.get(`/user/${bobId}`)
		assert.strictEqual(res.status, 302)
	},
)
