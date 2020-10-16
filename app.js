require('dotenv').config();

const express    	 		=  require("express"),
	  	app        	 		= express(),
	  	axios      	 		= require("axios").default,
	  	bodyParser 	 		= require("body-parser"),
	  	mongoose   	 		= require("mongoose"),
	  	passport	 	 		= require("passport"),
	  	LocalStrategy  	= require("passport-local"),
	  	methodOverride 	= require("method-override"),
	  	flash			 			= require("connect-flash"),
	  	numeral		 			= require("numeral"),
	  	Campground 	 		= require("./models/campground"),
	  	Comment	 	 			= require("./models/comment"),
	  	User		 	 			= require("./models/user"),
	  	seedDB	 	 			= require("./seeds"),
	  	port       	 		= process.env.PORT || 3000;

//Require Routes.
const commentsRoutes 		= require("./routes/comments"),
	  	campgroundRoutes 	= require("./routes/campgrounds"),
	 	 	indexRoutes 			= require("./routes/index");

const connectDB = async () =>{
	try {
	const conn = await mongoose.connect(process.env.MONGO_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useFindAndModify: false,
		// useCreateIndex: true
	})
	console.log(`MongoDB Connected: ${conn.connection.host}`)
	} catch(error){
		console.log(error.message)
	};
}

connectDB()

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(__dirname + '/public'));
console.log(__dirname);
app.set("view engine", "ejs");
app.use(methodOverride("_method"));
app.use(flash());

// seed the DB
seedDB(); 

//PASSPORT configuration
app.use(require("express-session")({
	secret: "123456",
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
app.use((req, res, next)=>{
	res.locals.currentUser 	= req.user;
	res.locals.error 				= req.flash("error");
	res.locals.success 			= req.flash("success");
	next();
});

app.use(indexRoutes);
app.use("/campgrounds/:id/comments", commentsRoutes);
app.use("/campgrounds", campgroundRoutes);

app.listen(process.env.PORT || 3000) 
console.log(`YelpCamp listening at ${port}`)