
const Campground = require("../models/campground");
const Comment = require("../models/comment");
// const middlewareObj = {};

// middlewareObj.checkCampgroundOwnership = function(req,res,next){
module.exports = {
	isLoggedIn: function (req, res, next){
		if(req.isAuthenticated()){
			return next();
		}
		req.flash("error", "Please Log in First :)")
		res.redirect("/login");
	},
	checkCampgroundOwnership: function(req,res,next){
		if(req.isAuthenticated()){
			Campground.findById(req.params.id, (err,foundCampground)=>{
				if(err || !foundCampground){
					req.flash("error", "Campground Not Found...");
					res.redirect("back");
				} else {
					//does user own campground?
					// '.equals()' is a Java function that compares the value inside
					// two different objects. they will show up as the same in the 
					// console, but '===' will not work.
					if(foundCampground.author.id.equals(req.user._id) || req.user.isAdmin) {
					//continue route 	
						next();
					} else {
					//if not, redirect
						req.flash("error", "Permission Invalid.");
						res.redirect("back");
					}
				}
			});
		} else {
			req.flash("error", "You Need To Be Logged In To Do That.");
			res.redirect("back");
		}
	},
	checkCommentOwnership: function(req,res,next){
		if(req.isAuthenticated()){
			Comment.findById(req.params.comment_id, (err, foundComment) => {
				if(err || !foundComment){
					req.flash("error", "Comment Not Found...")
					res.redirect("back");
				} else {
					//does user own the comment?
					// '.equals()' is a Java function that compares the value inside
					// two different objects. they will show up as the same in the 
					// console, but '===' will not work. because its a mongoose id.
					if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin) {
					//continue route 	
						next();
					} else {
					//if not, redirect
						req.flash("error", "Invalid Permission.");		
						res.redirect("back");
					}
				}
			});
		} else{
			req.flash("error", "You Need To Be Logged In To Do That.");		
			res.redirect("back");
		}
	},
  isAdmin: function(req, res, next) {
		if(req.isAuthenticated() && req.user.isAdmin){
			next();
		} else {
			req.flash("error", "You Need To Be Logged In To Do That.");		
			res.redirect("back");
		}
  }
}	
// module.exports = middlewareObj