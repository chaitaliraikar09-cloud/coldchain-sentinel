/**
 * Haversine formula to calculate straight-line distance between two lat/lng points
 * Returns distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find nearest available checkpoint to given coordinates
 */
function findNearestCheckpoint(lat, lon, checkpoints) {
  const available = checkpoints.filter(c => c.available);
  if (!available.length) return null;

  let nearest = null;
  let minDist = Infinity;
  for (const cp of available) {
    const dist = haversineDistance(lat, lon, cp.latitude, cp.longitude);
    if (dist < minDist) {
      minDist = dist;
      nearest = cp;
    }
  }
  return nearest ? { ...nearest, distanceKm: Math.round(minDist * 10) / 10, distanceType: 'straight-line' } : null;
}

module.exports = { haversineDistance, findNearestCheckpoint };
