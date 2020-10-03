
const express = require("express"),
	  passport = require("passport"),
 	  User = require("../models/user");
const router = express.Router();
 

router.get("/", (req, res) => {
		res.render("landing");
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
			res.redirect("/campgrounds");
		});
	});
});

// show LOGIN form
router.get("/login", (req,res)=>{
	res.render("login");
});
// handle LOGIN logic
router.post("/login", passport.authenticate("local", 
	{
		successRedirect: "/campgrounds",
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
