const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const middleware = require('../middleware')

// import utils
const ExpressError = require('../utils/ExpressError')
const safeBack = require('../utils/safeBack')
// import models
const User = require('../models/user')
const Campsite = require('../models/campsite')
const Comment = require('../models/comment')

// User Profile
router.get(
	'/:id',
	middleware.isLoggedIn,
	middleware.checkAccountOwnership,
	async (req, res) => {
		const {id} = req.params
		// validate `id`
		if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('invalid id')
		// get user info and populate with favorites info
		const user = await User.findById(req.params.id).populate('favorites').exec()
		if (!user) {
			req.flash('error', 'User Not Found...')
			return res.redirect(safeBack(req))
		}
		const commentCount = await Comment.countDocuments({'author.id': user._id})
		res.render('users/show', {user, commentCount})
	},
)

// Add Favorite
router.post(
	'/:id/:camp_id',
	middleware.isLoggedIn,
	middleware.checkAccountOwnership,
	async (req, res) => {
		//lookup campsite and user id using req.params
		const campId = req.params.camp_id
		const campsite = await Campsite.findOne({id: campId}).orFail(
			new ExpressError('Campsite not found', 404),
		)
		const foundUser = await User.findById(req.params.id).orFail(
			new ExpressError('User not found', 404),
		)
		foundUser.favorites.push(campsite._id)
		await foundUser.save()
		req.flash('success', campsite.name + ' has been added to your favorites!')
		res.redirect('/campsites/show/' + campId)
	},
)

// Delete Favorite
router.delete(
	'/:id/:camp_id',
	middleware.isLoggedIn,
	middleware.checkAccountOwnership,
	async (req, res) => {
		//lookup campsite using id
		const campId = req.params.camp_id
		const campsite = await Campsite.findOne({id: campId}).orFail(
			new ExpressError('Campsite not found', 404),
		)
		const foundUser = await User.findById(req.params.id).orFail(
			new ExpressError('User not found', 404),
		)
		foundUser.favorites.pull(campsite._id)
		await foundUser.save()
		req.flash(
			'success',
			campsite.name + ' has been removed from your favorites!',
		)
		res.redirect('/campsites/show/' + campId)
	},
)

module.exports = router
