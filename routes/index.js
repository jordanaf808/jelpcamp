const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const User = require('../models/user');
const Campground = require('../models/campground');
const Campsite = require('../models/campsite');
// const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const router = express.Router();
const { storeReturnTo, validateUser } = require('../middleware');

// import utils
const catchAsync = require('../utils/catchAsync');
const ExpressError = require('../utils/ExpressError');

// We can wrap catchAsync around our router async callbacks 
// to catch any errors and send them to our 'next' route handler
router.get('/', catchAsync(async (req, res) => {
  // 	get all campgrounds from DB for background photos.
  // try { <-- already in a try/catch with the catchAsync()
  const allCampgrounds = await Campground.find();
  // console.dir(allCampgrounds);
  res.render('landing', { campgrounds: allCampgrounds });
}));

// ========================
// AUTH ROUTES
// ========================
// Show Register Form:

router.get('/register', (req, res) => {
  res.render('register');
});

// Handle register logic...
router.post('/register', 
  validateUser,
  catchAsync(async (req, res, next) => {
    const newUser = new User({ username: req.body.username });
    // if(req.body.adminCode === process.env.ADMIN_CODE) {
    //   newUser.isAdmin = true;
    // }
    User.register(newUser, req.body.password, (err, user) => {
      if (err) {
        console.log(err);
        return res.render('register', { error: err.message });
      }
      passport.authenticate('local')(req, res, () => {
        req.flash('success', 'Welcome To YelpCamp ' + user.username);
        res.redirect('/campsites');
      });
    });  
  })
);

// show LOGIN form
router.get('/login', (req, res) => {
  res.render('login');
});
// handle LOGIN logic
router.post('/login',
  storeReturnTo,
  passport.authenticate('local', {
    // successRedirect: '/campsites',
    failureFlash: "Wrong Username and/or Password...",
    failureRedirect: '/login',
  }),
  (req, res) => {
    req.flash("success", "Welcome To YelpCamp " + req.user.username);
    const redirectUrl = res.locals.returnTo || '/campsites'; // update this line to use res.locals.returnTo now
    delete req.session.returnTo;
    res.redirect(redirectUrl);
  }
);

// Logout ROUTE
router.get('/logout', (req, res, next) => {
  console.log('logging out');
  req.logout((err) => {
    if (err) { return next(err); }
    req.flash('success', 'Logged Out.');
    res.redirect('/campsites');
  });
});

module.exports = router;
