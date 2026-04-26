/**
 * app.js — Main Application Controller
 *
 * IMPORTANT: All button handlers are attached here in DOMContentLoaded,
 * NOT via onclick="" attributes in HTML. This avoids the "App is not defined"
 * race condition where onclick fires before the script has loaded.
 */

const App = (() => {
  let agentRunning  = false;
  let currentApiKey = '';
  let currentJdRole = '';
  let currentRunId  = null;
  let csvSessionId  = null;
  let shortlistCache = [];

  // ── Init (runs after DOM is ready) ────────────────────────────────────────
  function init() {
    _attachHandlers();
    _initAnimations();
    _initParticles();
    _loadSamples();
    _healthCheck();
    UI.updateCharCount();
  }

  // ── Wire up ALL button handlers here (no onclick in HTML) ─────────────────
  function _attachHandlers() {
    // Run button
    const runBtn = document.getElementById('runBtn');
    if (runBtn) runBtn.addEventListener('click', runAgent);

    // Eye toggle for API key
    const eyeBtn = document.getElementById('eyeBtn');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', () => {
        const inp  = document.getElementById('apiKey');
        const icon = document.getElementById('eyeIcon');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        if (icon) icon.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    }

    // CSV upload button → open modal
    const csvBtn = document.getElementById('csvUploadBtn');
    if (csvBtn) csvBtn.addEventListener('click', () => {
      document.getElementById('csvModal').classList.add('open');
    });

    // CSV modal close buttons
    document.getElementById('csvModalClose')?.addEventListener('click', _closeCSVModal);
    document.getElementById('csvModalDone')?.addEventListener('click',  _closeCSVModal);
    document.getElementById('csvModal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('csvModal')) _closeCSVModal();
    });

    // CSV drop zone → open native file picker
    document.getElementById('csvDropZone')?.addEventListener('click', () => {
      document.getElementById('csvFileInput')?.click();
    });

    // CSV file input change
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) fileInput.addEventListener('change', _handleCSVFile);

    // Chat modal close
    document.getElementById('chatModalClose')?.addEventListener('click', _closeChatModal);
    document.getElementById('chatModal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('chatModal')) _closeChatModal();
    });

    // JD textarea char count
    document.getElementById('jdIn')?.addEventListener('input', UI.updateCharCount);
  }

  function _closeCSVModal() {
    document.getElementById('csvModal').classList.remove('open');
  }
  function _closeChatModal() {
    document.getElementById('chatModal').classList.remove('open');
  }

  // ── GSAP entrance animations ───────────────────────────────────────────────
  function _initAnimations() {
    if (typeof gsap === 'undefined') return;
    try { gsap.registerPlugin(TextPlugin); } catch (_) {}
    gsap.from('.hero-kicker', { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.2 });
    gsap.from('.l1',          { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', delay: 0.4 });
    gsap.from('.l2',          { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', delay: 0.55 });
    gsap.from('.hero-sub',    { y: 20, opacity: 0, duration: 0.8, ease: 'power2.out', delay: 0.7 });
    gsap.from('.hstat',       { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.9, stagger: 0.1 });
    gsap.from('.panel',       { y: 20, opacity: 0, duration: 0.6, ease: 'power2.out', delay: 0.3, stagger: 0.08 });
  }

  // ── Particles background ───────────────────────────────────────────────────
  function _initParticles() {
    if (typeof particlesJS === 'undefined') return;
    particlesJS('particles-js', {
      particles: {
        number:      { value: 55, density: { enable: true, value_area: 900 } },
        color:       { value: ['#0090ff', '#7c3aed', '#00d4ff'] },
        shape:       { type: 'circle' },
        opacity:     { value: 0.3, random: true, anim: { enable: true, speed: 0.5, opacity_min: 0.05 } },
        size:        { value: 1.5, random: true },
        line_linked: { enable: true, distance: 130, color: '#0090ff', opacity: 0.05, width: 1 },
        move:        { enable: true, speed: 0.6, direction: 'none', random: true, out_mode: 'out' },
      },
      interactivity: {
        detect_on: 'canvas',
        events:    { onhover: { enable: true, mode: 'grab' } },
        modes:     { grab: { distance: 120, line_linked: { opacity: 0.15 } } },
      },
    });
  }

  // ── Load sample JDs from backend ───────────────────────────────────────────
  async function _loadSamples() {
    try {
      const { samples } = await Api.getSamples();
      _buildSampleChips(samples);
    } catch (_) {
      _buildFallbackChips();
    }
  }

  const CHIP_COLORS = {
    swe:    { bg: 'rgba(0,212,255,0.1)',  border: 'rgba(0,212,255,0.2)',  color: 'var(--neon)'    },
    ml:     { bg: 'rgba(0,255,136,0.08)', border: 'rgba(0,255,136,0.2)',  color: 'var(--lime)'    },
    pm:     { bg: 'rgba(255,184,0,0.08)', border: 'rgba(255,184,0,0.2)',  color: 'var(--amber)'   },
    design: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', color: 'var(--plasma2)' },
    devops: { bg: 'rgba(0,229,204,0.08)', border: 'rgba(0,229,204,0.2)',  color: 'var(--teal)'    },
  };

  const FALLBACK = {
    swe:    { tag: 'SWE', label: 'Senior Backend Engineer · Python/AWS', text: 'Senior Backend Engineer\n\nWe are hiring a Senior Backend Engineer with 5+ years of experience in Python (FastAPI or Django), PostgreSQL, Redis, Kafka, AWS, and Docker/Kubernetes. Fintech domain preferred. Bangalore hybrid. ₹30–45 LPA. Start ASAP.' },
    ml:     { tag: 'ML',  label: 'ML Engineer · LLMs & MLOps',          text: 'ML Engineer — Large Language Models\n\nLooking for an ML Engineer with 3+ years experience in PyTorch, HuggingFace Transformers, RLHF fine-tuning, and MLOps (experiment tracking, model serving, monitoring). Experience with LLMs like Llama or Mistral preferred. Remote-first. ₹40–60 LPA.' },
    pm:     { tag: 'PM',  label: 'Product Manager · B2B SaaS',          text: 'Product Manager — B2B SaaS Platform\n\nOwn the roadmap for our B2B SaaS platform used by 15,000 businesses. 5+ years PM experience, strong SQL, track record shipping products that moved metrics. Must have B2B/enterprise software background. Mumbai or Bangalore hybrid. ₹35–55 LPA.' },
    design: { tag: 'UX',  label: 'Senior UX Designer · Mobile',         text: 'Senior UX Designer — Mobile First\n\nLead UX for our complete mobile app redesign for 5M+ users. 4+ years UX design, expert Figma, strong mobile design (iOS + Android), proven user research methodology, experience owning a design system. Bangalore. ₹20–32 LPA.' },
    devops: { tag: 'OPS', label: 'DevOps / Platform Engineer · K8s',    text: 'DevOps / Platform Engineer\n\nOwn our cloud infrastructure and internal developer platform for 300+ engineers. 5+ years DevOps/Platform/SRE, Kubernetes, Terraform, AWS, GitHub Actions + ArgoCD CI/CD, Prometheus/Grafana observability. Bangalore on-site preferred. ₹28–42 LPA.' },
  };

  function _buildSampleChips(samples) {
    const grid = document.getElementById('samplesGrid');
    if (!grid || !samples?.length) return;
    grid.innerHTML = '';
    samples.forEach((s, i) => {
      const c   = CHIP_COLORS[s.id] || CHIP_COLORS.swe;
      const btn = document.createElement('button');
      btn.className = 'sample-chip';
      if (i === samples.length - 1 && samples.length % 2 !== 0) btn.style.gridColumn = 'span 2';
      btn.addEventListener('click', () => _loadJD(s.text));
      btn.innerHTML = `<span class="chip-bdg" style="background:${c.bg};border:1px solid ${c.border};color:${c.color};">${s.tag}</span><span class="chip-txt">${s.label}</span>`;
      grid.appendChild(btn);
    });
  }

  function _buildFallbackChips() {
    const grid = document.getElementById('samplesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const keys = Object.keys(FALLBACK);
    keys.forEach((key, i) => {
      const s   = FALLBACK[key];
      const c   = CHIP_COLORS[key];
      const btn = document.createElement('button');
      btn.className = 'sample-chip';
      if (i === keys.length - 1 && keys.length % 2 !== 0) btn.style.gridColumn = 'span 2';
      btn.addEventListener('click', () => _loadJD(s.text));
      btn.innerHTML = `<span class="chip-bdg" style="background:${c.bg};border:1px solid ${c.border};color:${c.color};">${s.tag}</span><span class="chip-txt">${s.label}</span>`;
      grid.appendChild(btn);
    });
  }

  function _loadJD(text) {
    const ta = document.getElementById('jdIn');
    if (!ta) return;
    ta.value = text;
    UI.updateCharCount();
    if (typeof gsap !== 'undefined') gsap.from(ta, { scale: 0.99, duration: 0.2, ease: 'power2.out' });
  }

  // ── Health check ───────────────────────────────────────────────────────────
  async function _healthCheck() {
    try {
      const h = await Api.healthCheck();
      UI.setStatus(`READY · ${h.db?.candidates || 30} candidates in DB`, 'var(--lime)');
    } catch (_) {
      UI.setStatus('READY', 'var(--lime)');
    }
  }

  // ── CSV upload ─────────────────────────────────────────────────────────────
  async function _handleCSVFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const preview = document.getElementById('csvPreview');
    if (preview) preview.innerHTML = '<div class="csv-names">Reading file…</div>';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const result = await Api.uploadCSV(ev.target.result);
        csvSessionId = result.sessionId;

        if (preview) {
          const names = result.preview.map((c) => c.name).join(', ');
          preview.innerHTML = `
            <div class="csv-success">✅ ${result.count} candidates loaded from CSV</div>
            <div class="csv-names">${names}${result.count > 5 ? ` +${result.count - 5} more` : ''}</div>`;
        }

        // Update the source badge under the run button
        const badge = document.getElementById('candidateSourceBadge');
        if (badge) {
          badge.innerHTML = `
            <span class="source-badge csv">📄 ${file.name} · ${result.count} candidates</span>
            <button id="clearCsvBtn" class="clear-csv-btn">✕ Clear</button>`;
          document.getElementById('clearCsvBtn')?.addEventListener('click', _clearCSV);
        }

      } catch (err) {
        if (preview) preview.innerHTML = `<div class="csv-error">❌ ${err.message}</div>`;
      }
    };
    reader.readAsText(file);
  }

  function _clearCSV() {
    if (csvSessionId) {
      Api.deleteSession(csvSessionId).catch(() => {});
      csvSessionId = null;
    }
    const fi = document.getElementById('csvFileInput');
    if (fi) fi.value = '';
    const preview = document.getElementById('csvPreview');
    if (preview) preview.innerHTML = '';
    const badge = document.getElementById('candidateSourceBadge');
    if (badge) badge.innerHTML = `<span class="source-badge builtin">🗄️ Built-in pool · 30 candidates</span>`;
  }

  // ── Main Agent Run ─────────────────────────────────────────────────────────
  function runAgent() {
    if (agentRunning) return;

    const jdText = document.getElementById('jdIn')?.value.trim();
    const apiKey = document.getElementById('apiKey')?.value.trim();

    if (!jdText) { alert('Please paste a job description first.'); return; }
    if (!apiKey) { alert('Please enter your Gemini API key.'); return; }
    if (jdText.length < 50) { alert('Job description is too short — please add more detail.'); return; }

    agentRunning  = true;
    currentApiKey = apiKey;
    currentRunId  = null;

    UI.reset();
    UI.setRunning(true);

    Api.runAgentSSE(
      { jdText, apiKey, topN: 5, csvSessionId },
      {
        onStep: ({ step, state, detail }) => {
          UI.setStep(step, state, detail);
        },

        onLog: ({ msg, mtype }) => {
          UI.tlog(msg, mtype);
        },

        onParsed: ({ jdParsed }) => {
          currentJdRole = jdParsed.role;
          Render.parsedJD(jdParsed);
        },

        onRunId: (runId) => {
          currentRunId = runId;
        },

        onResult: ({ shortlist, meta, jdParsed }) => {
          shortlistCache = shortlist;
          Render.resultsMeta(meta);
          UI.showResults();

          const list = document.getElementById('clist');
          if (!list) return;
          list.innerHTML = '';

          shortlist.forEach((candidate, i) => {
            const card = Render.candidateCard(candidate, i, jdParsed);
            list.appendChild(card);

            // Animate score bars after the card is in the DOM
            setTimeout(() => {
              card.querySelectorAll('.mbar-fill[data-t]').forEach((f) => {
                f.style.width = f.dataset.t + '%';
              });
            }, 200 + i * 80);

            if (typeof gsap !== 'undefined') {
              gsap.from(card, { y: 16, opacity: 0, duration: 0.4, ease: 'power2.out', delay: 0.1 + i * 0.08 });
            }
          });
        },

        onError: (message) => {
          UI.tlog(`ERROR: ${message}`, 'err');
          UI.setStatus('ERROR', 'var(--rose)');
          UI.showError(message);
          [1, 2, 3, 4].forEach((n) => {
            if (document.getElementById(`pt${n}`)?.textContent === 'RUN') {
              UI.setStep(n, 'error');
            }
          });
          agentRunning = false;
          UI.setRunning(false);
        },

        onDone: ({ durationMs }) => {
          if (durationMs) {
            UI.setStatus(`COMPLETE · ${(durationMs / 1000).toFixed(1)}s`, 'var(--lime)');
          }
          agentRunning = false;
          UI.setRunning(false);
        },
      }
    );
  }

  // ── Card expand / collapse ─────────────────────────────────────────────────
  function toggleCard(id) {
    const card    = document.getElementById(`card-${id}`);
    const wasOpen = card?.classList.contains('expanded');
    document.querySelectorAll('.ccard.expanded').forEach((c) => c.classList.remove('expanded'));
    if (!wasOpen && card) {
      card.classList.add('expanded');
      setTimeout(() => Render.renderChart(card), 50);
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    }
  }

  // ── Tab switching inside a card ────────────────────────────────────────────
  function switchTab(e, cardId, tab) {
    e.stopPropagation();
    const card = document.getElementById(`card-${cardId}`);
    if (!card) return;
    card.querySelectorAll('.dtab').forEach((b) => b.classList.remove('active'));
    card.querySelectorAll('.dtab-panel').forEach((p) => p.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(`tp-${cardId}-${tab}`)?.classList.add('active');
    if (tab === 'overview') setTimeout(() => Render.renderChart(card), 50);
  }

  // ── Live Chat ──────────────────────────────────────────────────────────────
  function openLiveChat(candidateId) {
    const candidate = shortlistCache.find(
      (c) => String(c.id) === String(candidateId)
    );
    if (!candidate) { alert('Run the agent first.'); return; }
    if (!currentApiKey) { alert('API key not found.'); return; }

    // Open chat modal via UI module
    UI.showChatModal(candidate, currentJdRole, currentApiKey, currentRunId);
  }

  // Expose only what the HTML templates need (card onclick handlers)
  return { init, runAgent, toggleCard, switchTab, openLiveChat };
})();

window.App = App;

// Boot after DOM is fully loaded
document.addEventListener('DOMContentLoaded', App.init);