/**
 * Demo Viability Risk Score Service
 * 
 * IMPORTANT DISCLAIMER: This is a DEMONSTRATION risk score for a hackathon prototype.
 * It is NOT a medically validated measure of vaccine potency or remaining shelf life.
 * Actual viability assessment requires validated vaccine-specific stability data
 * and appropriate expert/regulatory review.
 */

/**
 * Compute a demo risk score from 0-100 based on temperature excursion data
 * Higher score = higher risk
 */
function computeRiskScore(shipment, recentReadings = []) {
  const factors = [];
  let score = 0;

  const { tempMin, tempMax } = shipment;
  const excursionDuration = shipment.excursionDuration || 0; // in minutes
  const excursionActive = shipment.excursionActive || false;

  // Factor 1: Current temperature deviation (0-35 points)
  if (recentReadings.length > 0) {
    const latestReading = recentReadings[recentReadings.length - 1];
    const temp = latestReading.temperature;
    let deviation = 0;
    if (temp > tempMax) deviation = temp - tempMax;
    else if (temp < tempMin) deviation = tempMin - temp;

    if (deviation > 0) {
      const deviationScore = Math.min(35, deviation * 5);
      score += deviationScore;
      factors.push({
        name: 'Temperature Deviation',
        contribution: Math.round(deviationScore),
        detail: `${deviation.toFixed(1)}°C outside permitted range`,
      });
    } else {
      factors.push({
        name: 'Temperature Deviation',
        contribution: 0,
        detail: 'Within permitted range',
      });
    }
  }

  // Factor 2: Excursion duration (0-30 points)
  if (excursionDuration > 0) {
    const durationScore = Math.min(30, excursionDuration * 2);
    score += durationScore;
    factors.push({
      name: 'Excursion Duration',
      contribution: Math.round(durationScore),
      detail: `${excursionDuration.toFixed(1)} minutes cumulative out-of-range time`,
    });
  } else {
    factors.push({
      name: 'Excursion Duration',
      contribution: 0,
      detail: 'No excursion time recorded',
    });
  }

  // Factor 3: Active excursion penalty (0-20 points)
  if (excursionActive) {
    const excursionPenalty = 20;
    score += excursionPenalty;
    factors.push({
      name: 'Active Excursion',
      contribution: excursionPenalty,
      detail: 'Temperature is currently out of range',
    });
  } else {
    factors.push({
      name: 'Active Excursion',
      contribution: 0,
      detail: 'No active excursion',
    });
  }

  // Factor 4: Frequency of excursions (0-15 points)
  if (recentReadings.length > 0) {
    const outOfRange = recentReadings.filter(r => r.temperature > tempMax || r.temperature < tempMin).length;
    const frequency = outOfRange / recentReadings.length;
    const freqScore = Math.min(15, frequency * 20);
    score += freqScore;
    factors.push({
      name: 'Excursion Frequency',
      contribution: Math.round(freqScore),
      detail: `${Math.round(frequency * 100)}% of recent readings out of range`,
    });
  }

  const finalScore = Math.min(100, Math.round(score));

  let category, recommendedAction;
  if (finalScore < 20) {
    category = 'LOW';
    recommendedAction = 'Continue monitoring. No intervention required.';
  } else if (finalScore < 40) {
    category = 'MODERATE';
    recommendedAction = 'Increased monitoring recommended. Verify storage conditions.';
  } else if (finalScore < 70) {
    category = 'HIGH';
    recommendedAction = 'Immediate corrective action required. Contact supervisor.';
  } else {
    category = 'CRITICAL';
    recommendedAction = 'Stop shipment. Move to nearest checkpoint for inspection. Do not administer until cleared.';
  }

  return {
    score: finalScore,
    category,
    factors,
    recommendedAction,
    disclaimer: 'DEMO SCORE ONLY: Not a medically validated measure of vaccine potency or shelf life.',
    computedAt: new Date().toISOString(),
  };
}

module.exports = { computeRiskScore };
