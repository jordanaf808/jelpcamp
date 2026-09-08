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
// What is NOT accepted, and was wrong here until 2026-09-08: this file used to
// claim the service "runs as a single Render instance". Production testing
// disproved it. Requests round-robin between at least TWO instances, each with
// its own in-memory counter — visible in the RateLimit-* headers, where the
// `reset` value alternates between two independent window start times:
//
//   instance A   reset=871  ─┐  alternating on consecutive requests,
//   instance B   reset=213  ─┘  with the client IP held constant
//
// A per-process store therefore multiplies the effective limit by the instance
// count. The limits below are halved to compensate, which is a correction for
// an instance count of 2 and nothing more principled than that. **If the
// instance count changes, these numbers are wrong again** — the durable fix is
// a shared store (`rate-limit-redis`; `rate-limit-mongo` is abandoned), which
// is deferred only because it costs a Redis instance for a modest gain.
//
// Verified 2026-09-08 in production: 429 fires and renders the login view, and
// `trust proxy: 1` is correct — a spoofed X-Forwarded-For does not open a fresh
// bucket, so the key is the real client IP and not attacker-controlled.

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
// 5 per 15 minutes, halved from 10 because two instances each keep their own
// counter (see above), so the effective budget is ~10. Worth remembering that
// this counts login *actions*, not failures — behind a NAT'd IP it is shared by
// everyone on it, which is the direction from which false positives will come.
const loginLimiter = rateLimit({
	...common,
	windowMs: 15 * 60 * 1000,
	limit: 5,
	handler: renderWithMessage(
		'login',
		'Too many login attempts. Please wait 15 minutes and try again.',
	),
})

// Registration is stricter and over a longer window: creating accounts is rare
// for a legitimate user and attractive for abuse. 3 per hour, halved from 5 for
// the same two-instance reason, giving an effective ~6.
const registerLimiter = rateLimit({
	...common,
	windowMs: 60 * 60 * 1000,
	limit: 3,
	handler: renderWithMessage(
		'register',
		'Too many accounts created from this address. Please try again later.',
	),
})

module.exports = {loginLimiter, registerLimiter}
