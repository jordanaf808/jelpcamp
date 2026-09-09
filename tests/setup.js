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

	// 4. Only now. app.js builds MongoStore at require time off MONGO_URI.
	app = require('../app')

	// 5. The models connect through mongoose, which server.js normally opens.
	//    Tests do it here because they deliberately never require server.js.
	await mongoose.connect(uri)
	assertEphemeralDb()

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

// Teardown order matters: the session store holds its own MongoClient and will
// keep the event loop open. connect-mongo also builds its TTL index lazily, so
// closing it mid-flight throws MongoExpiredSessionError.
const stop = async () => {
	if (app?.get('sessionStore')) await app.get('sessionStore').close()
	await mongoose.connection.close()
	if (mongod) await mongod.stop()
}

module.exports = {start, stop, resetDb, resetRateLimiters, TEST_DB}
