const mongoose = require('mongoose')

// A hard stop between the test suite and the production database.
//
// The danger here is one line wide. app.js calls `require('dotenv').config()`,
// and dotenv fills any variable that is not ALREADY set. Forget to set
// MONGO_URI before requiring the app and it silently loads .env — which points
// at mongodb+srv://…/storybooks on Atlas. That database is shared by v12, v13
// AND NodeAppFromScratch, so a `deleteMany({})` against it erases all three.
// Nothing about the failure looks like a failure: the tests pass.
//
// So this deliberately checks the LIVE CONNECTION rather than the env var. The
// env var is what we intended; the connection is what we got, and only the
// second one can delete anything. Every prior incident in this repo came from
// the gap between those two.

let expected = null

// Called once by setup.js with the URI that MongoMemoryServer actually handed
// back. Storing the real port makes the check an identity comparison rather
// than a pattern match — "is this the server we started", not "does this look
// local". A pattern match would accept a local production database.
const rememberEphemeralServer = (uri) => {
	const {hostname, port, pathname} = new URL(uri)
	expected = {hostname, port, name: pathname.replace(/^\//, '').split('?')[0]}
	return expected
}

const fail = (why, detail) => {
	throw new Error(
		`REFUSING TO TOUCH THIS DATABASE — ${why}\n` +
			`  ${detail}\n` +
			`  Destructive test helpers only run against the in-memory server this\n` +
			`  process started. See tests/helpers/assertEphemeralDb.js.`,
	)
}

// Call before ANY destructive operation. Cheap enough to call every time.
const assertEphemeralDb = () => {
	if (!expected) fail('no ephemeral server was registered', 'rememberEphemeralServer() was never called')

	const {readyState, host, port, name} = mongoose.connection
	if (readyState !== 1) fail('mongoose is not connected', `readyState=${readyState}`)

	// Loopback only. Atlas is never reachable this way.
	if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
		fail('the connection is not loopback', `host=${host} — expected 127.0.0.1`)
	}
	// The specific port MongoMemoryServer allocated. A different local mongod
	// (or a second, stale in-memory server) fails here.
	if (String(port) !== String(expected.port)) {
		fail('wrong port', `connected to ${host}:${port}, ephemeral server is on ${expected.port}`)
	}
	// And the database name, so a typo cannot redirect within the same server.
	if (name !== expected.name) {
		fail('wrong database name', `connected to "${name}", expected "${expected.name}"`)
	}
	return true
}

// Universal check: depends on nothing outside the URI itself. An in-memory mongod
// is always loopback and never has credentials, so a remote host or an `@` rules a
// URI out on its own terms, on any machine.
//
// This lived INSIDE assertNotTheEnvFileDatabase below, underneath its
// `if (!fs.existsSync(envPath)) return`. That made a check needing nothing
// conditional on a file that only exists on a developer's machine, so the guard
// failed open on CI, in containers, and on fresh clones — the environments least
// likely to notice, and the ones most likely to carry a real MONGO_URI in the
// actual environment. Separated 2026-09-09, after CI caught it on its first run.
// Keep the two apart: they have different preconditions.
const assertNoRemoteHostOrCredentials = (uriInUse) => {
	if (uriInUse.startsWith('mongodb+srv://') || uriInUse.includes('@')) {
		fail('this URI has a remote host or credentials', 'ephemeral servers have neither')
	}
	return true
}

// Machine-specific cross-check, run once at setup: whatever .env would have
// supplied must NOT be what we are about to use. This catches the specific dotenv
// ordering mistake directly, without needing to know what production looks like.
// It also catches a LOCAL production database, which the shape check cannot see.
//
// Legitimately conditional on .env existing — but it runs the unconditional check
// first, so a missing .env can no longer weaken anything.
const assertNotTheEnvFileDatabase = (uriInUse) => {
	assertNoRemoteHostOrCredentials(uriInUse)

	const fs = require('fs')
	const path = require('path')
	const envPath = path.join(__dirname, '..', '..', '.env')
	if (!fs.existsSync(envPath)) return

	const line = fs.readFileSync(envPath, 'utf8').match(/^\s*MONGO_URI\s*=\s*(.+)$/m)
	if (!line) return
	const fromEnvFile = line[1].trim().replace(/^["']|["']$/g, '')

	if (uriInUse === fromEnvFile) {
		fail('this is the URI from .env', 'the test suite is pointed at the real database')
	}
}

module.exports = {
	rememberEphemeralServer,
	assertEphemeralDb,
	assertNotTheEnvFileDatabase,
	assertNoRemoteHostOrCredentials,
}
