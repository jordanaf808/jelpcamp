require('dotenv').config();
const port       	 		= process.env.PORT || 3000;
const express    	 		= require("express");
const app        	 		= express();
const mongoose   	 		= require("mongoose");
const passport	 	 		= require("passport");
const LocalStrategy  	= require("passport-local");
const methodOverride 	= require("method-override");
const flash			 			= require("connect-flash");
const session 				= require("express-session");
const MongoStore 			= require('connect-mongo');
const mongoSanitize 	= require('express-mongo-sanitize');
// const helmet				 	= require('helmet');

// Models
const User		 	 			= require("./models/user");
// const seedDB	 	 			= require("./seeds");

// Routes.
const indexRoutes 		= require("./routes/index");
const userRoutes 			= require("./routes/users");
const campsitesRoutes	= require("./routes/campsites");
const commentsRoutes 	= require("./routes/comments");

// Utils
const ExpressError 		= require('./utils/ExpressError');
const connectDB 			= require('./utils/connectDB');

connectDB();

app.use(express.urlencoded({extended: true}));
app.use(express.static(__dirname + '/public'));
app.set("view engine", "ejs");
app.use(methodOverride("_method"));
app.use(flash());
app.use(mongoSanitize());

// const scriptSrcUrls = [
// 	"https://stackpath.bootstrapcdn.com/",
// 	"https://api.tiles.mapbox.com/",
// 	"https://api.mapbox.com/",
// 	"https://kit.fontawesome.com/",
// 	"https://cdnjs.cloudflare.com/",
// 	"https://cdn.jsdelivr.net",
// 	"https://fonts.gstatic.com",
// 	"https://code.jquery.com/",
// 	"https://maps.googleapis.com/",
// 	"//embedr.flickr.com/"
// ];
// const styleSrcUrls = [
// 	"https://kit-free.fontawesome.com/",
// 	"https://stackpath.bootstrapcdn.com/",
// 	"https://api.mapbox.com/",
// 	"https://api.tiles.mapbox.com/",
// 	"https://fonts.googleapis.com/",
// 	"https://fonts.gstatic.com",
// 	"https://use.fontawesome.com/",
// ];
// const connectSrcUrls = [
// 	"https://api.mapbox.com/",
// 	"https://a.tiles.mapbox.com/",
// 	"https://b.tiles.mapbox.com/",
// 	"https://events.mapbox.com/",
// 	"https://ridb.recreation.gov/api/v1/",
// 	"https://maps.googleapis.com/",
// 	"embedr.flickr.com/"
// ];
// const fontSrcUrls = [];
// app.use(
// 	helmet.contentSecurityPolicy({
// 			directives: {
// 					defaultSrc: [],
// 					connectSrc: ["'self'", ...connectSrcUrls],
// 					scriptSrc: ["'unsafe-inline'", "'self'", ...scriptSrcUrls],
// 					styleSrc: ["'self'", "'unsafe-inline'", ...styleSrcUrls],
// 					workerSrc: ["'self'", "blob:"],
// 					objectSrc: [],
// 					imgSrc: [
// 							"'self'",
// 							"blob:",
// 							"data:",
// 							"https://res.cloudinary.com/douqbebwk/", //SHOULD MATCH YOUR CLOUDINARY ACCOUNT! 
// 							"https://images.unsplash.com/",
// 							"https://maps.googleapis.com/maps/api/js?key=AIzaSyBJss5OZ9rprm3qA-4F1XiH0OYvrLBKPE8&callback=initMap",
// 							"embedr.flickr.com/"
// 					],
// 					fontSrc: ["'self'", ...fontSrcUrls],
// 			},
// 	})
// );

// seed the DB
// seedDB(); 

// Store the session data on MongoDB instead of in Local Memory.
const sessionStore = new MongoStore({
	mongoUrl: process.env.MONGO_URI,
	touchAfter: 24 * 60 * 60,
	crypto: {
		secret: process.env.SECRET
	}
})

// Session Config
// currently using default memory store, also templates for Redis, Mongo, etc...
const sessionConfig = {
	store: sessionStore,
	secret: process.env.SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		expires: Date.now() + 1000*60*60*24*7,
		maxAge: 1000*60*60*24*7
	}
}

//PASSPORT configuration
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware to pass user and flash info in any response from our server.
app.use((req, res, next) => {
	// console.log(req);
	res.locals.currentUser 	= req.user;
	res.locals.error 				= req.flash("error");
	res.locals.success 			= req.flash("success");
	next();
});

app.use(indexRoutes);
app.use("/user", userRoutes);
app.use("/campsites/:id/comments", commentsRoutes);
app.use("/campsites", campsitesRoutes);

// Adds the 'currentUser' info to the 'req'uest in the '.user' object.
// every 'app.'... request will append this, like a middleware.
// 6/23/23 added 'err'

app.all('*', (req, res, next) => {
	next(new ExpressError('Page Not Found', 404))
});

app.use((err, req, res, next) => {
	const {statusCode = 500} = err;
	if(!err.message) err.message = "Error."
	console.log('error route', err.message);
	res.status(statusCode).send(err.message);
});

const server = app.listen(process.env.PORT || 3000);

// Kill App On SIGTERM
process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  console.log('Closing http server.');
  server.close(() => {
    console.log('Http server closed.');
    // boolean means [force], 
    mongoose.connection.close(false, () => {
      console.log('MongoDb connection closed.'); 
			// NodeJS will exit when the EventLoop queue is empty and there is nothing left to do.
			// But sometimes, your application can have more functions and will not exit automatically.
			// We need to exit from the process using process.exit function.
			// 0 means exit with a "success" code.
      process.exit(0);
    });
  });
}); 

console.log(`YelpCamp listening at ${port}`)