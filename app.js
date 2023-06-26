require('dotenv').config();

const express    	 		=  require("express");
const app        	 		= express();
const axios      	 		= require("axios").default;
// const bodyParser 	 		= require("body-parser");
const mongoose   	 		= require("mongoose");
const passport	 	 		= require("passport");
const LocalStrategy  	= require("passport-local");
const methodOverride 	= require("method-override");
const flash			 			= require("connect-flash");
const numeral		 			= require("numeral");
// const Campground 	 		= require("./models/campground");
const Campsite 	 			= require("./models/campsite");
const Comment	 	 			= require("./models/comment");
const User		 	 			= require("./models/user");
const seedDB	 	 			= require("./seeds");
const port       	 		= process.env.PORT || 3000;

//Require Routes.
const commentsRoutes 		= require("./routes/comments");
// const campgroundRoutes 	= require("./routes/campgrounds");
const indexRoutes 			= require("./routes/index");
const campsitesRoutes		= require("./routes/campsites");
const ExpressError = require('./utils/ExpressError');
				

const monitorDB = async () => {
	try {
		const db = mongoose.connection;
		db.on('error', err => {
			logError(err);
			console.error.bind(console, "db: connection error;")
		});
		db.once("open", () => {
			console.log("database connected")
		});
	} catch(error){
		console.log('catch: connection monitor error: ', error.message)
		next(error)
	};
}

const connectDB = async () => {
	try {
		const conn = mongoose.connect(process.env.MONGO_URI, {
			// useNewUrlParser: true,
			// useUnifiedTopology: true,
			// useFindAndModify: false,
			// useCreateIndex: true
		})
		console.log(`MongoDB Connecting;`)
	} catch(error){
		console.log(error.message)
	};
}

connectDB();
monitorDB();

// app.use(bodyParser.urlencoded({extended: true}));
app.use(express.urlencoded({extended: true}));
app.use(express.static(__dirname + '/public'));
console.log(__dirname);
app.set("view engine", "ejs");
app.use(methodOverride("_method"));
app.use(flash());

// seed the DB
// seedDB(); 

//PASSPORT configuration
app.use(require("express-session")({
	secret: process.env.SECRET,
	resave: false,
	saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
	res.locals.currentUser 	= req.user;
	res.locals.error 				= req.flash("error");
	res.locals.success 			= req.flash("success");
	next();
});

app.use(indexRoutes);
// app.use("/campgrounds/:id/comments", commentsRoutes);
app.use("/campsites/:id/comments", commentsRoutes);
// app.use("/campgrounds", campgroundRoutes);
app.use("/campsites", campsitesRoutes);

// Adds the 'currentUser' info to the 'req'uest in the '.user' object.
// every 'app.'... request will append this, like a middleware.
// 6/23/23 added 'err'

app.all('*', (req, res, next) => {
	next(new ExpressError('Page Not Found', 404))
});

app.use((err, req, res, next) => {
	console.log('error route');
	const {statusCode = 500} = err;
	if(!err.message) err.message = "Error."
	res.status(statusCode).send(err.message);
	// next(err);
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