// Blocks submission of invalid forms. It lives here, not inline in the views,
// because script-src has no 'unsafe-inline' and the browser refuses inline
// script outright. Load it with
// <script src="/js/validateForms.js"></script> on any page whose form has
// class="validated-form".
//
// The inline copies this replaces queried `.needs-validation`, which the login
// and register forms never had — so on those pages it matched nothing even
// before the CSP started blocking it.
;(() => {
	'use strict'

	// Fetch all the forms we want to validate
	const forms = document.querySelectorAll('.validated-form')

	// Loop over them and prevent submission
	Array.from(forms).forEach((form) => {
		form.addEventListener(
			'submit',
			(event) => {
				if (!form.checkValidity()) {
					event.preventDefault()
					event.stopPropagation()
					// The forms are novalidate, so the browser shows no message of its own.
					// The .was-validated styles (wandur.css, show.css) mark the field, and
					// this adds the browser's "Please fill out this field" on top.
					form.reportValidity()
				}

				form.classList.add('was-validated')
			},
			false,
		)
	})
})()
