require('dotenv').config();

const express    	 		=  require("express");
const app        	 		= express();
const axios      	 		= require("axios").default;
const bodyParser 	 		= require("body-parser");
const mongoose   	 		= require("mongoose");
const passport	 	 		= require("passport");
const LocalStrategy  	= require("passport-local");
const methodOverride 	= require("method-override");
const flash			 			= require("connect-flash");
const numeral		 			= require("numeral");
const Campground 	 		= require("./models/campground");
const Campsite 	 			= require("./models/campsite");
const Comment	 	 			= require("./models/comment");
const User		 	 			= require("./models/user");
const seedDB	 	 			= require("./seeds");
const port       	 		= process.env.PORT || 3000;

//Require Routes.
const commentsRoutes 		= require("./routes/comments");
const campgroundRoutes 	= require("./routes/campgrounds");
const indexRoutes 			= require("./routes/index");
const campsitesRoutes		= require("./routes/campsites");
				

const monitorDB = async () => {
	try {
		const conn = mongoose.connection.on('error', err => {
			logError(err)
		})
		console.log(`MongoDB monitoring: ${conn}`)
	} catch(error){
		console.log('start connection monitor error', error.message)
	};
}

const connectDB = async () => {
	try {
		const conn = await mongoose.connect(process.env.MONGO_URI, {
			// useNewUrlParser: true,
			// useUnifiedTopology: true,
			// useFindAndModify: false,
			// useCreateIndex: true
		})
		console.log(`MongoDB Connected: ${conn.connection.host}`)
	} catch(error){
		console.log(error.message)
	};
}

connectDB();
monitorDB();

app.use(bodyParser.urlencoded({extended: true}));
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

// Adds the 'currentUser' info to the 'req'uest in the '.user' object.
// every 'app.'... request will append this, like a middleware.
app.use((req, res, next) => {
	res.locals.currentUser 	= req.user;
	res.locals.error 				= req.flash("error");
	res.locals.success 			= req.flash("success");
	next();
});

app.use(indexRoutes);
app.use("/campgrounds/:id/comments", commentsRoutes);
app.use("/campsites/:id/comments", commentsRoutes);
app.use("/campgrounds", campgroundRoutes);
app.use("/campsites", campsitesRoutes);

app.listen(process.env.PORT || 3000) 
console.log(`YelpCamp listening at ${port}`)