const express = require('express')
const passport = require('passport')
const {errors: plmErrors} = require('passport-local-mongoose')
const User = require('../models/user')
// const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const router = express.Router()
const {storeReturnTo, validateUser} = require('../middleware')
const {loginLimiter, registerLimiter} = require('../middleware/rateLimiters')

// The campsites list is the landing page.
//
// safeBack() falls back to /, so messages often arrive here. app.js has
// already read them out of the session for this request, so they are queued
// again for /campsites, or this hop would drop them.
router.get('/', (req, res) => {
	for (const type of ['error', 'success']) {
		for (const message of res.locals[type]) req.flash(type, message)
	}
	res.redirect('/campsites')
})

// ========================
// AUTH ROUTES
// ========================
// Show Register Form:

router.get('/register', (req, res) => {
	res.render('register')
})

// Handle register logic...
router.post(
	'/register',
	registerLimiter,
	validateUser,
	async (req, res, next) => {
		const newUser = new User({username: req.body.username})
		// if(req.body.adminCode === process.env.ADMIN_CODE) {
		//   newUser.isAdmin = true;
		// }
		let registeredUser
		try {
			registeredUser = await User.register(newUser, req.body.password)
		} catch (err) {
			if (
				err instanceof plmErrors.UserExistsError ||
				err instanceof plmErrors.MissingUsernameError
			) {
				return res.render('register', {error: err.message})
			}
			return next(err)
		}
		req.login(registeredUser, (err) => {
			if (err) {
				return next(err)
			}
			req.flash('success', 'Welcome To YelpCamp ' + registeredUser.username)
			res.redirect('/campsites')
		})
	},
)

// show LOGIN form
router.get('/login', (req, res) => {
	res.render('login')
})
// handle LOGIN logic
router.post(
	'/login',
	loginLimiter,
	storeReturnTo,
	passport.authenticate('local', {
		// successRedirect: '/campsites',
		failureFlash: 'Wrong Username and/or Password...',
		failureRedirect: '/login',
	}),
	(req, res) => {
		req.flash('success', 'Welcome To YelpCamp ' + req.user.username)
		const redirectUrl = res.locals.returnTo || '/campsites' // update this line to use res.locals.returnTo now
		delete req.session.returnTo
		res.redirect(redirectUrl)
	},
)

// Logout ROUTE
router.get('/logout', (req, res, next) => {
	console.log('logging out')
	req.logout((err) => {
		if (err) {
			return next(err)
		}
		req.flash('success', 'Logged Out.')
		res.redirect('/campsites')
	})
})

module.exports = router
