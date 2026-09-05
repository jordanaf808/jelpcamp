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
// Note the store is the default in-memory one. Counters therefore reset on
// deploy or restart, and are per-instance if the service is ever scaled beyond
// one. Both are acceptable here: an attacker cannot trigger a restart, and this
// runs as a single Render instance. Moving to a shared store is the fix if that
// changes.

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
// middleware to the route's redirect targets. 10 per 15 minutes is generous
// enough that a real person re-typing a password never reaches it.
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
// for a legitimate user and attractive for abuse.
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
