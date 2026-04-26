/**
 * parser.service.js — JD Parser (Step 1)
 * Sends raw JD text to Gemini and returns a structured object.
 */

const { callGeminiJSON } = require('./gemini.service');

const SYSTEM = `You are an expert technical recruiter with 15 years of experience.
Parse job descriptions accurately and extract all requirements into structured data.`;

async function parseJD(jdText, apiKey) {
  if (!jdText || jdText.trim().length < 50) {
    throw new Error('Job description is too short. Please provide a complete JD (minimum 50 characters).');
  }

  const parsed = await callGeminiJSON(apiKey, SYSTEM, `
Parse this job description and return ONLY a JSON object with exactly these fields:

{
  "role": "exact job title as written",
  "seniorityLevel": "junior|mid|senior|lead|principal",
  "experience": "e.g. 5+ years",
  "location": "city name or Remote",
  "remote": true or false,
  "salary": "salary range string or null if not mentioned",
  "domain": "primary industry e.g. fintech, AI/ML, e-commerce, SaaS, healthcare",
  "requiredSkills": ["skill1", "skill2"],
  "niceToHaveSkills": ["skill1"],
  "responsibilities": ["key responsibility 1", "key responsibility 2"],
  "keywords": ["keyword1", "keyword2"]
}

Rules:
- requiredSkills: only explicit must-have skills, 3-12 items, short labels like "Python" not "Python programming language"
- niceToHaveSkills: preferred/bonus skills, 0-6 items
- remote: true if the role mentions remote, hybrid, or WFH options

JOB DESCRIPTION:
${jdText}
  `, { temperature: 0.2, maxOutputTokens: 1500 });

  return {
    role:             parsed.role             || 'Unknown Role',
    seniorityLevel:   parsed.seniorityLevel   || 'mid',
    experience:       parsed.experience       || 'Not specified',
    location:         parsed.location         || 'Not specified',
    remote:           Boolean(parsed.remote),
    salary:           parsed.salary           || null,
    domain:           parsed.domain           || 'Technology',
    requiredSkills:   Array.isArray(parsed.requiredSkills)   ? parsed.requiredSkills   : [],
    niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills) ? parsed.niceToHaveSkills : [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
    keywords:         Array.isArray(parsed.keywords)         ? parsed.keywords         : [],
    parsedAt:         new Date().toISOString(),
  };
}

module.exports = { parseJD };
