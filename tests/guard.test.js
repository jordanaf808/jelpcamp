// The guard is the only thing standing between `npm test` and the live Atlas
// database. A guard nobody has seen fire is not a guard, so these tests point it
// at production-shaped inputs and assert that it refuses.
const test = require('node:test')
const assert = require('node:assert')
const mongoose = require('mongoose')
const {MongoMemoryServer} = require('mongodb-memory-server')

const guardPath = require.resolve('./helpers/assertEphemeralDb')
const fresh = () => {
	delete require.cache[guardPath]
	return require(guardPath)
}

const PROD = 'mongodb+srv://user:pw@example-cluster.abcde.mongodb.net/some_prod_db?retryWrites=true&w=majority'

test('refuses an Atlas URI outright', () => {
	const g = fresh()
	g.rememberEphemeralServer('mongodb://127.0.0.1:31337/yelpcamp_test')
	assert.throws(() => g.assertNotTheEnvFileDatabase(PROD), /remote host or credentials/)
})

test('refuses the URI that .env actually contains', () => {
	const g = fresh()
	const fs = require('fs')
	const path = require('path')
	const envPath = path.join(__dirname, '..', '.env')
	if (!fs.existsSync(envPath)) return // nothing to compare against

	const m = fs.readFileSync(envPath, 'utf8').match(/^\s*MONGO_URI\s*=\s*(.+)$/m)
	if (!m) return
	const realUri = m[1].trim().replace(/^["']|["']$/g, '')

	g.rememberEphemeralServer('mongodb://127.0.0.1:31337/yelpcamp_test')
	assert.throws(() => g.assertNotTheEnvFileDatabase(realUri), /this is the URI from \.env|remote host/)
})

test('refuses when nothing was registered', () => {
	const g = fresh()
	assert.throws(() => g.assertEphemeralDb(), /no ephemeral server was registered/)
})

test('refuses a real connection on the wrong port', async (t) => {
	const g = fresh()
	const mongod = await MongoMemoryServer.create()
	t.after(async () => {
		await mongoose.connection.close()
		await mongod.stop()
	})

	const uri = mongod.getUri('yelpcamp_test')
	await mongoose.connect(uri)

	// Registered against a DIFFERENT server than the one we connected to —
	// this is the shape of "the env var said one thing, the connection did another".
	g.rememberEphemeralServer('mongodb://127.0.0.1:31337/yelpcamp_test')
	assert.throws(() => g.assertEphemeralDb(), /wrong port/)

	// And it passes once they agree.
	g.rememberEphemeralServer(uri)
	assert.strictEqual(g.assertEphemeralDb(), true)
})

test('refuses a mismatched database name on the right server', async (t) => {
	const g = fresh()
	const mongod = await MongoMemoryServer.create()
	t.after(async () => {
		await mongoose.connection.close()
		await mongod.stop()
	})

	await mongoose.connect(mongod.getUri('yelpcamp_test'))
	g.rememberEphemeralServer(mongod.getUri('storybooks')) // same host+port, prod-ish name
	assert.throws(() => g.assertEphemeralDb(), /wrong database name/)
})
