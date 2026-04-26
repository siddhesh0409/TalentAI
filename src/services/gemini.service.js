/**
 * gemini.service.js — Gemini 2.0 Flash API Wrapper
 *
 * Uses Node 18+ native fetch (no node-fetch dependency).
 * Handles retry logic, error normalisation, and JSON extraction.
 */

const GEMINI_URL  = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES = 2;
const RETRY_MS    = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call Gemini and return raw text response.
 * Retries up to MAX_RETRIES times on transient failures.
 */
async function callGemini(apiKey, systemPrompt, userPrompt, config = {}) {
  const url  = `${GEMINI_URL}?key=${apiKey}`;
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature:     config.temperature     ?? 0.7,
      maxOutputTokens: config.maxOutputTokens ?? 3000,
      topP:            config.topP            ?? 0.9,
    },
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_MS * attempt);
      console.log(`[Gemini] Retry ${attempt}/${MAX_RETRIES}…`);
    }
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return text;

    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  throw new Error(`Gemini failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

/**
 * Call Gemini and parse the response as JSON.
 * Strips markdown fences if Gemini wraps the output.
 */
async function callGeminiJSON(apiKey, systemPrompt, userPrompt, config = {}) {
  const raw = await callGemini(
    apiKey,
    `${systemPrompt}\n\nCRITICAL: Your entire response must be valid JSON only. No markdown, no code fences, no explanation text.`,
    userPrompt,
    { ...config, temperature: config.temperature ?? 0.3 }
  );

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/,      '')
    .replace(/```\s*$/,      '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Second attempt: extract the first JSON array or object
    const match = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    throw new Error('Gemini returned invalid JSON. Preview: ' + cleaned.slice(0, 300));
  }
}

module.exports = { callGemini, callGeminiJSON };
