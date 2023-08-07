const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const middleware = require('../middleware');

// import utils
const catchAsync = require('../utils/catchAsync');
const ExpressError = require('../utils/ExpressError');
// import models
const User = require('../models/user');
const Campsite = require('../models/campsite');

// User Profile
router.get('/:id', middleware.isLoggedIn, catchAsync(async (req, res, next) => {
  const { id } = req.params
  // validate `id`
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('invalid id');
  // get user info and populate with favorites info
  const user = await User.findById(req.params.id).populate('favorites').exec();
  if (!user) {
    req.flash('error', 'User Not Found...');
    return res.redirect('back', {error: "User Not Found..." })
  }
  res.render('users/show', { user: user });
}));

// Add Favorite
router.post('/:id/:camp_id', 
  middleware.isLoggedIn, 
  catchAsync(async (req, res, next) => {
    //lookup campsite and user id using req.params
    const campId = req.params.camp_id;
    const campsite = await Campsite.findOne({ id: campId }).orFail(() => {throw err}); 
    const foundUser = await User.findById(req.params.id).orFail(() => {throw err});
    const err = new ExpressError(`campsite: ${campsite}; user: ${foundUser}`, 500);
    foundUser.favorites.push(campsite._id);
    await foundUser.save();
    console.log('added favorite to: ', foundUser);
    req.flash(
      'success',
      campsite.name + ' has been added to your favorites!'
    );
    res.redirect('/campsites/show/' + campId);
  }
));

// Delete Favorite
router.delete('/:id/:camp_id', 
  middleware.isLoggedIn, 
  catchAsync(async (req, res, next) => {
    //lookup campsite using id
    const campId = req.params.camp_id;
    const campsite = await Campsite.findOne({ id: campId }).orFail(() => {throw err}); 
    const foundUser = await User.findById(req.params.id).orFail(() => {throw err});
    const err = new ExpressError(`campsite: ${campsite}; user: ${foundUser}`, 500);
    console.log('found: ', foundUser);
    foundUser.favorites.pull(campsite._id);
    let result = await foundUser.save();
    console.log('removed from favorites: ', foundUser);
    console.log('results: ', result);
    req.flash(
      'success',
      campsite.name + ' has been removed from your favorites!'
    );
    res.redirect('/campsites/show/' + campId);
  }
));

module.exports = router;
