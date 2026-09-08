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
// 🔴 OPEN BUG (2026-09-08) — THE KEY IS NOT THE CLIENT IP.
//
// Production testing produced THREE independent counters for a single client,
// on a service that runs exactly one instance (Render Hobby does not scale).
// Warm service, no recent deploy, client egress IP verified stable across 8
// samples. Eight spaced requests:
//
//   req   1  2  3  4  5  6  7  8
//   rem   4  4  4  3  3  2  3  2
//         A  B  C  A  B  A  C  B    three interleaved buckets
//
// Each bucket counts down correctly. There are simply several of them, so
// `req.ip` is resolving to something that varies per request rather than to the
// caller.
//
// Most likely cause, NOT yet confirmed: this app sits behind two proxy layers —
// Cloudflare (Render's CDN) and Render's own router. `trust proxy` is 1, so
// Express trusts one hop and reads the second-from-right X-Forwarded-For entry,
// which lands on the Cloudflare edge node rather than the client. Cloudflare
// spreads traffic across edges, so the key moves.
//
// Two consequences, and the second is the one that matters:
//   1. an attacker gets `limit x edge_count` attempts — the limiter is weakened
//   2. users sharing a Cloudflare edge SHARE A BUCKET, so one person's failed
//      logins can lock out strangers. A brute-force defence that DoSes your own
//      users is worse than the exposure it was added to close.
//
// Confirm with GET /__whoami (below, env-gated) then fix the key — either
// `trust proxy: 2`, or a keyGenerator reading CF-Connecting-IP, which
// Cloudflare sets to the true client address. Do not tune these numbers until
// the key is correct; tightening a shared bucket makes consequence 2 worse.
//
// Also verified 2026-09-08 and still true: the 429 fires and renders the login
// view, and the key is not settable by a client-supplied X-Forwarded-For — a
// spoofed header does not open a fresh bucket. Note that is NOT evidence the
// key is correct: an edge-node key is equally unspoofable and equally wrong.
// Reading it as confirmation was the mistake that produced the bad diagnosis
// this comment replaces.

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
// 10 per 15 minutes. Briefly halved to 5 on 2026-09-08 on the mistaken theory
// that multiple instances were doubling the budget; reverted once the real
// cause turned out to be the key (see above). Halving a bucket that is SHARED
// between unrelated users makes collateral lockouts twice as easy, so it was
// not merely useless but harmful.
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
