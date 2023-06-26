const express = require('express'),
  Campground = require('../models/campground'),
  Campsite = require('../models/campsite'),
  Comment = require('../models/comment');
const router = express.Router({ mergeParams: true });
const middleware = require('../middleware');
const catchAsync = require('../utils/catchAsync');

// =======================
// COMMENTS ROUTES
// =======================
// NEW comment
router.get('/new', middleware.isLoggedIn, catchAsync(async (req, res, next) => {
  //find campgound by id
  const { id } = req.params;
  const campsite = await Campsite.findOne({ id: id });
  res.render('comments/new', { campsite });
}));

// CREATE comments
router.post('/', middleware.isLoggedIn, catchAsync(async (req, res, next) => {
  //lookup campground using id
  const { id } = req.params;
  const campsite = await Campsite.findOne({ id: id });
  const comment = await Comment.create(req.body.comment);
  if(!comment){
    req.flash('error', 'Error Creating Comment.');
    console.log(err);
    return res.redirect('/campsites');
  }
  //add username and id to comment
  comment.author.id = req.user._id;
  comment.author.username = req.user.username;
  //save comment
  await comment.save();
  campsite.comments.push(comment);
  await campsite.save();
  console.log(comment);
  res.redirect('/campsites/show/' + id);
}));

//EDIT Comment route
router.get('/:comment_id/edit',
middleware.checkCommentOwnership,
  catchAsync(async (req, res, next) => {
    console.log(req.params.comment_id);
    const { id } = req.params;
    const foundCampsite = await Campsite.findOne({ id: id });
    if(!foundCampsite){
      req.flash('error', 'No Campground Found...');
      return res.redirect('back');
    }
    const foundComment = await Comment.findById(req.params.comment_id);
    res.render('comments/edit', {
      campsite_id: id,
      comment: foundComment,
    });
  })
);

//UPDATE Comment route
router.put('/:comment_id', 
  middleware.checkCommentOwnership, 
  catchAsync(async (req, res, next) => {
    console.log(req.params);
    updateComment = await Comment.findByIdAndUpdate(req.params.comment_id, req.body.comment);
    if(!updateComment){
      req.flash('error', 'Error Updating Comment...');
      return res.redirect('back');
    }
    req.flash('success', 'Comment Updated.');
    res.redirect('/campsites/show/' + req.params.id);
  })
);

//DESTROY Comment route
router.delete('/:comment_id', 
  middleware.checkCommentOwnership, 
  catchAsync(async (req, res, next) => {
    const deleteComment = await Comment.findByIdAndRemove(req.params.comment_id);
    if(!deleteComment){
      req.flash('error', 'Error Deleting Comment...');
      return res.redirect('back');
    }
    req.flash('success', 'Comment Deleted.');
    res.redirect('/campsites/show/' + req.params.id);
  })
);

module.exports = router;
