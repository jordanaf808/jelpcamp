// Where a "back" redirect should send the user: the page they came from, but
// only when that page is on this site. Anything else goes to the fallback.
//
// This replaces res.redirect('back'). Express 4 turned 'back' into the Referer
// header as-is, and that header is whatever the client sends, so a request
// arriving from another site could be bounced straight back to it: an open
// redirect. Express 5 removed 'back' entirely.
//
// Only the path and query string are returned, so the redirect stays on this
// site. A path starting with '//' is rejected, because a browser reads it as a
// protocol-relative URL pointing at another host.
//
// It only works if the browser sends a Referer to this site at all, which is
// why app.js sets helmet's Referrer-Policy to same-origin.
const safeBack = (req, fallback = '/') => {
	const referrer = req.get('Referrer')
	if (!referrer) return fallback

	let url
	try {
		url = new URL(referrer)
	} catch {
		return fallback
	}
	if (url.host !== req.get('host')) return fallback

	const path = url.pathname + url.search
	return path.startsWith('//') ? fallback : path
}

module.exports = safeBack
