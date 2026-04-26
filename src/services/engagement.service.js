/**
 * engagement.service.js — Conversational Engagement Simulator (Step 3)
 * Simulates recruiter outreach conversations for top matched candidates.
 * Scores each candidate's genuine interest 0-100.
 */

const { callGeminiJSON } = require('./gemini.service');

const SYSTEM = `You are simulating realistic recruiter-to-candidate outreach conversations.
Each candidate has a unique personality. Make responses feel human and authentic.
Candidates may ask questions, express hesitation, or show varying enthusiasm — all normal.`;

function buildPrompt(jdParsed, candidates) {
  const profiles = candidates.map(c =>
    `[ID:${c.id}] ${c.name}\n` +
    `  Current role: ${c.role} @ ${c.company} | ${c.exp}y experience\n` +
    `  Personality:  ${c.personality}\n` +
    `  Salary:       ₹${c.salary}L | Available: ${c.available}\n` +
    `  Background:   ${c.bio}`
  ).join('\n\n');

  return `Simulate outreach conversations for this open role and score each candidate's genuine interest.

═══ ROLE BEING HIRED ═══
Title:    ${jdParsed.role}
Budget:   ${jdParsed.salary || 'Competitive — open to discussion'}
Location: ${jdParsed.location} (Remote: ${jdParsed.remote})
Domain:   ${jdParsed.domain}

═══ CANDIDATES ═══
${profiles}

For EACH candidate:
  1. Write a 6-message conversation: recruiter → candidate → recruiter → candidate → recruiter → candidate
  2. Make the candidate's responses reflect their personality, salary situation, and availability
  3. Score their genuine interest 0-100

═══ INTEREST SCORING (100 pts) ═══
- enthusiasm   (35 pts): excitement, proactive questions, positive language
- availability (25 pts): notice period and readiness to join
- salaryFit    (20 pts): expectations vs budget alignment
- growthFit    (20 pts): career development interest and role fit

Return ONLY a JSON array. Use the exact ID values from the [ID:...] tags.

[
  {
    "id": "<exact id>",
    "interestScore": <0-100>,
    "interestBreakdown": {
      "enthusiasm":   <0-35>,
      "availability": <0-25>,
      "salaryFit":    <0-20>,
      "growthFit":    <0-20>
    },
    "interestReason": "2-3 sentences explaining the interest score with specific evidence",
    "keySignals": ["positive signal", "concern if any"],
    "conversation": [
      { "role": "recruiter", "text": "..." },
      { "role": "candidate", "text": "..." },
      { "role": "recruiter", "text": "..." },
      { "role": "candidate", "text": "..." },
      { "role": "recruiter", "text": "..." },
      { "role": "candidate", "text": "..." }
    ]
  }
]`;
}

async function engageCandidates(jdParsed, candidates, apiKey, topN = 5) {
  const toEngage = candidates.slice(0, topN);

  const engagements = await callGeminiJSON(
    apiKey,
    SYSTEM,
    buildPrompt(jdParsed, toEngage),
    { temperature: 0.75, maxOutputTokens: 3500 }
  );

  if (!Array.isArray(engagements)) {
    throw new Error('Engagement service received non-array from Gemini');
  }

  // Merge engagement data back into candidate objects
  return candidates.map((candidate) => {
    // Normalise ID comparison — Gemini may return number or string
    const eng = engagements.find((e) => String(e.id) === String(candidate.id));

    if (!eng) {
      return {
        ...candidate,
        interestScore:     null,
        interestBreakdown: {},
        interestReason:    null,
        keySignals:        [],
        conversation:      [],
      };
    }

    return {
      ...candidate,
      interestScore:     Math.min(100, Math.max(0, Number(eng.interestScore) || 0)),
      interestBreakdown: eng.interestBreakdown || {},
      interestReason:    eng.interestReason    || '',
      keySignals:        Array.isArray(eng.keySignals)    ? eng.keySignals    : [],
      conversation:      Array.isArray(eng.conversation)  ? eng.conversation  : [],
    };
  });
}

module.exports = { engageCandidates };
