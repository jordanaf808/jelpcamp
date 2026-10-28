// The session store runs on mongoose's connection, not one of its own.
//
// It used to open a second MongoClient from the same URI: two connection pools
// to the database, and a teardown that had to close the store apart from
// mongoose. A store built before mongoose connects has no client to share, so
// requiring app.js first must fail with a line that says so.
const test = require('node:test')
const assert = require('node:assert')
const {spawnSync} = require('node:child_process')
const path = require('node:path')
const mongoose = require('mongoose')
const setup = require('./setup')

let app

test.before(async () => {
	;({app} = await setup.start())
})

test.after(async () => {
	await setup.stop()
})

test("the session store uses mongoose's MongoClient", async () => {
	const store = app.get('sessionStore')
	assert.strictEqual(await store.clientP, mongoose.connection.getClient())
})

test('requiring app.js before mongoose has connected fails with one clear line', () => {
	const child = spawnSync(process.execPath, ['-e', "require('./app')"], {
		cwd: path.join(__dirname, '..'),
		encoding: 'utf8',
		env: {
			...process.env,
			// dotenv does not overwrite these, so .env is never read.
			MONGO_URI: 'mongodb://127.0.0.1:1/yelpcamp_test',
			SESSION_SECRET: 'test-session-secret',
			SESSION_STORE_SECRET: 'a'.repeat(128),
			NODE_ENV: 'test',
		},
	})
	assert.notStrictEqual(child.status, 0)
	assert.match(child.stderr, /mongoose must connect before app\.js is loaded/)
})
