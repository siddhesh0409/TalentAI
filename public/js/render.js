/**
 * render.js — DOM Rendering Engine
 *
 * Key fix: card IDs are stored as data-cid attributes and onclick uses
 * data-cid lookups — never string-interpolates IDs into onclick="" attributes
 * (which breaks for UUID strings containing hyphens).
 */

const Render = (() => {

  // ── Score helpers ─────────────────────────────────────────────────────────
  function sc(s)  { return s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low'; }
  function bc(s)  { return s >= 75 ? 'bar-high'   : s >= 50 ? 'bar-mid'   : 'bar-low';   }
  function rankLabel(i) { return ['🥇','🥈','🥉'][i] || `#${i+1}`; }

  // Store full shortlist for search/sort/download
  let _allCandidates = [];
  let _jdParsed      = null;

  // ── Parsed JD panel ───────────────────────────────────────────────────────
  function parsedJD(jd) {
    const body  = document.getElementById('parsedBody');
    const panel = document.getElementById('parsedPanel');
    if (!body || !panel) return;

    body.innerHTML = `
      <div class="jdp-grid">
        <div class="jdp-field"><div class="jdp-lbl">Role</div><div class="jdp-val">${esc(jd.role) || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Experience</div><div class="jdp-val">${esc(jd.experience) || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Location</div><div class="jdp-val">${esc(jd.location) || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Salary</div><div class="jdp-val">${esc(jd.salary) || 'Competitive'}</div></div>
      </div>
      <div style="margin-bottom:10px;">
        <div class="flabel" style="margin-bottom:8px;">Required Skills</div>
        <div>${(jd.requiredSkills||[]).map(s=>`<span class="skill-chip sc-req">${esc(s)}</span>`).join('') || '<span style="color:var(--ink3);font-size:12px;">None specified</span>'}</div>
      </div>
      ${jd.niceToHaveSkills?.length ? `<div>
        <div class="flabel" style="margin-bottom:8px;">Nice to Have</div>
        <div>${jd.niceToHaveSkills.map(s=>`<span class="skill-chip sc-nice">${esc(s)}</span>`).join('')}</div>
      </div>` : ''}`;

    panel.style.display = 'block';
    if (typeof gsap !== 'undefined') gsap.from(panel, { y:12, opacity:0, duration:0.4, ease:'power2.out' });
  }

  // ── Results header bar ─────────────────────────────────────────────────────
  function resultsMeta(meta) {
    const t = document.getElementById('resTitle');
    const m = document.getElementById('resMeta');
    if (t) t.textContent = `Top ${meta.shortlisted} Shortlisted Candidates`;
    if (m) m.textContent = `Ranked by combined score · ${meta.totalEvaluated} evaluated · ${meta.durationMs ? meta.durationMs+'ms' : ''}`;
  }

  // ── Render full shortlist (called from app.js) ────────────────────────────
  function renderShortlist(candidates, jdParsed) {
    _allCandidates = candidates;
    _jdParsed      = jdParsed;
    _renderList(candidates);
  }

  function _renderList(candidates) {
    const list = document.getElementById('clist');
    if (!list) return;
    list.innerHTML = '';

    if (!candidates.length) {
      list.innerHTML = '<div style="padding:32px;text-align:center;color:var(--ink3);font-size:14px;">No candidates match your search.</div>';
      return;
    }

    candidates.forEach((c, i) => {
      const card = _buildCard(c, i, _jdParsed);
      list.appendChild(card);

      // Animate score bars after mount
      setTimeout(() => {
        card.querySelectorAll('.mbar-fill[data-t]').forEach(f => { f.style.width = f.dataset.t + '%'; });
      }, 100 + i * 60);

      if (typeof gsap !== 'undefined') {
        gsap.from(card, { y:12, opacity:0, duration:0.35, ease:'power2.out', delay: i * 0.06 });
      }
    });
  }

  // ── Build a single candidate card ─────────────────────────────────────────
  function _buildCard(c, idx, jd) {
    const reqSkills     = jd?.requiredSkills || [];
    const cLow          = (c.skills || []).map(s => s.toLowerCase());
    const matchedSkills = c.matchedSkills?.length ? c.matchedSkills
      : reqSkills.filter(s => cLow.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)));
    const missingSkills = c.missingSkills?.length ? c.missingSkills
      : reqSkills.filter(s => !cLow.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)));

    const iScore = typeof c.interestScore === 'number' ? c.interestScore : '—';
    const cScore = typeof c.combinedScore === 'number' ? c.combinedScore : '—';
    const iNum   = typeof iScore === 'number' ? iScore : 0;
    const cNum   = typeof cScore === 'number' ? cScore : 0;

    // Score breakdown HTML
    const bdHTML = Object.keys(c.scoreBreakdown || {}).length
      ? Object.entries(c.scoreBreakdown).map(([k,v]) => `
          <div class="bd-row">
            <span class="bd-key">${k}</span>
            <div class="mbar-track bd-bar"><div class="mbar-fill ${bc(v)}" style="width:${v}%"></div></div>
            <span class="mbar-val ${sc(v)}">${v}</span>
          </div>`).join('')
      : '';

    const convHTML = (c.conversation || []).map(m => `
      <div class="cmsg ${m.role}">
        <div class="cspkr">${m.role === 'recruiter' ? '🧑‍💼 Recruiter' : `👤 ${esc(c.name)}`}</div>
        <div class="cmsg-text">${esc(m.text || '')}</div>
      </div>`).join('');

    const signalsHTML = (c.keySignals || []).map((s, i) =>
      `<span class="signal-tag${i > 1 ? ' concern' : ''}">${esc(s)}</span>`).join('');

    // Chart data stored on element — no onclick needed for init
    const chartFactors = ['Skills','Experience','Domain','Location','Availability'];
    const chartVals    = [
      Math.min(100, Math.round((matchedSkills.length / Math.max(reqSkills.length, 1)) * 100)),
      Math.min(100, (c.exp || 0) * 10),
      c.matchScore ? Math.round(c.matchScore * 0.88) : 70,
      c.remote ? 90 : 65,
      c.available === 'Immediately' ? 100 : c.available === '30 days' ? 80 : c.available === '45 days' ? 70 : 55,
    ];

    const card = document.createElement('div');
    card.className = 'ccard';
    card.dataset.cid = String(c.id); // store ID safely as data attribute
    card.style.setProperty('--ac', c.color || '#0090ff');

    card.innerHTML = `
      <!-- CARD HEADER (click to expand) -->
      <div class="cmain">
        <div class="cavatar" style="background:${c.color}22;color:${c.color};">${esc(c.avatar || '?')}</div>
        <div class="cinfo">
          <div class="cname">
            <span class="cname-text">${esc(c.name)}</span>
            <span class="rank-badge">${rankLabel(idx)}</span>
            ${c.fromCSV ? '<span class="csv-tag">CSV</span>' : ''}
          </div>
          <div class="crole">${esc(c.role)} · <span class="ccompany">${esc(c.company)}</span></div>
          <div class="cmeta">
            <span>📍 ${esc(c.location)}</span>
            <span class="cmd"></span>
            <span>${c.exp}y exp</span>
            <span class="cmd"></span>
            <span class="avail-text" style="color:${c.available === 'Immediately' ? 'var(--lime)' : 'var(--ink2)'};">${esc(c.available)}</span>
            ${c.remote ? '<span class="remote-badge">Remote OK</span>' : ''}
          </div>
        </div>
        <div class="cscol">
          <div class="combined-wrap">
            <div class="ccombined ${sc(cNum)}">${cScore}</div>
            <div class="cclabel">COMBINED</div>
          </div>
          <div class="minibars">
            <div class="mbar-row">
              <span class="mbar-lbl">MATCH</span>
              <div class="mbar-track"><div class="mbar-fill ${bc(c.matchScore)}" style="width:0%" data-t="${c.matchScore}"></div></div>
              <span class="mbar-val ${sc(c.matchScore)}">${c.matchScore}</span>
            </div>
            <div class="mbar-row">
              <span class="mbar-lbl">INTEREST</span>
              <div class="mbar-track"><div class="mbar-fill ${bc(iNum)}" style="width:0%" data-t="${iNum}"></div></div>
              <span class="mbar-val ${sc(iNum)}">${iScore}</span>
            </div>
          </div>
          <button class="expand-btn" aria-label="Expand">▼</button>
        </div>
      </div>

      <!-- EXPANDED DETAIL -->
      <div class="cdetail">
        <!-- Tabs -->
        <div class="dtabs">
          <button class="dtab active" data-tab="overview">Overview</button>
          <button class="dtab" data-tab="skills">Skills</button>
          <button class="dtab" data-tab="conversation">Conversation</button>
          <button class="dtab" data-tab="analysis">Analysis</button>
        </div>

        <!-- OVERVIEW TAB -->
        <div class="dtab-panel active" data-panel="overview">
          <div class="score-trio">
            <div class="sblock smatch">
              <div class="sblock-num ${sc(c.matchScore)}">${c.matchScore}</div>
              <div class="sblock-lbl">MATCH</div>
              <div class="sblock-sub">${esc(c.matchReason ? c.matchReason.split('.')[0] + '.' : c.bio)}</div>
            </div>
            <div class="sblock sint">
              <div class="sblock-num ${sc(iNum)}">${iScore}</div>
              <div class="sblock-lbl">INTEREST</div>
              <div class="sblock-sub">${esc(c.interestReason ? c.interestReason.split('.')[0] + '.' : 'Via conversation simulation.')}</div>
            </div>
            <div class="sblock scomb">
              <div class="sblock-num ${sc(cNum)}">${cScore}</div>
              <div class="sblock-lbl">COMBINED</div>
              <div class="sblock-sub">0.6 × ${c.matchScore} + 0.4 × ${iScore}</div>
            </div>
          </div>
          ${bdHTML ? `<div class="bd-section"><div class="bd-title">Score Breakdown</div>${bdHTML}</div>` : ''}
          <div class="chart-wrap"><canvas data-chart-id="${esc(String(c.id))}"></canvas></div>
        </div>

        <!-- SKILLS TAB -->
        <div class="dtab-panel" data-panel="skills">
          <div class="skills-sec">
            <div class="skills-sec-ttl">✅ Matched Skills (${matchedSkills.length})</div>
            <div>${matchedSkills.length
              ? matchedSkills.map(s => `<span class="skill-chip sc-req">${esc(s)}</span>`).join('')
              : '<span class="dim-text">Assessed via AI semantic matching</span>'}</div>
          </div>
          ${missingSkills.length
            ? `<div class="skills-sec"><div class="skills-sec-ttl">❌ Gaps (${missingSkills.length})</div><div>${missingSkills.map(s=>`<span class="skill-chip sc-miss">${esc(s)}</span>`).join('')}</div></div>`
            : '<div class="all-matched">✅ All required skills matched!</div>'}
          <div class="skills-sec">
            <div class="skills-sec-ttl">All Candidate Skills</div>
            <div>${(c.skills||[]).map(s=>`<span class="skill-chip sc-all">${esc(s)}</span>`).join('')}</div>
          </div>
        </div>

        <!-- CONVERSATION TAB -->
        <div class="dtab-panel" data-panel="conversation">
          <div class="conv-header">
            <span class="dim-text">Simulated outreach conversation from pipeline</span>
            <button class="live-chat-btn" data-livechat="${esc(String(c.id))}">
              💬 Live Chat with ${esc(c.name.split(' ')[0])}
            </button>
          </div>
          <div class="convo">
            ${convHTML || '<div class="dim-text" style="padding:24px;text-align:center;">No conversation yet — run the agent first.</div>'}
          </div>
        </div>

        <!-- ANALYSIS TAB -->
        <div class="dtab-panel" data-panel="analysis">
          <div class="ibox">
            <div class="ibox-section">
              <div class="ibox-label">Match Reasoning</div>
              <div class="ibox-text">${esc(c.matchReason || c.bio)}</div>
            </div>
            ${c.redFlags ? `<div class="ibox-section warn"><div class="ibox-label">⚠️ Red Flags</div><div class="ibox-text">${esc(c.redFlags)}</div></div>` : ''}
            <div class="ibox-section">
              <div class="ibox-label">Interest Reasoning</div>
              <div class="ibox-text">${esc(c.interestReason || 'Assessed via conversation signals.')}</div>
            </div>
          </div>
          ${signalsHTML ? `<div class="signals-block"><div class="flabel" style="margin-bottom:8px;">Key Signals</div><div class="signals-wrap">${signalsHTML}</div></div>` : ''}
          <div class="fact-grid">
            <div class="fact-item"><div class="fact-lbl">Experience</div><div class="fact-val">${c.exp} years</div></div>
            <div class="fact-item"><div class="fact-lbl">Location</div><div class="fact-val">${esc(c.location)}${c.remote ? ' · Remote OK' : ''}</div></div>
            <div class="fact-item"><div class="fact-lbl">Availability</div><div class="fact-val avail-text" style="color:${c.available==='Immediately'?'var(--lime)':'var(--ink)'};">${esc(c.available)}</div></div>
            <div class="fact-item"><div class="fact-lbl">Expected CTC</div><div class="fact-val">${c.salary ? `₹${c.salary}L` : 'Not specified'}</div></div>
          </div>
          ${c.summary ? `<div class="summary-box">${esc(c.summary)}</div>` : ''}
        </div>
      </div>`;

    // Store chart data on DOM element — accessed later when tab opens
    card._chartData = { factors: chartFactors, vals: chartVals, color: c.color || '#0090ff' };

    // Attach all event listeners directly (no onclick attributes)
    _attachCardListeners(card, c);

    return card;
  }

  // ── Attach listeners to a card without any onclick="" attributes ──────────
  function _attachCardListeners(card, c) {
    // Expand/collapse on header click
    const header = card.querySelector('.cmain');
    if (header) {
      header.addEventListener('click', () => _toggleCard(card));
    }

    // Tab switching
    card.querySelectorAll('.dtab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = btn.dataset.tab;
        card.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
        card.querySelectorAll('.dtab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        card.querySelector(`.dtab-panel[data-panel="${tab}"]`)?.classList.add('active');
        if (tab === 'overview') _ensureChart(card);
      });
    });

    // Live chat button
    const chatBtn = card.querySelector('.live-chat-btn');
    if (chatBtn) {
      chatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof App !== 'undefined') App.openLiveChat(c.id);
      });
    }
  }

  function _toggleCard(card) {
    const wasOpen = card.classList.contains('expanded');
    // Close all
    document.querySelectorAll('.ccard.expanded').forEach(c => {
      c.classList.remove('expanded');
      const btn = c.querySelector('.expand-btn');
      if (btn) btn.textContent = '▼';
    });
    if (!wasOpen) {
      card.classList.add('expanded');
      const btn = card.querySelector('.expand-btn');
      if (btn) btn.textContent = '▲';
      _ensureChart(card);
      setTimeout(() => card.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
    }
  }

  // ── Chart rendering (lazy — only when Overview tab is visible) ────────────
  function _ensureChart(card) {
    const canvas = card.querySelector('canvas[data-chart-id]');
    if (!canvas || canvas._chartDone || !card._chartData) return;
    const d = card._chartData;
    canvas._chartDone = true;

    new Chart(canvas, {
      type: 'radar',
      data: {
        labels:   d.factors,
        datasets: [{
          label:                'Profile',
          data:                 d.vals,
          backgroundColor:      d.color + '22',
          borderColor:          d.color,
          borderWidth:          2,
          pointBackgroundColor: d.color,
          pointRadius:          4,
          pointHoverRadius:     6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: { duration:700, easing:'easeInOutQuart' },
        scales: {
          r: {
            min:0, max:100,
            grid:        { color:'rgba(255,255,255,0.08)' },
            angleLines:  { color:'rgba(255,255,255,0.08)' },
            pointLabels: { color:'#aac', font:{ family:"'JetBrains Mono'", size:10 } },
            ticks:       { display:false },
          },
        },
        plugins: {
          legend: { display:false },
          tooltip: {
            backgroundColor: 'rgba(10,20,40,0.95)',
            borderColor:     'rgba(255,255,255,0.1)',
            borderWidth:     1,
            titleColor:      '#e8f4ff',
            bodyColor:       '#aac',
            titleFont:       { family:"'JetBrains Mono'" },
            bodyFont:        { family:"'JetBrains Mono'" },
          },
        },
      },
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function searchCandidates(query) {
    if (!query.trim()) {
      _renderList(_allCandidates);
      return;
    }
    const q = query.toLowerCase();
    const filtered = _allCandidates.filter(c =>
      c.name.toLowerCase().includes(q)         ||
      c.role.toLowerCase().includes(q)         ||
      c.company.toLowerCase().includes(q)      ||
      (c.skills||[]).some(s => s.toLowerCase().includes(q))
    );
    _renderList(filtered);
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  function sortCandidates(by) {
    const sorted = [..._allCandidates].sort((a, b) => {
      switch (by) {
        case 'combined':  return (b.combinedScore || 0)  - (a.combinedScore || 0);
        case 'match':     return (b.matchScore    || 0)  - (a.matchScore    || 0);
        case 'interest':  return (b.interestScore || 0)  - (a.interestScore || 0);
        case 'name':      return a.name.localeCompare(b.name);
        case 'exp':       return (b.exp || 0) - (a.exp || 0);
        default:          return 0;
      }
    });
    _renderList(sorted);
  }

  // ── Download as CSV ───────────────────────────────────────────────────────
  function downloadCSV() {
    if (!_allCandidates.length) return;

    const headers = [
      'Rank','Name','Role','Company','Experience (yrs)','Location','Remote',
      'Match Score','Interest Score','Combined Score',
      'Availability','Expected CTC (L)','Skills','Match Reason','Interest Reason','Red Flags','Summary'
    ];

    const rows = _allCandidates.map((c, i) => [
      i + 1,
      c.name,
      c.role,
      c.company,
      c.exp,
      c.location,
      c.remote ? 'Yes' : 'No',
      c.matchScore    ?? '',
      c.interestScore ?? '',
      c.combinedScore ?? '',
      c.available,
      c.salary || '',
      (c.skills || []).join('; '),
      c.matchReason    ? c.matchReason.replace(/"/g, "'")    : '',
      c.interestReason ? c.interestReason.replace(/"/g, "'") : '',
      c.redFlags       ? c.redFlags.replace(/"/g, "'")       : '',
      c.summary        ? c.summary.replace(/"/g, "'")        : '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `talentai-shortlist-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Escape HTML helper ────────────────────────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // Public API
  return { parsedJD, resultsMeta, renderShortlist, downloadCSV, searchCandidates, sortCandidates };
})();

window.Render = Render;