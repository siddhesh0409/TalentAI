/**
 * render.js — DOM Rendering Engine
 */

const Render = (() => {

  function sc(s)    { return s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low'; }
  function bc(s)    { return s >= 75 ? 'bar-high'   : s >= 50 ? 'bar-mid'   : 'bar-low'; }
  function rank(i)  { return ['🥇','🥈','🥉'][i] || `#${i+1}`; }

  // ── Parsed JD display ────────────────────────────────────────────────────
  function parsedJD(jd) {
    const body  = document.getElementById('parsedBody');
    const panel = document.getElementById('parsedPanel');
    if (!body || !panel) return;

    body.innerHTML = `
      <div class="jdp-grid">
        <div class="jdp-field"><div class="jdp-lbl">Role</div><div class="jdp-val">${jd.role || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Experience</div><div class="jdp-val">${jd.experience || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Location</div><div class="jdp-val">${jd.location || '—'}</div></div>
        <div class="jdp-field"><div class="jdp-lbl">Salary</div><div class="jdp-val">${jd.salary || 'Competitive'}</div></div>
      </div>
      <div style="margin-bottom:12px;">
        <div class="flabel" style="margin-bottom:8px;">Required Skills</div>
        <div>${(jd.requiredSkills || []).map(s => `<span class="skill-chip sc-req">${s}</span>`).join('') || '<span style="color:var(--ink3);font-size:12px;">None specified</span>'}</div>
      </div>
      ${jd.niceToHaveSkills?.length ? `
        <div>
          <div class="flabel" style="margin-bottom:8px;">Nice to Have</div>
          <div>${jd.niceToHaveSkills.map(s => `<span class="skill-chip sc-nice">${s}</span>`).join('')}</div>
        </div>` : ''}
    `;
    panel.style.display = 'block';
    gsap.from(panel, { y: 12, opacity: 0, duration: 0.4, ease: 'power2.out' });
  }

  // ── Results meta bar ─────────────────────────────────────────────────────
  function resultsMeta(meta) {
    const title = document.getElementById('resTitle');
    const metaEl = document.getElementById('resMeta');
    if (title)  title.textContent = `Top ${meta.shortlisted} Shortlisted Candidates`;
    if (metaEl) metaEl.textContent =
      `Ranked by combined score · ${new Date(meta.rankedAt).toLocaleTimeString()} · ${meta.totalEvaluated} evaluated · ${meta.durationMs}ms`;
  }

  // ── Single candidate card ─────────────────────────────────────────────────
  function candidateCard(c, idx, jdParsed) {
    const reqSkills = jdParsed?.requiredSkills || [];
    const cLow      = c.skills.map(s => s.toLowerCase());

    const matchedSkills = c.matchedSkills?.length ? c.matchedSkills
      : reqSkills.filter(s => cLow.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)));
    const missingSkills = c.missingSkills?.length ? c.missingSkills
      : reqSkills.filter(s => !cLow.some(cs => cs.includes(s.toLowerCase()) || s.toLowerCase().includes(cs)));

    const iScore = typeof c.interestScore === 'number' ? c.interestScore : '—';
    const cScore = typeof c.combinedScore === 'number' ? c.combinedScore : '—';

    // Score breakdown bars
    const bdHTML = Object.keys(c.scoreBreakdown || {}).length ? `
      <div class="breakdown-grid" style="margin-top:12px;">
        ${Object.entries(c.scoreBreakdown).map(([k,v]) => `
          <div class="jdp-field">
            <div class="jdp-lbl">${k}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <div class="mbar-track" style="flex:1;"><div class="mbar-fill ${bc(v)}" style="width:${v}%"></div></div>
              <span class="mbar-val ${sc(v)}">${v}</span>
            </div>
          </div>`).join('')}
      </div>` : '';

    const ibdHTML = Object.keys(c.interestBreakdown || {}).length ? `
      <div class="breakdown-grid" style="margin-top:12px;">
        ${Object.entries(c.interestBreakdown).map(([k,v]) => `
          <div class="jdp-field">
            <div class="jdp-lbl">${k}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <div class="mbar-track" style="flex:1;"><div class="mbar-fill ${bc(v)}" style="width:${v}%"></div></div>
              <span class="mbar-val ${sc(v)}">${v}</span>
            </div>
          </div>`).join('')}
      </div>` : '';

    const signalsHTML = (c.keySignals || []).map((s, i) =>
      `<span class="signal-tag ${i > 1 ? 'concern' : ''}">${s}</span>`).join('');

    // Simulated conversation (from pipeline)
    const convHTML = (c.conversation || []).map(m => `
      <div class="cmsg ${m.role}">
        <div class="cspkr">${m.role === 'recruiter' ? '🧑‍💼 Recruiter' : `👤 ${c.name}`}</div>
        ${m.text}
      </div>`).join('');

    const chartFactors = ['Skills','Experience','Domain','Location','Availability'];
    const chartVals    = [
      Math.min(100, Math.round((matchedSkills.length / Math.max(reqSkills.length, 1)) * 100)),
      Math.min(100, c.exp * 10),
      c.matchScore ? Math.round(c.matchScore * 0.88) : 70,
      c.remote ? 90 : 65,
      c.available === 'Immediately' ? 100 : c.available === '30 days' ? 80 : c.available === '45 days' ? 70 : 55,
    ];

    const card = document.createElement('div');
    card.className = 'ccard';
    card.style.setProperty('--ac', c.color || '#0090ff');
    card.id = `card-${c.id}`;

    card.innerHTML = `
      <div class="cmain" onclick="App.toggleCard(${c.id})">
        <div class="cavatar" style="background:${c.color}18;color:${c.color};">${c.avatar}</div>
        <div>
          <div class="cname">${c.name} <span style="font-size:16px;">${rank(idx)}</span>
            ${c.fromCSV ? '<span class="csv-tag">CSV</span>' : ''}
          </div>
          <div class="crole">${c.role} · ${c.company}</div>
          <div class="cmeta">
            <span>📍 ${c.location}</span><span class="cmd"></span>
            <span>${c.exp}y exp</span><span class="cmd"></span>
            <span style="color:${c.available === 'Immediately' ? 'var(--lime)' : 'var(--ink3)'};">${c.available}</span>
          </div>
        </div>
        <div class="cscol">
          <div>
            <div class="ccombined ${sc(typeof cScore === 'number' ? cScore : 0)}">${cScore}</div>
            <div class="cclabel">COMBINED</div>
          </div>
          <div class="minibars">
            <div class="mbar-row">
              <span class="mbar-lbl">MATCH</span>
              <div class="mbar-track"><div class="mbar-fill ${bc(c.matchScore)}" style="width:0%" data-t="${c.matchScore}"></div></div>
              <span class="mbar-val ${sc(c.matchScore)}">${c.matchScore}</span>
            </div>
            <div class="mbar-row">
              <span class="mbar-lbl">INT</span>
              <div class="mbar-track"><div class="mbar-fill ${bc(typeof iScore === 'number' ? iScore : 0)}" style="width:0%" data-t="${typeof iScore === 'number' ? iScore : 0}"></div></div>
              <span class="mbar-val ${sc(typeof iScore === 'number' ? iScore : 0)}">${iScore}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="cdetail">
        <div class="dtabs">
          <button class="dtab active" onclick="App.switchTab(event,${c.id},'overview')">Overview</button>
          <button class="dtab" onclick="App.switchTab(event,${c.id},'skills')">Skills</button>
          <button class="dtab" onclick="App.switchTab(event,${c.id},'conversation')">Conversation</button>
          <button class="dtab" onclick="App.switchTab(event,${c.id},'analysis')">Analysis</button>
        </div>

        <!-- OVERVIEW -->
        <div class="dtab-panel active" id="tp-${c.id}-overview">
          <div class="score-trio">
            <div class="sblock smatch">
              <div class="sblock-num ${sc(c.matchScore)}">${c.matchScore}</div>
              <div class="sblock-lbl">MATCH SCORE</div>
              <div class="sblock-sub">${c.matchReason ? c.matchReason.split('.')[0] + '.' : c.bio}</div>
            </div>
            <div class="sblock sint">
              <div class="sblock-num ${sc(typeof iScore === 'number' ? iScore : 0)}">${iScore}</div>
              <div class="sblock-lbl">INTEREST SCORE</div>
              <div class="sblock-sub">${c.interestReason ? c.interestReason.split('.')[0] + '.' : 'Via conversation.'}</div>
            </div>
            <div class="sblock scomb">
              <div class="sblock-num ${sc(typeof cScore === 'number' ? cScore : 0)}">${cScore}</div>
              <div class="sblock-lbl">COMBINED</div>
              <div class="sblock-sub">0.6×${c.matchScore} + 0.4×${iScore}</div>
            </div>
          </div>
          <div class="chart-wrap"><canvas id="ch-${c.id}"></canvas></div>
          ${bdHTML}
        </div>

        <!-- SKILLS -->
        <div class="dtab-panel" id="tp-${c.id}-skills">
          <div class="skills-sec">
            <div class="skills-sec-ttl">✅ Matched Skills (${matchedSkills.length})</div>
            <div>${matchedSkills.length
              ? matchedSkills.map(s => `<span class="skill-chip sc-req">${s}</span>`).join('')
              : '<span style="color:var(--ink3);font-size:12px;">Computed via AI matching</span>'}</div>
          </div>
          ${missingSkills.length
            ? `<div class="skills-sec"><div class="skills-sec-ttl">❌ Gaps (${missingSkills.length})</div><div>${missingSkills.map(s => `<span class="skill-chip sc-miss">${s}</span>`).join('')}</div></div>`
            : '<div style="color:var(--lime);font-size:13px;padding:0 0 12px;">✅ All required skills matched!</div>'}
          <div class="skills-sec">
            <div class="skills-sec-ttl">All Skills</div>
            <div>${c.skills.map(s => `<span class="skill-chip sc-all">${s}</span>`).join('')}</div>
          </div>
        </div>

        <!-- CONVERSATION -->
        <div class="dtab-panel" id="tp-${c.id}-conversation">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-size:12px;color:var(--ink3);">Simulated outreach conversation (from pipeline)</div>
            <button class="live-chat-btn" onclick="App.openLiveChat(${c.id})">
              💬 Live Chat with ${c.name.split(' ')[0]}
            </button>
          </div>
          <div class="convo">
            ${convHTML || '<div style="color:var(--ink3);font-size:12px;padding:16px;text-align:center;">No conversation simulated yet</div>'}
          </div>
        </div>

        <!-- ANALYSIS -->
        <div class="dtab-panel" id="tp-${c.id}-analysis">
          <div class="ibox">
            <p><strong style="color:var(--neon);">Match Reasoning:</strong><br/>${c.matchReason || c.bio}</p>
            ${c.redFlags ? `<p style="margin-top:8px;"><strong style="color:var(--amber);">⚠️ Red Flags:</strong><br/>${c.redFlags}</p>` : ''}
            <p style="margin-top:8px;"><strong style="color:var(--plasma2);">Interest Reasoning:</strong><br/>${c.interestReason || 'Interest assessed via conversation.'}</p>
          </div>
          ${signalsHTML ? `<div style="margin-top:12px;"><div class="flabel" style="margin-bottom:8px;">Key Signals</div><div class="signals-wrap">${signalsHTML}</div></div>` : ''}
          ${ibdHTML}
          <div class="breakdown-grid" style="margin-top:12px;">
            <div class="jdp-field"><div class="jdp-lbl">Experience</div><div class="jdp-val">${c.exp} years</div></div>
            <div class="jdp-field"><div class="jdp-lbl">Location</div><div class="jdp-val">${c.location}${c.remote ? ' · Remote OK' : ''}</div></div>
            <div class="jdp-field"><div class="jdp-lbl">Availability</div><div class="jdp-val" style="color:${c.available === 'Immediately' ? 'var(--lime)' : 'inherit'}">${c.available}</div></div>
            <div class="jdp-field"><div class="jdp-lbl">Salary Expect.</div><div class="jdp-val">${c.salary ? `₹${c.salary}L` : 'Not specified'}</div></div>
          </div>
          ${c.summary ? `<div class="jdp-field" style="margin-top:10px;"><div class="jdp-lbl">Recruiter Summary</div><div class="jdp-val" style="font-size:12px;color:var(--ink2);margin-top:4px;">${c.summary}</div></div>` : ''}
        </div>
      </div>`;

    card._chartData = { factors: chartFactors, vals: chartVals, color: c.color || '#0090ff' };
    card._chartId   = `ch-${c.id}`;
    return card;
  }

  // ── Radar chart ──────────────────────────────────────────────────────────
  function renderChart(card) {
    const { _chartId: id, _chartData: d } = card;
    if (!id || !d) return;
    const canvas = document.getElementById(id);
    if (!canvas || canvas._done) return;
    canvas._done = true;

    new Chart(canvas, {
      type: 'radar',
      data: {
        labels:   d.factors,
        datasets: [{
          label:                'Profile',
          data:                 d.vals,
          backgroundColor:      d.color + '1a',
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
        animation: { duration: 800, easing: 'easeInOutQuart' },
        scales: {
          r: {
            min: 0, max: 100,
            grid:        { color: 'rgba(29,52,84,0.7)' },
            angleLines:  { color: 'rgba(29,52,84,0.7)' },
            pointLabels: { color: '#4a7499', font: { family: "'JetBrains Mono'", size: 10 } },
            ticks:       { display: false },
          },
        },
        plugins: {
          legend:  { display: false },
          tooltip: {
            backgroundColor: 'rgba(6,13,24,0.95)',
            borderColor:     'rgba(29,52,84,0.8)',
            borderWidth:     1,
            titleColor:      '#e8f4ff',
            bodyColor:       '#8ab4d4',
            titleFont:       { family: "'JetBrains Mono'" },
            bodyFont:        { family: "'JetBrains Mono'" },
          },
        },
      },
    });
  }

  return { parsedJD, resultsMeta, candidateCard, renderChart, sc, bc };
})();

window.Render = Render;
