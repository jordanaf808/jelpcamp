
const Campground = require("../models/campground");
const Comment = require("../models/comment");
const mongoose = require ("mongoose");
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
	checkCampgroundOwnership: async (req,res,next) => {
		if(req.isAuthenticated()){
			const foundCampground = await Campground.findById(req.params.id);
			if(!foundCampground){
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
		} else {
			req.flash("error", "You Need To Be Logged In To Do That.");
			res.redirect("back");
		}
	},
	checkCommentOwnership: async (req,res,next) => {
		if(req.isAuthenticated()){
			const { comment_id } = req.params
			if (!mongoose.Types.ObjectId.isValid(comment_id)) throw new Error('invalid id') 
			const foundComment = await Comment.findById(comment_id) 
			if(!foundComment){
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
		} else {
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