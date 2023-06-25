const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const User = require('../models/user');
const Campground = require('../models/campground');
const Campsite = require('../models/campsite');
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const router = express.Router();
const middleware = require('../middleware');

// import utils
const catchAsync = require('../utils/catchAsync');
const ExpressError = require('../utils/ExpressError');
// We can wrap catchAsync around our router async callbacks 
// to catch any errors and send them to our 'next' route handler

router.get('/', catchAsync(async (req, res) => {
  // 	get all campgrounds from DB
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
router.post('/register', catchAsync(async (req, res, next) => {
  const newUser = new User({ username: req.body.username });
  // if(req.body.adminCode === process.env.ADMIN_CODE) {
  //   newUser.isAdmin = true;
  // }
  // refactor w/ 'orFail()' hopefully works before catchAsync
  const registerUser = await User.register(newUser, req.body.password)
    .orFail(() => res.render('register', { error: err.message }));
  
  passport.authenticate('local')(req, res, () => {
    req.flash('success', 'Welcome To YelpCamp ' + registerUser.username);
    res.redirect('/campsites');
  });
  
}));

// User Profile
router.get('/user/:id', middleware.isLoggedIn, catchAsync(async (req, res, next) => {
  const { id } = req.params
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('invalid id') // validating `id`
  
  const user = await User.findById(req.params.id)
    .populate('favorites')
    .exec();
    // .orFail(() => res.redirect('back', {error: "User Not Found..." }));

  if (!user) return res.redirect('back', {error: "User Not Found..." })
  console.log(user);

  //render show template with that campground
  res.render('users/show', { user: user });

    // req.flash('error', 'User Not Found...');
    // res.redirect('back');

}));

// Add Favorite
router.post('/user/:id/:campsite', middleware.isLoggedIn, catchAsync(async (req, res, next) => {
  //lookup campsite using id
  console.log(req.params.campsite);
  const campId = req.params.campsite;
  const campsite = await Campsite.findOne({ id: campId }).orFail(() => {throw err}); 
  const foundUser = await User.findById(req.params.id).orFail(() => {throw err});
  const err = new ExpressError(`campsite: ${campsite}; user: ${foundUser}`, 500);
    
  console.log('found: ', foundUser);
  foundUser.favorites.push(campsite._id);
  await foundUser.save();
  console.log('added favorite to: ', foundUser);
  req.flash(
    'success',
    campsite.name + ' has been added to your favorites!'
  );
  res.redirect('/campsites/show/' + req.params.campsite);
  
}));

// show LOGIN form
router.get('/login', (req, res) => {
  res.render('login');
});
// handle LOGIN logic
router.post('/login',
  passport.authenticate('local', {
    successRedirect: '/campsites',
    failureRedirect: '/login',
  }),
  (req, res) => {
    // req.flash("success", "Welcome To YelpCamp " + user.username);
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

//middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

module.exports = router;
