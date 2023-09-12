const mutateData = (data) => {
  // filter out any data withOUT GEOJSON
  const recData = data.filter(item => item.GEOJSON.COORDINATES);
  const mapData = recData.map(item => ({
    properties: {
      title: item.FacilityName,
      type: item.FacilityTypeDescription,
    },
    geometry: item.GEOJSON,
    id: item.FacilityID,
  }));
  return {recData, mapData};
}

module.exports = mutateData;