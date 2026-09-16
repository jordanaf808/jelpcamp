// Pins comment deletion end to end, ahead of the Mongoose 7 -> 9 migration:
// the DESTROY route used Comment.findByIdAndRemove(), an alias Mongoose 8
// removes. This proves findByIdAndDelete() behaves the same way before the
// swap. Create and update aren't covered here; see SECURITY-FINDINGS.md.
const test = require('node:test')
const assert = require('node:assert')
const request = require('supertest')
const setup = require('./setup')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')

const HOST = 'yelpcamp.test'

let app
let agent

test.before(async () => {
	app = (await setup.start()).app
	agent = request.agent(app)

	const res = await agent
		.post('/register')
		.type('form')
		.send({username: 'comment-owner', password: 'comment-owner-pw'})
	assert.strictEqual(res.headers.location, '/campsites', 'registration should log the agent in')
	await Campsite.create({name: 'Comment check', id: 2, geometry: {TYPE: 'Point', COORDINATES: [0, 0]}})
})

test.after(async () => {
	await setup.stop()
})

test('deleting an owned comment removes it and redirects to the campsite', async () => {
	const created = await agent
		.post('/campsites/2/comments')
		.set('Host', HOST)
		.type('form')
		.send({'comment[text]': 'a valid comment over ten characters'})
	assert.strictEqual(created.status, 302)
	assert.strictEqual(created.headers.location, '/campsites/show/2')

	const comment = await Comment.findOne({'author.username': 'comment-owner'})
	assert.ok(comment, 'the comment should have saved')

	const res = await agent
		.delete(`/campsites/2/comments/${comment._id}`)
		.set('Host', HOST)
	assert.strictEqual(res.status, 302)
	assert.strictEqual(res.headers.location, '/campsites/show/2')

	assert.strictEqual(await Comment.findById(comment._id), null)
})
