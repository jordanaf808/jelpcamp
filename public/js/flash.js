// Dismiss buttons on flash messages (views/partials/header.ejs).
//
// The buttons have no data-dismiss="alert", so Bootstrap's alert plugin, still
// loaded by the footer, ignores them. The CSS shows the buttons only once this
// script marks the stack as enhanced.
;(() => {
	const stack = document.querySelector('[data-flash-stack]')
	if (!stack) return

	stack.addEventListener('click', (event) => {
		const button = event.target.closest('[data-flash-dismiss]')
		if (!button) return
		const flash = button.closest('.flash')
		const next = flash.nextElementSibling ?? flash.previousElementSibling
		flash.remove()
		// The focused button is gone, so focus would fall back to <body>.
		if (next) {
			next.querySelector('[data-flash-dismiss]').focus()
		} else {
			stack.remove()
			document.getElementById('main').focus()
		}
	})

	stack.classList.add('is-enhanced')
})()
