// #68: server.js when the database cannot be reached.
//
// The only file that runs server.js, in a child process, because it exits the
// process on failure. The URI is a loopback port nothing listens on, set in the
// child's environment, so dotenv cannot replace it with the one in .env.
const test = require('node:test')
const assert = require('node:assert')
const {spawn} = require('node:child_process')
const path = require('node:path')

const runServer = (env) =>
	new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['server.js'], {
			cwd: path.join(__dirname, '..'),
			env: {...process.env, ...env},
		})
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (chunk) => (stdout += chunk))
		child.stderr.on('data', (chunk) => (stderr += chunk))
		const timer = setTimeout(() => {
			child.kill()
			reject(new Error(`server.js did not exit.\n${stdout}\n${stderr}`))
		}, 10_000)
		child.on('exit', (code) => {
			clearTimeout(timer)
			resolve({code, stdout, stderr})
		})
	})

test('server.js exits with one clear line, without listening, when the database is unreachable', async () => {
	const {code, stdout, stderr} = await runServer({
		MONGO_URI:
			'mongodb://127.0.0.1:1/yelpcamp_test?serverSelectionTimeoutMS=500',
		PORT: '0',
		SESSION_SECRET: 'test-session-secret',
		SESSION_STORE_SECRET: 'a'.repeat(128),
		NODE_ENV: 'test',
	})

	assert.strictEqual(code, 1)
	assert.match(stderr, /^Could not connect to MongoDB: /m)
	assert.doesNotMatch(stdout, /listening/)
})
