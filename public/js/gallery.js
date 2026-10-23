// The photo gallery on the campsite page (views/campsites/show.ejs).
//
// Every photo is in the markup, one per figure, and all but the first are
// hidden. This shows one at a time: PREV and NEXT step through them (and wrap),
// the arrow keys do the same while focus is in the gallery, and a thumbnail
// jumps to its photo. The controls stay hidden until this script runs.
;(() => {
	const gallery = document.querySelector('[data-gallery]')
	if (!gallery) return

	const figures = [...gallery.querySelectorAll('[data-gallery-figure]')]
	const controls = gallery.querySelector('[data-gallery-controls]')
	const counter = gallery.querySelector('[data-gallery-counter]')
	if (figures.length < 2 || !controls || !counter) return

	const pad = (n) => String(n).padStart(2, '0')
	let current = 0

	const show = (index) => {
		current = (index + figures.length) % figures.length
		figures.forEach((figure, i) => {
			figure.hidden = i !== current
		})
		counter.textContent = `${pad(current + 1)} / ${pad(figures.length)}`
	}

	gallery
		.querySelector('[data-gallery-prev]')
		.addEventListener('click', () => show(current - 1))
	gallery
		.querySelector('[data-gallery-next]')
		.addEventListener('click', () => show(current + 1))
	for (const thumb of gallery.querySelectorAll('[data-gallery-goto]')) {
		thumb.addEventListener('click', () =>
			show(Number(thumb.dataset.galleryGoto)),
		)
	}

	gallery.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowLeft') show(current - 1)
		else if (event.key === 'ArrowRight') show(current + 1)
		else return
		event.preventDefault()
	})

	controls.hidden = false
})()
