// Activates the first carousel slide on load.
// Extracted from an inline <script> so the CSP can use script-src 'self'.
window.onload = function () {
  let item = document.querySelector('div.carousel-item');
  let indicator = document.querySelector('ol.carousel-indicators li');
  // A campsite with no media renders no carousel items, so both can be null.
  if (item) item.classList.add('active');
  if (indicator) indicator.classList.add('active');
};
