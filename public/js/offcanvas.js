$(window).on('load', () => {
	// The landing page loads this file through the footer, but has no navbar.
	const hamburger = document.querySelector('.navbar-toggler')
	if (hamburger) {
		hamburger.addEventListener('click', () => {
			document.body.classList.toggle('nav-open')
		})
	}

	$(function () {
		'use strict'

		$('[data-toggle="offcanvas"]').on('click', function () {
			$('.offcanvas-collapse').toggleClass('open')
		})
	})
})
