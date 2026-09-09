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

// Regression test for the fail-open bug CI found on 2026-09-09, and deliberately
// environment-blind: it calls the unconditional check directly, so it behaves
// identically on a machine with .env and one without.
//
// The test above cannot do that job on its own. It goes through
// assertNotTheEnvFileDatabase, which reads the filesystem — so before the fix it
// passed here (where .env exists) and failed on CI (where it does not). A guard
// test that only fires in some environments is the thing being guarded against.
test('refuses a remote URI through the unconditional check alone', () => {
	const g = fresh()
	assert.throws(() => g.assertNoRemoteHostOrCredentials(PROD), /remote host or credentials/)
	assert.throws(
		() => g.assertNoRemoteHostOrCredentials('mongodb://user:pw@10.0.0.5:27017/prod'),
		/remote host or credentials/,
	)
	// ...and lets a genuine ephemeral URI through, so it is not just always throwing.
	assert.strictEqual(
		g.assertNoRemoteHostOrCredentials('mongodb://127.0.0.1:31337/yelpcamp_test'),
		true,
	)
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
