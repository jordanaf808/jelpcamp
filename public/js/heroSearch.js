// Keeps the homepage hero's scene pins (<wandur-campsite>, wandurCampsite.js)
// and the search form's Activity dropdown showing the same choice. Setting a
// value from code fires no `change` event, so the two can't loop.
;(() => {
	const scene = document.querySelector('wandur-campsite')
	const activity = document.getElementById('search-activities')
	if (!scene || !activity) return

	// Also covers a choice the browser restored on Back.
	scene.setAttribute('active', activity.value)

	document.addEventListener('wandur-activity', (e) => {
		activity.value = e.detail.value
	})
	activity.addEventListener('change', () => {
		scene.setAttribute('active', activity.value)
	})
})()
