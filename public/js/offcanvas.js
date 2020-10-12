$(function () {
  'use strict'

  $('[data-toggle="offcanvas"]').on('click', function () {
    $('.offcanvas-collapse').toggleClass('open')
  })
})
// $(function () {
//   $('[data-toggle="popover"]').popover()
// });

$(document).ready(function() {
  $(".dropdown-menu").css('margin','50px');
  $(function () {
      $('[data-toggle="popover"]').popover()
  })
  $("#popoverData").popover({ trigger: "hover" });
});