require('dotenv').config()
const port = process.env.PORT || 3000
const express = require('express')
const app = express()
const mongoose = require('mongoose')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const methodOverride = require('method-override')
const flash = require('connect-flash')
const session = require('express-session')
const MongoStore = require('connect-mongo')
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
const connectDB = require('./utils/connectDB')

connectDB()

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
// SESSION_STORE_SECRET encrypts the session payload at rest. It is a different
// key from SESSION_SECRET below because it does a different job, and because
// kruptein (via connect-mongo) enforces character-class rules on this one only:
// >=8 chars with >=2 each of uppercase, lowercase, digits and specials. A secret
// that fails them makes every session write throw, which reads as a confusing
// post-response error rather than a startup failure.
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
		expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
		maxAge: 1000 * 60 * 60 * 24 * 7,
	},
}

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

const server = app.listen(process.env.PORT || 3000)

// // Kill App On SIGTERM
// process.on('SIGTERM', () => {
//   console.info('SIGTERM signal received.');
//   console.log('Closing http server.');
//   server.close(() => {
//     console.log('Http server closed.');
//     // boolean means [force],
//     mongoose.connection.close(false, () => {
//       console.log('MongoDb connection closed.');
// 			// NodeJS will exit when the EventLoop queue is empty and there is nothing left to do.
// 			// But sometimes, your application can have more functions and will not exit automatically.
// 			// We need to exit from the process using process.exit function.
// 			// 0 means exit with a "success" code.
//       process.exit(0);
//     });
//   });
// });

console.log(`YelpCamp listening at ${port}`)
