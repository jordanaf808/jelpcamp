const rateLimit = require('express-rate-limit')

// Rate limiters for the authentication endpoints.
//
// `passport-local-mongoose` hashes with pbkdf2, so this is not about weak
// hashing — it is about online guessing. Without a limit, /login accepts
// unlimited attempts at whatever rate an attacker can send them.
//
// Only the POST routes are limited. Rendering the GET forms is harmless and
// throttling it would just break normal browsing.
//
// Note the store is the default in-memory one, so counters reset on deploy or
// restart. That is accepted: an attacker cannot trigger a restart.
//
// ✅ FIXED 2026-09-08 — the key used to be a Render-internal address.
//
// `trust proxy` was 1 while the real X-Forwarded-For chain has three entries, so
// req.ip resolved to Render's internal router (10.x) rather than the caller.
// Those rotate across a pool — three were observed — so this middleware keyed
// every visitor by which routing pod served them:
//
//   before   req.ip = 10.194.193.7 | 10.197.58.164 | 10.199.46.133   (3 buckets,
//            shared by ALL visitors — one person could lock out strangers)
//   after    req.ip = the client address                             (1 bucket
//            per client, which is what this middleware always assumed)
//
// The tell was in the RateLimit-* headers: `remaining` came back as 4,4,4 for
// three consecutive requests from one client, meaning three counters were being
// created rather than one decrementing. Fixed by `trust proxy: 3` in app.js —
// see the comment there, and SECURITY-FINDINGS.md for the full write-up
// including the two wrong diagnoses that preceded it.
//
// Re-verify after any Render or Cloudflare platform change: a hop count that
// stops matching breaks this silently, and neither of express-rate-limit's proxy
// validations fires on a value that is merely too low.
//
// Still true and still worth knowing: a client-supplied X-Forwarded-For cannot
// move the key, because counting from the right lands on the address Cloudflare
// inserts. That was true before this fix too — it is necessary but not
// sufficient, and reading it as proof the key was correct is exactly what
// delayed finding this bug.

// The app is server-rendered, so a bare 429 text body would be the only page on
// the site that breaks its own conventions. Re-render the form with the message
// in the `error` local that views/partials/header.ejs already displays.
//
// Deliberately a render and not a redirect: `res.redirect()` overwrites
// statusCode with 302, which would throw away the 429 that logs, monitoring and
// any API client rely on to see throttling. A 429 carrying a Location header is
// no good either, since browsers only follow 3xx. Rendering keeps both the
// correct status and a page the user can read.
const renderWithMessage = (view, message) => (req, res, next, options) =>
	res.status(options.statusCode).render(view, {error: [message]})

const common = {
	standardHeaders: true, // RateLimit-* headers
	legacyHeaders: false, // not the deprecated X-RateLimit-*
	// Rate limit IPv6 clients by /56 block rather than by exact address, since a
	// single client is routinely handed many addresses out of its prefix.
	ipv6Subnet: 56,
}

// Every POST /login counts, successes included. Passport uses failureRedirect,
// so a failed login returns 302 exactly like a successful one — status code
// cannot separate them, and keying off the Location header would couple this
// middleware to the route's redirect targets.
//
// 10 per 15 minutes, and now that the key is correct this is a genuine
// per-client budget for the first time. Briefly halved to 5 on 2026-09-08 on the
// mistaken theory that multiple instances were doubling it; reverted once the
// real cause turned out to be the key.
//
// Worth remembering this counts login *actions*, not failures — behind a NAT'd
// IP it is shared by everyone on it, which is the direction from which false
// positives will come.
const loginLimiter = rateLimit({
	...common,
	windowMs: 15 * 60 * 1000,
	limit: 10,
	handler: renderWithMessage(
		'login',
		'Too many login attempts. Please wait 15 minutes and try again.',
	),
})

// Registration is stricter and over a longer window: creating accounts is rare
// for a legitimate user and attractive for abuse. Back to 5 per hour, reverted
// alongside the login limit above.
const registerLimiter = rateLimit({
	...common,
	windowMs: 60 * 60 * 1000,
	limit: 5,
	handler: renderWithMessage(
		'register',
		'Too many accounts created from this address. Please try again later.',
	),
})

module.exports = {loginLimiter, registerLimiter}
