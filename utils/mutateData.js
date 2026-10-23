const sanitizeHtml = require('sanitize-html')
const sanitizeDescription = require('./sanitizeDescription')

const BLOCK_TAG = /<\/?(?:p|br|hr|h[1-6]|ul|ol|li|div|blockquote|tr|td|th)\b/gi
const ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"'}

// The description as plain text, for the list cards, which clamp it to three
// lines. A link in that HTML would be hidden by the clamp while Tab still
// reached it. Headings ("Overview" on most facilities) are dropped with their
// text. sanitize-html decodes entities, then escapes &, <, > and " again, so
// those are decoded here: the view escapes summary once, with <%= %>.
const summaryOf = (html) => {
	if (typeof html !== 'string') return ''
	const text = sanitizeHtml(html.replace(BLOCK_TAG, ' $&'), {
		allowedTags: [],
		allowedAttributes: {},
		nonTextTags: [
			'script',
			'style',
			'textarea',
			'option',
			'noscript',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
		],
	})
	return text
		.replace(/&(?:amp|lt|gt|quot);/g, (entity) => ENTITIES[entity])
		.replace(/\s+/g, ' ')
		.trim()
}

// The primary image, else the first one. RIDB's MediaType is Image or Video,
// and a video URL is no use in an <img>.
const photoOf = (item) => {
	const images = (item.MEDIA ?? []).filter((m) => m.MediaType === 'Image')
	return (images.find((m) => m.IsPrimary) ?? images[0])?.URL ?? null
}

// Where a facility is, as the cards and the favorites page show it. The show
// route stores these on the Campsite document too.
const placeOf = (item) => ({
	state: item.FACILITYADDRESS?.[0]?.AddressStateCode || null,
	recAreaName: item.RECAREA?.[0]?.RecAreaName || null,
})

// Shapes a RIDB /facilities response for the index and results views.
// Descriptions are sanitized here rather than at each <%- %> in the templates,
// so the invariant is "everything downstream of the API fetch is clean" — one
// place to verify, and a new view cannot reintroduce the sink.
const mutateData = (data) => {
	// filter out any data withOUT GEOJSON
	const recData = data
		.filter((item) => item.GEOJSON.COORDINATES)
		.map((item) => ({
			...item,
			FacilityDescription: sanitizeDescription(item.FacilityDescription),
			summary: summaryOf(item.FacilityDescription),
			photo: photoOf(item),
			...placeOf(item),
			// GeoJSON lists longitude first.
			lat: item.GEOJSON.COORDINATES[1],
			lng: item.GEOJSON.COORDINATES[0],
		}))
	const mapData = recData.map((item) => ({
		properties: {
			title: item.FacilityName,
			type: item.FacilityTypeDescription,
		},
		geometry: item.GEOJSON,
		id: item.FacilityID,
	}))
	return {recData, mapData}
}

module.exports = mutateData
module.exports.placeOf = placeOf
