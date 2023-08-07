
const Campground = require("../models/campground");
const Comment = require("../models/comment");
const mongoose = require ("mongoose");
const BaseJoi = require('joi');
const sanitizeHtml = require('sanitize-html');

// Sanitize HTML extension for JOI.
const extension = (Joi) => ({
	type: 'string',
	base: Joi.string(),
	messages: {
  	'string.escapeHTML': '{{#label}} must not include HTML.'
	},
	rules: {
  	escapeHTML: {
			validate(value, helpers) {
				const clean = sanitizeHtml(value, {
					allowedTags: [],
					allowedAttributes: {}
				});
				if (clean !== value) return helpers.error('string.escapeHTML', { value });
				return clean;
			}
		}
	}
});
const Joi = BaseJoi.extend(extension);
const commentSchema = Joi.object({
	text: Joi.string().required().min(10).max(300).escapeHTML(),
}).required();
const userSchema = Joi.object({
	username: Joi.string().required().max(20).escapeHTML(),
	password: Joi.string().required().min(3).max(20).escapeHTML(),
}).required();

module.exports = {
	isLoggedIn: function (req, res, next){
		if(req.isAuthenticated()){
			return next();
		}
		req.session.returnTo = req.originalUrl;
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
			if (!mongoose.Types.ObjectId.isValid(comment_id)) throw new Error('invalid object id') 
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
	validateComment: (req, res, next) => {
		const { error } = commentSchema.validate(req.body.comment);
		if(!error){
			next();
		} else {
			const msgs = error.details.map(el => el.message);
			console.log(`error validateComment: `, msgs);
			req.flash('error', 'Invalid Comment.');
			return res.redirect("back");
		}
	},
	validateUser: (req, res, next) => {
		const { error } = userSchema.validate(req.body);
		if(!error){
			next();
		} else {
			const msgs = error.details.map(el => el.message);
			console.log(`error validateUser: `, msgs);
			req.flash('error', msgs);
			return res.redirect("back");
		}
	},
  isAdmin: function(req, res, next) {
		if(req.isAuthenticated() && req.user.isAdmin){
			next();
		} else {
			req.flash("error", "You Need To Be Logged In To Do That.");		
			res.redirect("back");
		}
  },
	storeReturnTo: (req, res, next) => {
    if (req.session.returnTo) {
        res.locals.returnTo = req.session.returnTo;
    }
    next();
	}
}	
// module.exports = middlewareObj