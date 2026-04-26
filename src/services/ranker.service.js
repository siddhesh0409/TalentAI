/**
 * ranker.service.js — Final Ranking Engine (Step 4)
 * Combined Score = Match × 0.6 + Interest × 0.4
 */

const MATCH_W    = 0.6;
const INTEREST_W = 0.4;

function computeCombined(matchScore, interestScore) {
  return Math.round((matchScore || 0) * MATCH_W + (interestScore || 0) * INTEREST_W);
}

function scoreTier(score) {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

function generateSummary(c) {
  const tier  = scoreTier(c.combinedScore);
  const avail = c.available === 'Immediately' ? 'available immediately' : `available in ${c.available}`;
  const mode  = c.remote ? 'open to remote' : 'prefers on-site';
  return {
    excellent: `🔥 Top pick`,
    strong:    `✅ Strong candidate`,
    moderate:  `⚡ Worth a call`,
    weak:      `⚠️ Below threshold`,
  }[tier] + ` — ${c.exp}y exp, ${avail}, ${mode}.`;
}

/**
 * @param {Array}  candidates    — enriched with matchScore + interestScore
 * @param {object} jdParsed
 * @param {number} totalInPool   — actual pool size (for accurate meta stats)
 */
function rankShortlist(candidates, jdParsed, totalInPool = 30) {
  const scored = candidates.map((c) => ({
    ...c,
    combinedScore: computeCombined(c.matchScore, c.interestScore),
    scoreTier:     scoreTier(computeCombined(c.matchScore, c.interestScore)),
  }));

  const ranked = scored.sort((a, b) =>
    b.combinedScore !== a.combinedScore
      ? b.combinedScore - a.combinedScore
      : b.matchScore   - a.matchScore
  );

  const finalList = ranked.map((c, i) => ({ ...c, rank: i + 1, summary: generateSummary(c) }));

  const engaged    = finalList.filter((c) => c.interestScore !== null);
  const avgMatch   = finalList.length ? Math.round(finalList.reduce((s, c) => s + c.matchScore,     0) / finalList.length) : 0;
  const avgInt     = engaged.length   ? Math.round(engaged.reduce(   (s, c) => s + c.interestScore, 0) / engaged.length)   : 0;
  const avgComb    = finalList.length ? Math.round(finalList.reduce((s, c) => s + c.combinedScore,  0) / finalList.length) : 0;
  const top        = finalList[0];

  return {
    shortlist: finalList,
    meta: {
      totalEvaluated:  totalInPool,
      shortlisted:     finalList.length,
      engaged:         engaged.length,
      averageMatch:    avgMatch,
      averageInterest: avgInt,
      averageCombined: avgComb,
      topScore:        top?.combinedScore || 0,
      topCandidate:    top?.name          || null,
      formula:         `Combined = Match×${MATCH_W} + Interest×${INTEREST_W}`,
      rankedAt:        new Date().toISOString(),
      jdRole:          jdParsed.role,
    },
  };
}

module.exports = { rankShortlist, computeCombined, scoreTier };
