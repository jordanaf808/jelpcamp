const express = require('express');
const router = express.Router();
const Campground = require('../models/campground');
const Comment = require('../models/comment');
//'require' automatically looks for 'index.js' in specified directory
const middleware = require('../middleware');
const NodeGeocoder = require('node-geocoder');
const numeral = require('numeral');

const options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null,
};

const geocoder = NodeGeocoder(options);

//INDEX - show all campgrounds
router.get('/', (req, res) => {
  // 	get all campgrounds from DB
  // first argument is an object with a conditional, e.g. find({ name: 'John' }
  // other query options are available as arguments. The final argument is a function that takes an error and a variable to hold the response from the DB.

  Campground.find({}, (err, allCampgrounds) => {
    if (err) return console.error(err);
    else {
      res.render('campgrounds/index', {
        campgrounds: allCampgrounds,
        currentUser: req.user,
      });
    }
  });
});

// CREATE a new campground.
router.post('/', middleware.isLoggedIn, (req, res) => {
  //get data from form and add to campgrounds array
  const name = req.body.name;
  const image = req.body.image;
  const dollars = {
    style: 'currency',
    currency: 'USD',
  };
  const cost = req.body.price;
  const price = cost.toLocaleString('en-US', dollars);

  const desc = req.body.description;
  const author = {
    id: req.user._id,
    username: req.user.username,
  };
  geocoder.geocode(req.body.location, (err, data) => {
    if (err || !data.length) {
      console.log(err);
      req.flash('error', 'Invalid Address');
      return res.redirect('back');
    }
    const lat = data[0].latitude;
    const lng = data[0].longitude;
    const location = data[0].formattedAddress;
    const newCampground = {
      name: name,
      image: image,
      price: price,
      description: desc,
      author: author,
      location: location,
      lat: lat,
      lng: lng,
    };
    // create a new campground and save to DB
    Campground.create(newCampground, (err, newlyCreated) => {
      if (err) {
        console.log(err);
      } else {
        //redirect back to campgrounds array
        res.redirect('/campgrounds');
        console.log(newlyCreated);
      }
    });
  });
});

//NEW - Show form to create campground.
router.get('/new', middleware.isLoggedIn, (req, res) => {
  res.render('campgrounds/new');
});

//SHOW - show more info about campground.
router.get('/:id', middleware.isLoggedIn, (req, res) => {
  //find the campground by ID
  Campground.findById(req.params.id)
    .populate('comments')
    .exec((err, foundCampground) => {
      if (err || !foundCampground) {
        req.flash('error', 'Campground Not Found...');
        res.redirect('back');
      } else {
        console.log(foundCampground);
        //render show template with that campground
        res.render('campgrounds/show', { campground: foundCampground });
      }
    });
});

// EDIT Campground route.
router.get('/:id/edit', middleware.checkCampgroundOwnership, (req, res) => {
  Campground.findById(req.params.id, (err, foundCampground) => {
    res.render('campgrounds/edit', { campground: foundCampground });
  });
});

// UPDATE Campground route.
router.put('/:id', middleware.checkCampgroundOwnership, (req, res) => {
  geocoder.geocode(req.body.location, (err, data) => {
    if (err || !data.length) {
      req.flash('error', 'Invalid Address');
      return res.redirect('back');
    }
    req.body.campground.lat = data[0].latitude;
    req.body.campground.lng = data[0].longitude;
    req.body.campground.location = data[0].formattedAddress;
    //find and update the correct campground.
    Campground.findByIdAndUpdate(
      req.params.id,
      req.body.campground,
      (err, updatedCampground) => {
        if (err) {
          req.flash('error', err.message);
          res.redirect('/campgrounds');
        } else {
          req.flash('success', 'Successfully Updated.');
          res.redirect('/campgrounds/' + req.params.id);
        }
      }
    );
  });
});

// DESTROY Campground route
router.delete('/:id', middleware.checkCampgroundOwnership, (req, res) => {
  Campground.findByIdAndRemove(req.params.id, (err, campgroundRemoved) => {
    if (err) {
      res.redirect('/campgrounds');
    }
    Comment.deleteMany({ _id: { $in: campgroundRemoved.comments } }, err => {
      if (err) {
        console.log(err);
      }
      req.flash('success', 'Campground Deleted.');
      res.redirect('/campgrounds');
    });
  });
});

module.exports = router;
