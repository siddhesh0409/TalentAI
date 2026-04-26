/**
 * CSV Candidate Parser
 * Accepts a CSV string with flexible column headers
 * Returns array of candidate objects compatible with the matching engine
 *
 * Expected columns (case-insensitive):
 *   name, role/title/position, company/org, experience/exp/years,
 *   location/city, remote, skills, salary/ctc, available/availability, bio/summary
 *
 * Example CSV:
 *   name,role,company,experience,location,remote,skills,salary,available,bio
 *   "John Doe","Senior Engineer","Acme",5,"Bangalore",true,"Python,AWS,Docker",30,"Immediately","Backend specialist"
 */

function parseCsvCandidates(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  // Parse header
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Column aliases
  const COL = {
    name:      find(headers, ['name', 'full name', 'candidate']),
    role:      find(headers, ['role', 'title', 'position', 'job title']),
    company:   find(headers, ['company', 'org', 'organisation', 'organization', 'employer']),
    exp:       find(headers, ['experience', 'exp', 'years', 'years of experience']),
    location:  find(headers, ['location', 'city', 'place']),
    remote:    find(headers, ['remote', 'remote ok', 'work from home']),
    skills:    find(headers, ['skills', 'technologies', 'tech stack', 'expertise']),
    salary:    find(headers, ['salary', 'ctc', 'expected salary', 'package']),
    available: find(headers, ['available', 'availability', 'notice period', 'joining']),
    bio:       find(headers, ['bio', 'summary', 'about', 'description', 'profile']),
  };

  const candidates = [];
  const COLORS = ['#0090ff','#7c3aed','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6','#f97316'];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);

    const name = getValue(cols, COL.name) || `Candidate ${i}`;
    const skills = parseSkills(getValue(cols, COL.skills));
    const exp    = parseInt(getValue(cols, COL.exp)) || 0;

    candidates.push({
      id:          1000 + i,
      name,
      avatar:      name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      color:       COLORS[i % COLORS.length],
      role:        getValue(cols, COL.role)      || 'Professional',
      company:     getValue(cols, COL.company)   || 'Unknown',
      exp,
      location:    getValue(cols, COL.location)  || 'Not specified',
      remote:      parseBoolean(getValue(cols, COL.remote)),
      skills,
      salary:      parseInt(getValue(cols, COL.salary)) || 0,
      available:   getValue(cols, COL.available) || 'Not specified',
      personality: 'professional',
      bio:         getValue(cols, COL.bio)        || `${exp}y experience as ${getValue(cols, COL.role) || 'professional'}.`,
      fromCSV:     true,
    });
  }

  return candidates;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function find(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getValue(cols, idx) {
  if (idx === -1 || idx >= cols.length) return '';
  return (cols[idx] || '').trim().replace(/^"|"$/g, '');
}

function parseSkills(str) {
  if (!str) return [];
  return str.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

function parseBoolean(str) {
  if (!str) return false;
  const lower = str.toLowerCase().trim();
  return ['true','yes','1','y','ok'].includes(lower);
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

module.exports = { parseCsvCandidates };
