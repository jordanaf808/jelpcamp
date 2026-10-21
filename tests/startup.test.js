// server.js at startup: #68, when the database cannot be reached, and which
// database a Render PR preview connects to.
//
// The only file that runs server.js, in a child process, because it exits the
// process on failure. Every URI is set in the child's environment, so dotenv
// cannot replace it with the one in .env. PREVIEW_MONGO_URI is set to '' where a
// test needs it missing, for the same reason.
const test = require('node:test')
const assert = require('node:assert')
const {spawn} = require('node:child_process')
const path = require('node:path')
const mongoose = require('mongoose')
const {MongoMemoryServer} = require('mongodb-memory-server')

const SECRETS = {
	SESSION_SECRET: 'test-session-secret',
	SESSION_STORE_SECRET: 'a'.repeat(128),
	NODE_ENV: 'test',
}

// Resolves once server.js exits or logs that it is listening. A listening
// server keeps running until stop(), which every test registers with t.after.
const runServer = (env) =>
	new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['server.js'], {
			cwd: path.join(__dirname, '..'),
			env: {...process.env, PORT: '0', ...SECRETS, ...env},
		})
		const closed = new Promise((done) => child.once('close', done))
		const server = {
			code: null,
			listening: false,
			stdout: '',
			stderr: '',
			stop: async () => {
				child.kill()
				await closed
			},
		}
		const timer = setTimeout(() => {
			child.kill()
			reject(
				new Error(
					`server.js neither exited nor listened.\n${server.stdout}\n${server.stderr}`,
				),
			)
		}, 10_000)
		child.stdout.on('data', (chunk) => {
			server.stdout += chunk
			if (/listening/.test(server.stdout)) {
				clearTimeout(timer)
				server.listening = true
				resolve(server)
			}
		})
		child.stderr.on('data', (chunk) => (server.stderr += chunk))
		child.on('close', (code) => {
			clearTimeout(timer)
			server.code = code
			resolve(server)
		})
	})

// One in-memory server stands in for the Atlas cluster. Each test gets its own
// pair of database names, so what one test writes cannot satisfy another.
let mongod = null
let inspector = null

test.before(async () => {
	mongod = await MongoMemoryServer.create()
	inspector = await mongoose.createConnection(mongod.getUri()).asPromise()
})

test.after(async () => {
	await inspector?.close()
	await mongod?.stop()
})

const collectionsIn = async (dbName) => {
	const found = await inspector
		.getClient()
		.db(dbName)
		.listCollections()
		.toArray()
	return found.map((c) => c.name)
}

// connect-mongo creates its TTL index, and so the `sessions` collection, as
// soon as its client connects. Finding it shows where the session store went.
const sessionStoreReached = async (dbName) => {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		if ((await collectionsIn(dbName)).includes('sessions')) return true
		await new Promise((done) => setTimeout(done, 100))
	}
	return false
}

test('server.js exits with one clear line, without listening, when the database is unreachable', async (t) => {
	const server = await runServer({
		MONGO_URI:
			'mongodb://127.0.0.1:1/yelpcamp_test?serverSelectionTimeoutMS=500',
	})
	t.after(server.stop)

	assert.strictEqual(server.code, 1)
	assert.match(server.stderr, /^Could not connect to MongoDB: /m)
	assert.doesNotMatch(server.stdout, /listening/)
})

test(
	'a preview without PREVIEW_MONGO_URI exits before touching MONGO_URI',
	{todo: 'falls back to MONGO_URI, the production database, and listens'},
	async (t) => {
		const server = await runServer({
			IS_PULL_REQUEST: 'true',
			MONGO_URI: mongod.getUri('unset_production'),
			PREVIEW_MONGO_URI: '',
		})
		t.after(server.stop)

		assert.strictEqual(server.code, 1, 'server.js started instead of exiting')
		assert.match(
			server.stderr,
			/^Could not connect to MongoDB: PREVIEW_MONGO_URI is not set/m,
		)
		assert.deepStrictEqual(await collectionsIn('unset_production'), [])
	},
)

test(
	'a preview connects mongoose and the session store to PREVIEW_MONGO_URI',
	{todo: 'both connect to MONGO_URI, the production database'},
	async (t) => {
		const server = await runServer({
			IS_PULL_REQUEST: 'true',
			MONGO_URI: mongod.getUri('preview_production'),
			PREVIEW_MONGO_URI: mongod.getUri('preview_preview'),
		})
		t.after(server.stop)

		assert.ok(server.listening, `server.js did not start.\n${server.stderr}`)
		assert.ok(
			await sessionStoreReached('preview_preview'),
			'the session store never reached the preview database',
		)
		assert.deepStrictEqual(await collectionsIn('preview_production'), [])
		assert.match(server.stdout, /^database connected: preview_preview$/m)
	},
)

// Render sets the STRING 'false' outside previews, and 'false' is truthy.
test(
	"IS_PULL_REQUEST 'false' is not a preview: both connect to MONGO_URI",
	{todo: 'logs "database connected" without the database name'},
	async (t) => {
		const server = await runServer({
			IS_PULL_REQUEST: 'false',
			MONGO_URI: mongod.getUri('live_production'),
			PREVIEW_MONGO_URI: mongod.getUri('live_preview'),
		})
		t.after(server.stop)

		assert.ok(server.listening, `server.js did not start.\n${server.stderr}`)
		assert.ok(
			await sessionStoreReached('live_production'),
			'the session store never reached MONGO_URI',
		)
		assert.deepStrictEqual(await collectionsIn('live_preview'), [])
		assert.match(server.stdout, /^database connected: live_production$/m)
	},
)
