// Dismiss buttons on flash messages (views/partials/header.ejs).
//
// The CSS shows the buttons only once this script marks the list as
// enhanced.
;(() => {
	const list = document.querySelector('[data-flash-list]')
	if (!list) return

	list.addEventListener('click', (event) => {
		const button = event.target.closest('[data-flash-dismiss]')
		if (!button) return
		const flash = button.closest('.flash')
		const next = flash.nextElementSibling ?? flash.previousElementSibling
		flash.remove()
		// The focused button is gone, so focus would fall back to <body>.
		if (next) {
			next.querySelector('[data-flash-dismiss]').focus()
		} else {
			list.remove()
			document.getElementById('main').focus()
		}
	})

	list.classList.add('is-enhanced')
})()
