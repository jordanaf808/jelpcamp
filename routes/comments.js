const express = require('express'),
  Campground = require('../models/campground'),
  Campsite = require('../models/campsite'),
  Comment = require('../models/comment');
const router = express.Router({ mergeParams: true });
const middleware = require('../middleware');

// =======================
// COMMENTS ROUTES
// =======================
// NEW comment
router.get('/new', middleware.isLoggedIn, (req, res) => {
  //find campgound by id
  const { id } = req.params;
  Campsite.findOne({ id: id }, (err, campsite) => {
    if (err) {
      console.log(err);
    } else {
      res.render('comments/new', { campsite });
    }
  });
});
// CREATE comments
router.post('/', middleware.isLoggedIn, (req, res) => {
  //lookup campground using id
  const { id } = req.params;
  Campsite.findOne({ id: id }, (err, campsite) => {
    if (err) {
      req.flash('error', 'Error Creating Comment.');
      console.log(err);
      res.redirect('/campsites');
    } else {
      Comment.create(req.body.comment, (err, comment) => {
        if (err) {
          console.log(err);
        } else {
          //add username and id to comment
          comment.author.id = req.user._id;
          comment.author.username = req.user.username;
          //save comment
          comment.save();
          campsite.comments.push(comment);
          campsite.save();
          console.log(comment);
          res.redirect('/campsites/show/' + id);
        }
      });
    }
  });
});
//EDIT Comment route
router.get(
  '/:comment_id/edit',
  middleware.checkCommentOwnership,
  (req, res) => {
    const { id } = req.params;
    Campsite.findOne({ id: id }, (err, foundCampsite) => {
      if (err || !foundCampsite) {
        req.flash('error', 'No Campground Found...');
        return res.redirect('back');
      }
      Comment.findById(req.params.comment_id, function (err, foundComment) {
        if (err) {
          res.redirect('back');
        } else {
          res.render('comments/edit', {
            campsite_id: id,
            comment: foundComment,
          });
        }
      });
    });
  }
);

//UPDATE Comment route
router.put('/:comment_id', middleware.checkCommentOwnership, (req, res) => {
  console.log(req.params);
  Comment.findByIdAndUpdate(
    req.params.comment_id,
    req.body.comment,
    function (err, updatedComment) {
      if (err) {
        res.redirect('back');
      } else {
        res.redirect('/campsites/show/' + req.params.id);
      }
    }
  );
});

//DESTROY Comment route
router.delete('/:comment_id', middleware.checkCommentOwnership, (req, res) => {
  Comment.findByIdAndRemove(req.params.comment_id, function (err) {
    if (err) {
      res.redirect('back');
    } else {
      req.flash('success', 'Comment Deleted.');
      res.redirect('/campsites/show/' + req.params.id);
    }
  });
});

module.exports = router;
