const express = require('express');
const passport = require('passport');
const User = require('../models/user');
const Campground = require('../models/campground');
const Campsite = require('../models/campsite');
const mapboxgl = require('mapbox-gl/dist/mapbox-gl.js');
const router = express.Router();
const middleware = require('../middleware');

router.get('/', async (req, res) => {
  // 	get all campgrounds from DB
  // Campground.find({}, (err, allCampgrounds) => {
    try {
      const allCampgrounds = await Campground.find();
      res.render('landing', { campgrounds: allCampgrounds });
    } catch (error) {
      return console.error(err);
    }
});

// ========================
// AUTH ROUTES
// ========================
// Show Register Form:

router.get('/register', (req, res) => {
  res.render('register');
});
// Handle register logic...
router.post('/register', (req, res) => {
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
});

// User Profile
router.get('/user/:id', middleware.isLoggedIn, function (req, res) {
  User.findById(req.params.id)
    .populate('favorites')
    .exec((err, user) => {
      if (err || !user) {
        req.flash('error', 'Campground Not Found...');
        res.redirect('back');
      } else {
        console.log(user);
        //render show template with that campground
        res.render('users/show', { user: user });
      }
    });
});

// Add Favorite
router.post('/user/:id/:campsite', middleware.isLoggedIn, (req, res) => {
  //lookup campground using id
  // const { id } = req.params;
  console.log(req.params.campsite);
  const campId = req.params.campsite;
  Campsite.findOne({ id: campId }, (err, campsite) => {
    if (err) {
      req.flash('error', 'Error Creating Favorite.');
      console.log(err);
      res.redirect(`/campsites/${campId}`);
    } else {
      User.findById(req.params.id, function (err, foundUser) {
        if (err) {
          req.flash('error', 'user not found');
          return res.redirect('/');
        } else {
          // need to check if favorite camp already exists ***
          console.log(foundUser);
          foundUser.favorites.push(campsite._id);
          foundUser.save();
          console.log(foundUser);
          req.flash(
            'success',
            campsite.name + ' has been added to your favorites!'
          );
          res.redirect('/campsites/show/' + req.params.campsite);
        }
      });
    }
  });
});

// show LOGIN form
router.get('/login', (req, res) => {
  res.render('login');
});
// handle LOGIN logic
router.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/campsites',
    failureRedirect: '/login',
  }),
  (req, res) => {
    // req.flash("success", "Welcome To YelpCamp " + user.username);
  }
);

// Logout ROUTE
router.get('/logout', (req, res) => {
  console.log('user is logged out');
  req.logout();
  req.flash('success', 'Logged Out.');
  res.redirect('/');
});

//middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

module.exports = router;
