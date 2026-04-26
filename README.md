# 🎯 TalentAI — AI-Powered Talent Scouting & Engagement Agent

> **Catalyst Hackathon 2025** · Built by Siddhesh Bhosale

An end-to-end AI recruitment agent that takes a Job Description, discovers matching candidates, simulates realistic outreach conversations to gauge genuine interest, and delivers a ranked shortlist scored on two dimensions: **Match Score** and **Interest Score**.

---

## 📁 Project Structure

```
talentai/
│
├── server.js                        ← Express entry point — boots DB, registers routes
├── package.json                     ← Dependencies and scripts
├── .env.example                     ← Environment variable template (copy → .env)
├── .gitignore
├── vercel.json                      ← Deployment config for Vercel
│
├── data/                            ← Auto-created at runtime (gitignored)
│   └── talentai.db                  ← SQLite database (created on first npm start)
│
├── samples/                         ← Ready-to-use demo files
│   ├── sample-candidates.csv        ← 12 realistic candidates — upload in the app
│   └── sample-jds.txt               ← 5 job descriptions — copy-paste into the app
│
├── src/                             ← All backend source code
│   │
│   ├── api/                         ← Express route handlers
│   │   ├── agent.routes.js          ← POST /api/agent/run|parse|engage|upload-csv
│   │   └── candidate.routes.js      ← GET  /api/candidates + /summary + /samples
│   │
│   ├── config/
│   │   └── rateLimit.js             ← express-rate-limit setup
│   │
│   ├── data/                        ← Static seed data (source of truth before DB)
│   │   ├── candidates.js            ← 30 built-in candidate profiles (JS array)
│   │   └── samples.js               ← 5 sample JD objects served via API
│   │
│   ├── db/                          ← Database layer
│   │   ├── database.js              ← SQLite connection, schema creation (4 tables)
│   │   ├── seed.js                  ← Seeds candidates.js into DB on first boot
│   │   └── repositories.js          ← All SQL queries: CandidateRepo, RunRepo,
│   │                                   ShortlistRepo, ConversationRepo
│   │
│   ├── services/                    ← Business logic, one file per agent step
│   │   ├── gemini.service.js        ← Gemini 2.0 Flash HTTP wrapper (retry logic)
│   │   ├── parser.service.js        ← Step 1: JD text → structured JSON
│   │   ├── matcher.service.js       ← Step 2: score candidates from DB vs JD
│   │   ├── engagement.service.js    ← Step 3: simulate conversations, score interest
│   │   └── ranker.service.js        ← Step 4: combined score, rank, summary
│   │
│   └── utils/
│       ├── validate.js              ← Request body validation and sanitisation
│       └── csvParser.js             ← Parse uploaded CSV into candidate objects
│
└── public/                          ← Frontend (served as static files by Express)
    │
    ├── index.html                   ← Single-page app shell (loads CSS + JS below)
    │
    ├── css/
    │   ├── base.css                 ← Design tokens, reset, typography, animations
    │   ├── layout.css               ← Nav, hero, workspace grid, responsive
    │   └── components.css           ← Panels, pipeline, cards, modals, chat UI
    │
    └── js/
        ├── api.js                   ← All fetch/SSE calls to backend (API client)
        ├── ui.js                    ← UI state: pipeline steps, terminal, modals
        ├── render.js                ← DOM builder: JD panel, candidate cards, charts
        └── app.js                   ← Main controller: wires everything together
```

---

## ⚙️ Tech Stack

| Layer | What | Why |
|-------|------|-----|
| Runtime | Node.js ≥ 18 | Native fetch (no extra dep), modern JS |
| Web server | Express 4 | Lightweight, flexible |
| Database | SQLite via better-sqlite3 | Zero-config, file-based, persists across restarts |
| AI | Google Gemini 2.0 Flash | Free tier, fast, great at structured JSON |
| Security | Helmet + express-rate-limit + CORS | Production-safe headers |
| Frontend | Vanilla HTML/CSS/JS | No build step — just open and run |
| Charts | Chart.js 4 (CDN) | Radar chart per candidate |
| Animations | GSAP 3 (CDN) | Entrance animations, transitions |
| Particles | particles.js (CDN) | Ambient background FX |
| Fonts | Clash Display + JetBrains Mono | Via Fontshare + Google Fonts CDN |

---

## 🗃️ Database Schema

Four tables, all stored in `./data/talentai.db` (auto-created):

```
candidates       — built-in profiles + CSV-uploaded ones (tagged by source + session_id)
agent_runs       — every pipeline execution (JD, status, duration, timestamps)
shortlisted      — ranked results per run (all scores, reasoning, skill gaps)
conversations    — messages per candidate per run (simulated + live chat)
```

---

## 🤖 AI Agent Pipeline

```
Input: Job Description Text
         │
   ┌─────▼──────┐
   │ Step 1     │  parser.service.js
   │ JD Parser  │  Gemini extracts: role, skills, experience,
   │            │  location, domain, seniority
   └─────┬──────┘
         │ Structured JD object
   ┌─────▼──────┐
   │ Step 2     │  matcher.service.js
   │ Candidate  │  Reads candidates from SQLite, sends all to
   │ Discovery  │  Gemini with 100-point rubric → top 8 with
   │            │  matchScore + scoreBreakdown + explanation
   └─────┬──────┘
         │ Top matched candidates
   ┌─────▼──────┐
   │ Step 3     │  engagement.service.js
   │ Convers-   │  Gemini simulates 6-message outreach chat per
   │ ational    │  candidate. Scores genuine interest 0-100 with
   │ Engagement │  breakdown: enthusiasm, availability, salary, growth
   └─────┬──────┘
         │ Candidates + interest scores
   ┌─────▼──────┐
   │ Step 4     │  ranker.service.js
   │ Rank &     │  Combined = 0.6×Match + 0.4×Interest
   │ Shortlist  │  Sorted, tiered (excellent/strong/moderate/weak)
   └─────┬──────┘
         │ Saved to SQLite (agent_runs + shortlisted + conversations)
         ▼
Output: Ranked Shortlist with full explainability
```

**Scoring Formula:**
```
Match Score    (0-100): skills (40pts) + experience (25pts) + domain (20pts) + location (15pts)
Interest Score (0-100): enthusiasm (35pts) + availability (25pts) + salary fit (20pts) + growth (20pts)
Combined Score         : Match × 0.6 + Interest × 0.4
```

---

## 🚀 Running Locally

### Prerequisites

- **Node.js 18 or newer** — check with `node --version`
- **npm** — comes with Node
- **Gemini API Key** (free) — get at https://aistudio.google.com

### Step 1 — Clone / Download

```bash
# If you have the zip, unzip it:
unzip talentai.zip
cd talentai

# Or clone from GitHub:
git clone https://github.com/YOUR_USERNAME/talentai.git
cd talentai
```

### Step 2 — Install Dependencies

```bash
npm install
```

This installs: `express`, `better-sqlite3`, `helmet`, `cors`, `morgan`, `dotenv`,
`express-rate-limit`, `uuid`, and `nodemon` (dev only).

### Step 3 — Create .env File

```bash
cp .env.example .env
```

The `.env` file only needs changes if you want to pre-configure the server port.
The Gemini API key can be left blank — users paste it in the UI.

```
PORT=3000
NODE_ENV=development
GEMINI_API_KEY=          # Optional: leave blank to enter in UI
```

### Step 4 — Start the Server

```bash
# Development mode (auto-restarts on file changes):
npm run dev

# Production mode:
npm start
```

**What happens on first boot:**
1. `./data/` directory is created automatically
2. `./data/talentai.db` SQLite file is created
3. 4 tables are created (candidates, agent_runs, shortlisted, conversations)
4. 30 built-in candidates are seeded into the database
5. Server starts at http://localhost:3000

You will see:
```
🎯 TalentAI Server started
   → Local:  http://localhost:3000
   → ENV:    development
   → DB:     ./data/talentai.db
   → Gemini: ○ no server key (users paste key in UI)
```

### Step 5 — Open the App

Visit **http://localhost:3000** in your browser.

### Step 6 — Run Your First Agent

1. Paste a JD into the text box (or click one of the sample role buttons)
2. Enter your Gemini API key (`AIzaSy...`) in the key field
3. Click **⚡ Launch Talent Scout Agent**
4. Watch the 4-step pipeline execute in real time via the terminal log
5. Explore the ranked shortlist — click any candidate card to see full detail

---

## 📄 Using the CSV Upload

The app supports uploading your own candidate database as a CSV file.

### CSV Format

```csv
name,role,company,experience,location,remote,skills,salary,available,bio
"Ravi Shankar","Senior Backend Engineer","Meesho",6,"Bangalore",true,"Python,FastAPI,AWS,Kafka",38,"Immediately","Built order management at Meesho"
"Aisha Kapoor","ML Engineer","Juspay",4,"Bangalore",true,"Python,PyTorch,LLMs,MLOps",42,"30 days","LLM fine-tuning at Juspay"
```

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| name | text | ✅ | Full name |
| role | text | ✅ | Current job title |
| company | text | ✅ | Current employer |
| experience | number | ✅ | Years of experience |
| location | text | ✅ | City name |
| remote | boolean | ✅ | `true` or `false` |
| skills | text | ✅ | Comma-separated, e.g. `"Python,AWS,Docker"` |
| salary | number | — | Current/expected CTC in lakhs |
| available | text | — | e.g. `Immediately`, `30 days`, `60 days` |
| bio | text | — | One-line background summary |

A sample CSV with 12 realistic candidates is included at `samples/sample-candidates.csv`.

### How to Upload

1. Click **📄 Upload Your Own Candidates (CSV)** under the Run button
2. Click the drop zone and select your CSV file
3. The candidates are parsed and saved to SQLite under a session UUID
4. The badge under the Run button shows the active source
5. Run the agent — it will use your CSV candidates instead of the built-in 30
6. Click **✕ Clear** to go back to the built-in pool

---

## 💬 Live Candidate Chat

After the agent runs, you can have a real conversation with any shortlisted candidate.

1. Click a candidate card to expand it
2. Go to the **Conversation** tab
3. Click **💬 Live Chat with [Name]**
4. Type your recruiter message and press Enter or click Send
5. Gemini roleplays as the candidate using their personality and background
6. All messages are saved to the `conversations` table in SQLite linked to the run

---

## 🕐 Run History

Every pipeline run is saved to the database. The **Run History** panel in the left column shows your last 5 runs. Click any run to reload its full shortlist and parsed JD without calling Gemini again.

---

## 🌐 API Endpoints

All endpoints are under `/api`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status + DB stats |
| POST | `/api/agent/run` | Full pipeline (SSE stream) |
| POST | `/api/agent/parse` | JD parse only |
| POST | `/api/agent/engage` | One live chat turn |
| POST | `/api/agent/upload-csv` | Parse CSV → save to DB |
| DELETE | `/api/agent/session/:id` | Remove a CSV session |
| GET | `/api/agent/runs` | Recent run history |
| GET | `/api/agent/runs/:id` | Full result for one run |
| GET | `/api/candidates` | All built-in candidates |
| GET | `/api/candidates/summary` | Pool statistics |
| GET | `/api/candidates/samples` | Sample JD list |

---

## ☁️ Deploy to Vercel (Free)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Push to GitHub first
git init && git add . && git commit -m "TalentAI v2"
git remote add origin https://github.com/YOUR_USERNAME/talentai.git
git push -u origin main

# 3. Deploy
vercel

# 4. Set environment variables in Vercel dashboard:
#    GEMINI_API_KEY = your_key (optional)
#    NODE_ENV = production
```

> **Note:** Vercel's serverless functions are ephemeral — the SQLite file won't persist between deployments. For a persistent deployed DB, use [Turso](https://turso.tech) (free SQLite-compatible cloud DB) or [Railway](https://railway.app).

---

## 🔧 Common Issues

| Issue | Fix |
|-------|-----|
| `Cannot find module 'better-sqlite3'` | Run `npm install` again |
| `bindings file not found` | Run `npm rebuild better-sqlite3` |
| `Gemini API error 400` | Check your API key starts with `AIza` |
| `Gemini API error 429` | Rate limited — wait 60 seconds and retry |
| Agent runs but no results | Check the terminal log in the UI for the exact error |
| CSV upload fails | Ensure your CSV has a header row and at least one data row |

---

## 👤 Author

**Siddhesh Bhosale**  
Catalyst Hackathon 2025 · [hackathon@deccan.ai](mailto:hackathon@deccan.ai)
