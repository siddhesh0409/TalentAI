# 🎯 TalentAI — AI-Powered Talent Scouting & Engagement Agent

> **Catalyst Hackathon 2025** · Built by Siddhesh Bhosale

An end-to-end AI recruitment agent that takes a Job Description, discovers matching candidates, simulates AI-powered outreach conversations to predict candidate interest, and delivers a recruiter-ready ranked shortlist scored on two dimensions: **Match Score** and **Interest Score**.

---

## ⚡ Built Under Pressure — Honest Dev Notes

This entire project was built during the Catalyst Hackathon 2025 under a tight deadline. The architecture, debugging, UI iteration, database design, and deployment were all done in one continuous sprint with no prior codebase.

**What this means about the current state:**

The **Match Score** is solid — Gemini reads the full JD and all candidate profiles, runs a structured 100-point rubric across skills, experience, domain fit, and location, and returns explainable per-factor scores.

The **Interest Score is AI-predicted, not real.** When Step 3 runs, Gemini simultaneously roleplays *both* the recruiter and the candidate in a 6-message conversation, then scores the fictional candidate's "interest" based on signals in that invented dialogue — enthusiasm, salary alignment, availability, and career growth fit. No one is actually contacted. No emails are sent. The candidate has no idea they've been evaluated.

The label in the UI says *"AI Persona Simulation"* to make this clear. The Interest Score is a useful proxy for "would this type of person likely be interested?" based on their profile data — but it is not real engagement.

The **Live Chat feature** is where real interaction happens. You type as the recruiter; Gemini plays the candidate in character using their profile and personality. Every message is saved to SQLite. In a production version the Interest Score would be computed from this real conversation after the recruiter finishes, not from the simulated one.

**What would be built next with more time:**
- Interest Score computed from the actual Live Chat, not a simulation
- "Score this conversation" button at the end of each Live Chat
- Real candidate outreach via email or LinkedIn API
- Multi-recruiter collaboration with shared shortlists
- Candidate self-service portal to respond to recruiter messages

**Bugs fixed during development (documented here for transparency):**

| Bug | Root cause | Fix |
|-----|-----------|-----|
| `npm install` failed on Windows | `better-sqlite3` requires Visual Studio C++ build tools | Replaced entirely with `sql.js` (pure JS/WASM, zero native compilation) |
| Launch button did nothing silently | `onclick="App.runAgent()"` in HTML fires before the script tag loads — `App` undefined | Removed all `onclick=""` from HTML; all handlers attached via `addEventListener` in `DOMContentLoaded` |
| CSV button did nothing | Same root cause as above | Fixed same way |
| Only 2 candidates expanded | UUID card IDs contain hyphens — `onclick="App.toggleCard(abc-123-def)"` is a JS syntax error. Built-in candidates 1 and 2 worked by accident (integers). | Cards no longer use `onclick`. `render.js` attaches all listeners via `addEventListener` with IDs stored as `data-cid` attributes |
| CSV upload: `cannot rollback — no transaction is active` | `sql.js` resets internal state when `db.export()` (flush to disk) is called inside an open transaction. The `run()` helper flushed after every INSERT, killing the transaction mid-loop. | `runTransaction()` now passes raw `db` to callback. Transactions use `db.run()` directly, never the `run()` helper. Single `flush()` happens after `COMMIT`. |
| SSE events dropped on stream end | Buffer split on `\n\n` then `parts.pop()` discarded the last complete event when the server closed the connection | Rewrote SSE reader to iterate line-by-line within each chunk looking for `data:` prefix |
| Gemini ID mismatch in matching | Gemini sometimes returns candidate IDs as numbers, sometimes as strings. Strict `===` comparison failed for half the pool | All ID comparisons normalised to `String(id)` in matcher and engagement services |

---

## 📁 Project Structure

```
talentai/
│
├── server.js                        ← Express entry point
│                                       Boots DB (async), seeds candidates, starts server
├── package.json                     ← Dependencies and npm scripts
├── .env.example                     ← Copy to .env and fill in
├── .gitignore                       ← Excludes node_modules/, data/, .env
├── vercel.json                      ← Vercel deployment config
│
├── data/                            ← Auto-created at runtime — gitignored
│   └── talentai.db                  ← SQLite database file (sql.js binary format)
│
├── samples/                         ← Ready-to-use demo files
│   ├── sample-candidates.csv        ← 12 realistic Indian tech candidates
│   └── sample-jds.txt               ← 5 complete job descriptions to paste
│
├── src/
│   ├── api/
│   │   ├── agent.routes.js          ← POST /api/agent/run (SSE)
│   │   │                               POST /api/agent/parse
│   │   │                               POST /api/agent/engage (live chat turn)
│   │   │                               POST /api/agent/upload-csv
│   │   │                               DELETE /api/agent/session/:id
│   │   │                               GET /api/agent/runs
│   │   │                               GET /api/agent/runs/:id
│   │   └── candidate.routes.js      ← GET /api/candidates + /summary + /samples
│   │
│   ├── config/
│   │   └── rateLimit.js             ← Rate limiter (skipped in dev, active in prod)
│   │
│   ├── data/
│   │   ├── candidates.js            ← 30 built-in candidate profiles (source of truth)
│   │   └── samples.js               ← 5 sample JDs served via API
│   │
│   ├── db/
│   │   ├── database.js              ← sql.js init (async), schema, query helpers
│   │   │                               KEY RULE: never call flush() inside a transaction
│   │   ├── seed.js                  ← Seeds candidates on first boot (single transaction)
│   │   └── repositories.js          ← CandidateRepo, RunRepo, ShortlistRepo,
│   │                                   ConversationRepo — all SQL lives here
│   │
│   ├── services/
│   │   ├── gemini.service.js        ← Gemini 2.0 Flash HTTP wrapper
│   │   │                               Native fetch (Node 18+), retry logic, JSON extraction
│   │   ├── parser.service.js        ← Step 1: JD text → structured JSON
│   │   ├── matcher.service.js       ← Step 2: score candidates from DB vs JD
│   │   ├── engagement.service.js    ← Step 3: AI persona simulation + interest scoring
│   │   └── ranker.service.js        ← Step 4: combined score, tier, summary
│   │
│   └── utils/
│       ├── validate.js              ← Request body validation
│       └── csvParser.js             ← Flexible CSV parser (handles quoted fields)
│
└── public/
    ├── index.html                   ← SPA shell — zero onclick="" attributes
    │                                   All handlers via addEventListener in app.js
    ├── css/
    │   ├── base.css                 ← Tokens, reset, animations
    │   ├── layout.css               ← Nav, hero, workspace grid
    │   └── components.css           ← Panels, pipeline, terminal
    └── js/
        ├── api.js                   ← HTTP + SSE client
        ├── ui.js                    ← Pipeline steps, terminal, modals
        ├── render.js                ← Card builder (all listeners via addEventListener)
        │                               Search, sort, CSV export, radar charts
        └── app.js                   ← Main controller — wires everything together
```

---

## ⚙️ Tech Stack

| Layer | What | Notes |
|-------|------|-------|
| Runtime | Node.js ≥ 18 | Native `fetch` built-in — no extra dep |
| Server | Express 4 | SSE-compatible, lightweight |
| Database | **sql.js** (SQLite in JS/WASM) | Originally `better-sqlite3` — switched because it requires Visual Studio C++ on Windows. `sql.js` works everywhere with `npm install`. |
| AI | Google Gemini 2.0 Flash | Free tier, handles structured JSON output well |
| Streaming | Server-Sent Events (SSE) | Real-time step updates without WebSockets |
| Security | Helmet + express-rate-limit + CORS | Production headers |
| Frontend | Vanilla HTML/CSS/JS | No build step, no framework |
| Charts | Chart.js 4 (CDN) | Radar chart per candidate, lazy-rendered |
| Animations | GSAP 3 (CDN) | Entrance animations |
| Background | particles.js (CDN) | Ambient particle network |
| Fonts | Clash Display + JetBrains Mono | Fontshare + Google Fonts |

---

## 🗃️ Database Schema

Four tables in `./data/talentai.db`:

```
candidates     source='builtin' — seeded from src/data/candidates.js on first boot
               source='csv'     — uploaded by user, tagged with session_id UUID
                                  Deleting a session removes all its candidates

agent_runs     One record per pipeline execution
               Columns: jd_text, jd_parsed (JSON), status, duration_ms, timestamps

shortlisted    One record per candidate per run
               Columns: rank, match_score, interest_score, combined_score,
               score_breakdown, match_reason, interest_reason, red_flags,
               key_signals, matched_skills, missing_skills, summary

conversations  One record per message
               is_live=0 → pipeline-simulated (AI invented both sides)
               is_live=1 → real Live Chat message typed by recruiter
```

---

## 🤖 AI Agent Pipeline

```
Input: Job Description (plain text)
            │
    ┌───────▼────────┐
    │   STEP 1       │  parser.service.js
    │   JD Parser    │  Gemini extracts: role, seniority, skills,
    │                │  experience, location, domain, salary
    └───────┬────────┘
            │  Structured JD object — run record created in DB
    ┌───────▼────────┐
    │   STEP 2       │  matcher.service.js
    │   Candidate    │  Reads all candidates from SQLite
    │   Discovery    │  Sends to Gemini with 100-pt scoring rubric
    │                │  Returns top 8: matchScore + breakdown + gaps
    └───────┬────────┘
            │  Top matched candidates
    ┌───────▼────────┐
    │   STEP 3       │  engagement.service.js
    │   AI Persona   │  Gemini roleplays BOTH sides of a 6-message
    │   Simulation   │  conversation per candidate, then scores
    │   ⚠️ Simulated │  predicted interest 0-100
    └───────┬────────┘
            │  Candidates + predicted interest scores
    ┌───────▼────────┐
    │   STEP 4       │  ranker.service.js
    │   Rank &       │  Combined = 0.6×Match + 0.4×Interest
    │   Shortlist    │  Sorted, tiered, summarised
    └───────┬────────┘
            │  Saved to SQLite → streamed to browser via SSE
            ▼
    Ranked Shortlist with full explainability
```

**Scoring:**
```
Match Score (0-100):
  Skills overlap      40 pts
  Experience fit      25 pts
  Domain relevance    20 pts
  Location/remote     15 pts

Interest Score (0-100)  ⚠️ AI-predicted from simulated conversation:
  Enthusiasm signals  35 pts
  Availability fit    25 pts
  Salary alignment    20 pts
  Career growth fit   20 pts

Combined Score = Match × 0.6 + Interest × 0.4
```

---

## 🚀 Running Locally

### Requirements

- **Node.js 18+** — `node --version`
- **npm** — bundled with Node
- **Gemini API Key** (free) — https://aistudio.google.com

### Steps

```bash
# 1. Enter the project folder
cd talentai

# 2. Install dependencies (no build tools needed)
npm install

# 3. Create environment file
cp .env.example .env
# Leave GEMINI_API_KEY blank — users paste it in the UI

# 4. Start development server
npm run dev

# 5. Open http://localhost:3000
```

**First boot output:**
```
[DB] Created → ./data/talentai.db
[Seed] Inserted 30 built-in candidates into SQLite
🎯 TalentAI Server started
   → Local:  http://localhost:3000
```

**Subsequent boots:**
```
[DB] Loaded → ./data/talentai.db
[Seed] 30 built-in candidates already in DB — skipping
```

---

## 📄 CSV Upload Format

```csv
name,role,company,experience,location,remote,skills,salary,available,bio
"Ravi Shankar","Senior Backend Engineer","Meesho",6,"Bangalore",true,"Python,FastAPI,AWS",38,"Immediately","Orders at scale"
```

| Column | Required | Type |
|--------|----------|------|
| name | ✅ | text |
| role | ✅ | text |
| company | ✅ | text |
| experience | ✅ | number (years) |
| location | ✅ | text |
| remote | ✅ | `true` / `false` |
| skills | ✅ | comma-separated in quotes |
| salary | — | number (lakhs) |
| available | — | `Immediately` / `30 days` / etc. |
| bio | — | one-line summary |

Ready-to-use sample: `samples/sample-candidates.csv`

---

## 🔍 Results Controls

After the agent completes, three controls appear above the shortlist:

| Control | Function |
|---------|---------|
| Search bar | Filter by name, role, company, or skill — real time |
| Sort dropdown | Combined Score / Match / Interest / Experience / Name A–Z |
| ⬇ Export CSV | Download full shortlist with all scores, reasons, and skill gaps |

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server + DB stats |
| POST | `/api/agent/run` | Full pipeline (SSE stream) |
| POST | `/api/agent/parse` | JD parse only |
| POST | `/api/agent/engage` | One live chat turn |
| POST | `/api/agent/upload-csv` | Parse CSV → DB → sessionId |
| DELETE | `/api/agent/session/:id` | Delete CSV session |
| GET | `/api/agent/runs` | Recent run history |
| GET | `/api/agent/runs/:id` | Full result for one run |
| GET | `/api/candidates` | All built-in candidates |
| GET | `/api/candidates/summary` | Pool statistics |
| GET | `/api/candidates/samples` | Sample JD list |

---

## ☁️ Deploy Free on Vercel

```bash
npm install -g vercel

git init && git add . && git commit -m "TalentAI v2"
git remote add origin https://github.com/YOUR_USERNAME/talentai.git
git push -u origin main

vercel
# Set NODE_ENV=production in Vercel dashboard
```

> Vercel serverless functions are stateless — SQLite resets on each deploy. For persistent storage use [Turso](https://turso.tech) (free cloud SQLite) or deploy on [Railway](https://railway.app) (persistent filesystem).

---

## 👤 Author

**Siddhesh Bhosale**
Catalyst Hackathon 2025 · [hackathon@deccan.ai](mailto:hackathon@deccan.ai)