# WANDUR Notes

## 6/2023

- fix syntax for updated dependencies
  - remove callback functions
  - use Try/Catch
  - use Async functions
  - added callback to req.logout
- update code to ES6
- adding error handler.

added `.orFail()` to the register user route, to send back to register on error, and remove the if/else statement.
added $(onload) for offcanvas.js
added mongoose ID object validation on user page.

add favorites route works

### Issues

update comment route.

### fixed *Error*
- after creating a new campsite document I renamed the variable that I passed to 
the show page, where it was not able to find said variable. renamed variable passed to show page back to foundCampground.
- After performing a search, then selecting one of the results, an error is thrown from show.ejs, starting around the 'currentUser' check, *right after* the document has been successfuly been created in the database. However, if you go back and search for that same campsite, no error will be thrown and the show.ejs will load.

- Fix landing page styles
  - use overlay across whole page
  - fix icons overflowing on hover

- Need to create Remove Favorite route.

---

<br>

_FIXED_ Fix Edit and Delete Comment Route

_done_ Add actvity pictures in the search description.

Add CampCards Title.

_Fixed_ Mapbox popup html/css, its too big.

\*\*\* Fix User Show page to look better, add a delete favorite, also

\*\*\* change the favorite button based on whether the site was favorite'd.

---

## 3-22-2021

Fixed Edit Comment Route.

save results of index page to DB instead of fetching from api each time?

---

## 4-5-21

fixing spacing and responsiveness on the main index page

fix phone responsiveness

---

## 5-2-21

improved landing page design, fixed problem with background not showing a picture

---
