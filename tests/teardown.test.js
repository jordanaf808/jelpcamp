// Regression test: tests/setup.js must be able to tear down an app that never
// served a request.
//
// connect-mongo starts building its TTL index the moment its client connects,
// and close() does not wait for it. rateLimit.test.js cannot catch a stop() that
// closes too early: its requests write sessions, and every store operation waits
// for the index build first. This file sends no requests, so it is the only
// place that condition exists. Before stop() awaited collectionP, it failed here
// every time.
//
// The part under test is the after hook, not the test body. An early close()
// makes the in-flight createIndex reject after the test has ended. node:test
// blames the before hook for the late async activity and fails the FILE — the
// test body below still reports ✔, so read the file's own line, not this test's.
const test = require('node:test')
const assert = require('node:assert')
const setup = require('./setup')

let app

test.before(async () => {
	;({app} = await setup.start())
})

test.after(async () => {
	await setup.stop()
})

test('stop() tears down an app that never served a request', () => {
	// stop() closes the store through this. Without it, the store's client stays
	// open and the file hangs instead of failing.
	assert.ok(app.get('sessionStore'))
})
