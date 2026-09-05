const sanitizeDescription = require('./sanitizeDescription')

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
