// Order in this file is load-bearing. See each numbered step.
const mongoose = require('mongoose')
const {MongoMemoryServer} = require('mongodb-memory-server')
const {
	rememberEphemeralServer,
	assertEphemeralDb,
	assertNotTheEnvFileDatabase,
} = require('./helpers/assertEphemeralDb')

const TEST_DB = 'yelpcamp_test'

let mongod = null
let app = null

const start = async () => {
	// 1. Ephemeral server first, so we have a URI before anything can read .env.
	mongod = await MongoMemoryServer.create()
	const uri = mongod.getUri(TEST_DB)

	// 2. Register it with the guard, and prove it is not the production URI
	//    BEFORE any connection is opened.
	rememberEphemeralServer(uri)
	assertNotTheEnvFileDatabase(uri)

	// 3. Environment BEFORE the app is required. dotenv does not overwrite
	//    variables that already exist, so setting these first is what stops
	//    app.js from loading the real .env.
	process.env.MONGO_URI = uri
	process.env.SESSION_SECRET = 'test-session-secret'
	process.env.SESSION_STORE_SECRET = 'a'.repeat(128)
	process.env.NODE_ENV = 'test'

	// 4. Connect mongoose, which server.js normally does. Tests do it here
	//    because they deliberately never require server.js. It comes BEFORE the
	//    app because app.js builds its session store on this connection's client
	//    at require time.
	await mongoose.connect(uri)
	assertEphemeralDb()

	// 5. Only now.
	app = require('../app')

	return {app, uri}
}

// Every destructive helper goes through this. The guard runs on each call, not
// once at startup, because a reconnect between tests could land anywhere.
const resetDb = async () => {
	assertEphemeralDb()
	const {collections} = mongoose.connection
	await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}

// Rate-limit counters are keyed by IP and every test hits from the same
// loopback address, so without this the eleventh request of the whole suite
// 429s regardless of which test sent it.
const resetRateLimiters = () => {
	const limiters = require('../middleware/rateLimiters')
	const stores = [limiters.loginStore, limiters.registerStore]
	if (stores.some((s) => !s)) {
		throw new Error(
			'middleware/rateLimiters.js does not export its stores yet.\n' +
				'  Apply the pending diff that constructs an explicit MemoryStore per limiter.',
		)
	}
	stores.forEach((s) => s.resetAll())
}

// Teardown order matters: connect-mongo starts building its TTL index the moment
// its client connects, and closing the client does not wait for it — closing
// mid-build rejects with MongoClientClosedError. Awaiting collectionP waits
// the build out. The catch keeps a failed build from skipping the close and
// leaving the connection open. The store shares mongoose's client, so closing
// mongoose's connection closes the store's too.
//
// rateLimit.test.js never hit this only because its requests write sessions,
// and every store operation awaits collectionP first. A test file that sends no
// requests hit it 20 times in 20 runs (2026-09-11).
const stop = async () => {
	const store = app?.get('sessionStore')
	if (store) await store.collectionP.catch(() => {})
	await mongoose.connection.close()
	if (mongod) await mongod.stop()
}

module.exports = {start, stop, resetDb, resetRateLimiters, TEST_DB}
