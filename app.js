// This module BUILDS and EXPORTS the Express app. It deliberately does not
// listen, and does not connect to the database — server.js does both. Keeping
// those side effects out means a test can `require('./app')` without starting a
// server or binding a port, which was impossible before 2026-09-08.
//
// Note that `sessionStore` below is constructed at module load from
// process.env.MONGO_URI, so any caller (a test, in particular) must set its
// environment BEFORE requiring this file. dotenv does not overwrite variables
// that are already set, so an explicit value always wins.
//
// Also note dotenv resolves `.env` relative to the CURRENT WORKING DIRECTORY,
// not to this file. Requiring this module from elsewhere without setting the
// environment first fails at the MongoStore constructor, not at the require.
require('dotenv').config()
const express = require('express')
const app = express()
const passport = require('passport')
const LocalStrategy = require('passport-local')
const methodOverride = require('method-override')
const flash = require('connect-flash')
const session = require('express-session')
// connect-mongo 6 ships dual ESM/CJS and no longer default-exports the class to
// CJS callers: require() returns a namespace object, so this must be destructured.
const {MongoStore} = require('connect-mongo')
const mongoSanitize = require('express-mongo-sanitize')
const helmet = require('helmet')

// Models
const User = require('./models/user')
// const seedDB	 	 			= require("./seeds");

// Routes.
const indexRoutes = require('./routes/index')
const userRoutes = require('./routes/users')
const campsitesRoutes = require('./routes/campsites')
const commentsRoutes = require('./routes/comments')

// Utils
const ExpressError = require('./utils/ExpressError')

app.use(express.urlencoded({extended: true}))
app.use(express.static(__dirname + '/public'))
app.set('view engine', 'ejs')
app.use(methodOverride('_method'))
app.use(flash())
app.use(mongoSanitize())

// Content Security Policy. Origins below were derived by scanning views/ and
// public/ for every externally-loaded resource — see SECURITY-FINDINGS.md.
// script-src has no 'unsafe-inline': all inline scripts were moved into
// public/js/ so injected inline script cannot execute.
const scriptSrcUrls = [
	'https://api.mapbox.com',
	'https://code.jquery.com',
	'https://cdn.jsdelivr.net',
	'https://stackpath.bootstrapcdn.com',
	'https://cdnjs.cloudflare.com',
	'https://maps.googleapis.com',
	'https://embedr.flickr.com',
	'https://widgets.flickr.com', // embedr chain-loads its client code from here
]
const styleSrcUrls = [
	'https://stackpath.bootstrapcdn.com',
	'https://cdnjs.cloudflare.com',
	'https://fonts.googleapis.com',
	'https://api.mapbox.com',
]
const connectSrcUrls = [
	'https://api.mapbox.com',
	'https://events.mapbox.com',
	'https://a.tiles.mapbox.com',
	'https://b.tiles.mapbox.com',
	// Google Maps runtime fetches. Per Google's CSP guidance, googleapis.com
	// MUST be present or the Maps JS API rejects requests outright.
	// https://developers.google.com/maps/documentation/javascript/content-security-policy
	'https://*.googleapis.com',
	'https://*.gstatic.com',
	'https://*.google.com',
	// DevTools fetches .js.map / .css.map from these over connect-src. Only
	// affects debugging, never end users; already trusted for script/style.
	'https://cdn.jsdelivr.net',
	'https://stackpath.bootstrapcdn.com',
	'https://code.jquery.com',
	'https://cdnjs.cloudflare.com',
]
const fontSrcUrls = ['https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com']

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", ...scriptSrcUrls],
				// 'unsafe-inline' is still required here: 10 views use inline
				// style="..." attributes, which cannot carry a nonce.
				styleSrc: ["'self'", "'unsafe-inline'", ...styleSrcUrls],
				connectSrc: ["'self'", ...connectSrcUrls],
				fontSrc: ["'self'", ...fontSrcUrls],
				// Campsite photos come from the RIDB API, whose hosts are not known
				// until runtime, so any https image is allowed. Images cannot execute.
				imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
				workerSrc: ["'self'", 'blob:'], // mapbox-gl uses blob workers
				objectSrc: ["'none'"],
			},
		},
	})
)

// seed the DB
// seedDB();

// Store the session data on MongoDB instead of in Local Memory.
// SESSION_STORE_SECRET encrypts the session payload at rest — a different job
// from signing the cookie, so a different key.
//
// History worth keeping: connect-mongo 5.1.0 declared `kruptein: ^3.0.0`, which
// floated to 3.4.0 and broke sessions twice over — a character-class gate that
// rejected a 128-hex-char secret, and a double JSON.parse that made every read
// throw. connect-mongo 6 pins kruptein 3.0.8, which has neither. Keep this
// secret mixed-case with digits and symbols anyway: it costs nothing and
// survives the pin being loosened again.
const sessionStore = new MongoStore({
	mongoUrl: process.env.MONGO_URI,
	touchAfter: 24 * 60 * 60,
	crypto: {
		secret: process.env.SESSION_STORE_SECRET,
	},
})

// Session Config
// currently using default memory store, also templates for Redis, Mongo, etc...
const sessionConfig = {
	store: sessionStore,
	// SESSION_SECRET HMAC-signs the session cookie. No complexity rules apply.
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		// There is deliberately no `expires`. It used to be
		// `Date.now() + <7 days>`, which JavaScript evaluates ONCE when this module
		// is loaded — so every session ever issued by a given process shared one
		// absolute expiry, and a session handed out eight days into an uptime
		// period was born already expired. `maxAge` is relative and is applied per
		// session, which is the behaviour that was intended all along.
		maxAge: 1000 * 60 * 60 * 24 * 7,
		// Never transmit the session cookie over plain HTTP in production.
		// Off in development so localhost, which has no TLS, still works.
		secure: process.env.NODE_ENV === 'production',
		// CSRF defence-in-depth: withheld from cross-site form posts, still sent on
		// ordinary top-level navigations back into the site.
		sameSite: 'lax',
	},
}

// Required by `secure` above. Render terminates TLS at its proxy and forwards
// plain HTTP internally, so Express sees an insecure connection and would refuse
// to set a secure cookie — silently breaking login in production while working
// perfectly on localhost. Trusting proxy hops makes req.secure read
// X-Forwarded-Proto instead.
//
// The value is 3, and it must match the REAL hop count. `trust proxy: n` does
// not mean "trust n proxies and find the client" — it means "walk n entries back
// from the right of X-Forwarded-For". Those coincide only when n equals the
// actual chain length. Measured in production 2026-09-08:
//
//   X-Forwarded-For: 216.163.65.232, 104.23.251.43, 10.194.193.7
//                    └─ the client   └─ Cloudflare   └─ Render's internal router
//                    ^^^^^^^^^^^^^^ 3rd from the right
//
// This was `1` until 2026-09-08, which resolved req.ip to the Render-internal
// 10.x address. Those rotate across a small pool — three were observed
// (10.194.193.7, 10.197.58.164, 10.199.46.133) — so express-rate-limit keyed
// every visitor by which routing pod served them. The whole site shared roughly
// three buckets, and one person's failed logins could lock out strangers.
// See SECURITY-FINDINGS.md for the full write-up.
//
// Why not `true`: it takes the LEFTMOST entry, which is client-supplied, so
// anyone can spoof it. Verified against the real chain — `true` returns an
// attacker's injected value, `3` returns the client. Counting from the right
// works because Cloudflare inserts the true client address at a fixed position;
// entries an attacker prepends shift left and are ignored.
//
// ⚠️ This number is tied to the deployment topology. If Render or Cloudflare
// change the hop count it breaks silently — neither express-rate-limit
// validation catches a value that is merely too low. Re-measure after any
// platform change.
app.set('trust proxy', 3)

//PASSPORT configuration
app.use(session(sessionConfig))
app.use(passport.initialize())
app.use(passport.session())
passport.use(new LocalStrategy(User.authenticate()))
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

// Middleware to pass user and flash info in any response from our server.
app.use((req, res, next) => {
	// console.log(req);
	res.locals.currentUser = req.user
	res.locals.error = req.flash('error')
	res.locals.success = req.flash('success')
	next()
})

app.use(indexRoutes)
app.use('/user', userRoutes)
app.use('/campsites/:id/comments', commentsRoutes)
app.use('/campsites', campsitesRoutes)

// Adds the 'currentUser' info to the 'req'uest in the '.user' object.
// every 'app.'... request will append this, like a middleware.
// 6/23/23 added 'err'

app.all('*', (req, res, next) => {
	next(new ExpressError('Page Not Found', 404))
})

app.use((err, req, res, next) => {
	const {statusCode = 500} = err
	if (!err.message) err.message = 'Error.'
	console.log('error route', err.message)
	// Some errors arrive after the response has already gone out. express-session
	// saves the session inside its res.end patch, so a session-store failure
	// reaches here via next(err) once the body is flushed. Writing again throws
	// ERR_HTTP_HEADERS_SENT, which buries the error that actually mattered.
	// Delegating to Express's default handler closes the connection instead.
	if (res.headersSent) return next(err)
	res.status(statusCode).send(err.message)
})

// The session store opens its own MongoClient at construction, which keeps the
// event loop alive — `node --test` hangs on it otherwise. Expose it so a test
// teardown can close it; nothing in the request path uses this.
//
// Teardown ordering matters: connect-mongo starts building its TTL index as soon
// as its client connects, with no request needed, and close() does not wait for
// it. Closing mid-build makes the in-flight createIndex reject with
// MongoExpiredSessionError. Await `sessionStore.collectionP` before closing —
// tests/setup.js stop() does. Production never hits this because production
// never closes the store.
app.set('sessionStore', sessionStore)

module.exports = app

// Running this file directly does nothing useful and — worse — does not fail.
// The session store holds the event loop open, so `node app.js` hangs forever
// without binding a port. On Render that surfaces as a port-scan timeout, which
// points nowhere near the cause. Fail loudly instead.
if (require.main === module) {
	console.error(
		'app.js builds the app but does not start a server.\n' +
			'Run `npm start` (which runs server.js) instead.'
	)
	process.exit(1)
}
