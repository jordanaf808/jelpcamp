const sanitizeHtml = require('sanitize-html')

// Sanitizer for third-party HTML we DISPLAY (RIDB facility descriptions).
//
// This is deliberately NOT the config used by the Joi `escapeHTML` extension in
// middleware/index.js. That one strips every tag, which is right for validating
// user input we can reject. RIDB data cannot be rejected — it has to be cleaned
// and rendered — so this keeps the formatting the descriptions rely on.
//
// The allowlist is derived from 276 facilities sampled across 6 RIDB queries on
// 2026-09-04. Observed tags, by frequency:
//   p 3400, h2 2568, br 1237, li 778, strong 522, ul 182, a 372, em 26, b 8, h3 6
// Observed attributes: a[href], a[rel], a[title]. Nothing else appeared.
// h1, h4, ol and hr are allowed pre-emptively — same risk profile, and the API
// can start emitting them without warning.
const options = {
	allowedTags: [
		'p',
		'br',
		'hr',
		'h1',
		'h2',
		'h3',
		'h4',
		'ul',
		'ol',
		'li',
		'strong',
		'b',
		'em',
		'i',
		'a',
	],
	// rel and target are listed because allowedAttributes is applied AFTER
	// transformTags — without them the rel/target added below get stripped again.
	allowedAttributes: {
		a: ['href', 'title', 'rel', 'target'],
	},
	// Blocks javascript: and data: URIs in href.
	allowedSchemes: ['http', 'https', 'mailto'],
	// Drop the contents of anything not allowed, rather than keeping the inner
	// text of a stripped <script> or <style> as visible page copy.
	nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
	transformTags: {
		// These are outbound links to third-party sites. rel is rewritten rather
		// than allowlisted so a malicious or merely stale rel from the API cannot
		// hand the linked page a window.opener reference.
		a: sanitizeHtml.simpleTransform('a', {
			rel: 'noopener noreferrer nofollow',
			target: '_blank',
		}),
	},
}

// Returns a string in every case: RIDB omits FacilityDescription on some records,
// and the views interpolate the result directly.
const sanitizeDescription = (html) =>
	typeof html === 'string' ? sanitizeHtml(html, options) : ''

module.exports = sanitizeDescription
