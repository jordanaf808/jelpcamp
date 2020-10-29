const hamburger = document.querySelector('.navbar-toggler');

hamburger.addEventListener('click', () => {
  document.body.classList.toggle('nav-open');
});


$(function () {
  'use strict'

  $('[data-toggle="offcanvas"]').on('click', function () {
    $('.offcanvas-collapse').toggleClass('open')
  })
})