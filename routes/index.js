const express 		= require("express"),
	  	passport 		= require("passport"),
		 	User 				= require("../models/user"),
			Campground 	= require("../models/campground"),
			Campsite 		= require("../models/campsite"),
			mapboxgl 		= require('mapbox-gl/dist/mapbox-gl.js');
const router 			= express.Router();
const middleware = require("../middleware");
 

router.get("/", (req, res) => {
	// 	get all campgrounds from DB
	Campground.find({}, (err, allCampgrounds) => {
	  if (err) return console.error(err);
	  else {
		  res.render("landing", {campgrounds:allCampgrounds});
		};
	});
});

// ========================
// AUTH ROUTES
// ========================
// Show Register Form:

router.get("/register", (req,res)=>{
	res.render("register");
})
// Handle register logic...
router.post("/register", (req,res)=>{
	const newUser = new User({username: req.body.username});
	User.register(newUser, req.body.password, (err,user)=>{
		if(err){
			console.log(err);
      		return res.render("register", {"error": err.message});
		} 
		passport.authenticate("local")(req, res, ()=>{
			req.flash("success", "Welcome To YelpCamp " + user.username);		
			res.redirect("/campsites");
		});
	});
});

// User Profile
router.get("/user/:id", middleware.isLoggedIn, function(req, res){
	User.findById(req.params.id, function(err, foundUser){
		if(err){
			req.flash("error", "user not found")
			return res.redirect('/')
		} 
		console.log(foundUser)
		res.render('users/show', {user: foundUser});
	});
});

// Add Favorite
router.post("/user/:id/:campsite", middleware.isLoggedIn, (req,res)=>{
	//lookup campground using id
	// const { id } = req.params;
	console.log(req.params)
	User.findById(req.params._id, function(err, foundUser){
		if(err){
			req.flash("error", "user not found")
			return res.redirect('/')
		}  else {
					foundUser.favorites.push(req.params._campsite);
					foundUser.save();
					console.log(foundUser);
					res.redirect('/campsites/show/' + req.params._campsite);
				}
	});
});


// show LOGIN form
router.get("/login", (req,res)=>{
	res.render("login");
});
// handle LOGIN logic
router.post("/login", passport.authenticate("local", 
	{
		successRedirect: "/campsites",
		failureRedirect: "/login"
	}), (req,res)=>{
});

// Logout ROUTE
router.get("/logout", (req,res)=>{
	console.log("user is logged out");
	req.logout();
	req.flash("success", "Logged Out.")
	res.redirect("/");
});

//middleware
function isLoggedIn(req, res, next){
	if(req.isAuthenticated()){
		return next();
	}
	res.redirect("/login");
}

module.exports = router;
