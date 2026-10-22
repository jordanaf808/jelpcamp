// The site nav (views/partials/header.ejs).
//
// Below 900px the links fold behind the Menu button. The CSS only folds them
// once this script marks the nav as enhanced, so without JavaScript the links
// stay visible and the button stays hidden.
;(() => {
	const nav = document.querySelector('[data-site-nav]')
	if (!nav) return
	const toggle = nav.querySelector('[data-nav-toggle]')
	const menu = document.getElementById(toggle.getAttribute('aria-controls'))

	// The views get no request path, so the current section is found here.
	// "page" is the link's own page; "true" is a page inside its section, such
	// as a campsite under Campsites.
	const path = window.location.pathname
	for (const link of menu.querySelectorAll('[data-nav-link]')) {
		const href = link.getAttribute('href')
		if (path === href) {
			link.setAttribute('aria-current', 'page')
		} else if (path.startsWith(href + '/')) {
			link.setAttribute('aria-current', 'true')
		}
	}

	const isOpen = () => toggle.getAttribute('aria-expanded') === 'true'
	const setOpen = (open) => {
		toggle.setAttribute('aria-expanded', String(open))
		nav.classList.toggle('is-open', open)
	}

	toggle.addEventListener('click', () => setOpen(!isOpen()))

	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || !isOpen()) return
		setOpen(false)
		toggle.focus()
	})

	// Above the breakpoint the links show inline and the button is hidden. A menu
	// left open there would still be open, unasked, when the window narrows.
	window
		.matchMedia('(min-width: 900px)')
		.addEventListener('change', (event) => {
			if (event.matches && isOpen()) setOpen(false)
		})

	nav.classList.add('is-enhanced')
})()
