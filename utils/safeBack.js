// Where a "back" redirect should send the user: the page they came from, but
// only when that page is on this site. Anything else goes to the fallback.
//
// This replaces res.redirect('back'), which Express 5 removed. Express 4 used
// the Referer header as-is, and that header is client-controlled — but the
// only way to arrive here with a cross-site Referer is from a page already on
// that other site, so bouncing back to it was never a usable open redirect
// (see SECURITY-FINDINGS.md). The same-site check below is still correct; it
// just isn't closing a hole that worked.
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
	if (path.startsWith('//')) return fallback

	// A GET sent back to the page it came from is a loop: a browser keeps the
	// same Referer when it follows a redirect, so the next request arrives
	// identical to this one. Other methods are safe — the redirect lands on a GET
	// of that path, which is a different handler.
	if (req.method === 'GET' && path === req.originalUrl) return fallback

	return path
}

module.exports = safeBack
