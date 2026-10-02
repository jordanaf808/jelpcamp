# WANDUR Notes

## 9/2023

### 9/2

Added Axios Cache Interceptor package to the Campsites route! refactored code to filter out Rec and MapData in mutateData.js

### 9/1

Successfuly deployed WANDUR to the Render hosting platform without major errors! I believe some SIGTERM code I added to close the app on a terminate signal was actually being ran right after starting the app. I commented out the code allowing me to see the campsites page. Everything seemed to be working except the GoogleMaps API was throwing an unauthorized error, so I added the website address to the services I was using from Google, which allowed googleMaps to load.

## 7/2023

- for security make user register and log in to see campsite pages
- trouble getting Helmet to work properly.

- Need a Remove Favorite route.
- Prevent duplicate favorites.
- Fix User Show page to look better, add a delete favorite, also
- change the favorite button based on whether the site was favorite'd.

---

7/11/23

Fixed hiding the Favorite button if it was already favorited.
prevents duplicate favorites.
Add Delete Favorite button and route

## 6/2023

### 6/25/23

*Fixed* error with User.register() and other passport-local middleware callbacks.
  - I tried updating w/o callbacks and adding .onFail(), like the other mongoose queries, but this was throwing errors. 
  - Passport-mongoose-local plugin still accepts old syntax.
  - Wasn't sure how to use the updated syntax in the very limited docs for my needs.

*fixed* - error with checkComments middleware, and error with undefined ID. Turns out I wasn't awaiting async findById() after removing callbacks;

---

- fix syntax for updated dependencies
  - remove callback functions
  - use Try/Catch
  - use Async functions
  - added callback to req.logout
- update code to ES6
- adding error handler.

added $(onload) for offcanvas.js
added mongoose ID object validation on user page.

add favorites route works

### Issues

*fixed* update comment route. 6/25/23

*fixed* Error 6/24/23
- After performing a search, then selecting one of the results, an error is thrown from show.ejs, starting around the 'currentUser' check, right after the document has been successfuly been created in the database. However, if you go back and search for that same campsite, no error will be thrown and the show.ejs will load.
  - after creating a new campsite document I renamed the variable that I passed to 
  the show page, where it was not able to find said variable. renamed variable passed to show page back to foundCampground.

- Fix landing page styles
  - use overlay across whole page
  - fix icons overflowing on hover

---

<br>

_FIXED_ Fix Edit and Delete Comment Route

_done_ Add actvity pictures in the search description.

Add CampCards Title.

_Fixed_ Mapbox popup html/css, its too big.

---

## 5-2-21

improved landing page design, fixed problem with background not showing a picture

---

## 4-5-21

fixing spacing and responsiveness on the main index page

fix phone responsiveness

---

## 3-22-2021

Fixed Edit Comment Route.

save results of index page to DB instead of fetching from api each time?

---
