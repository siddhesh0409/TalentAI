/**
 * ui.js — UI State Manager
 * Controls pipeline steps, terminal log, nav dots, system status, modals
 */

const UI = (() => {

  // ── Pipeline steps ─────────────────────────────────────────────────────
  function setStep(n, state, detail) {
    const step   = document.getElementById(`ps${n}`);
    const tag    = document.getElementById(`pt${n}`);
    const navDot = document.getElementById(`nd${n}`);
    if (!step || !tag) return;

    step.className = 'pipe-step' +
      (state === 'running' ? ' s-active' : state === 'done' ? ' s-done' : '');

    tag.className  = 'pipe-tag ' +
      (state === 'running' ? 't-run'  :
       state === 'done'    ? 't-done' :
       state === 'error'   ? 't-err'  : 't-wait');

    tag.textContent =
      state === 'running' ? 'RUN'  :
      state === 'done'    ? 'DONE' :
      state === 'error'   ? 'ERR'  : 'WAIT';

    if (detail) {
      const pd = document.getElementById(`pd${n}`);
      if (pd) pd.textContent = detail;
    }
    if (navDot) {
      navDot.className = 'ndot' +
        (state === 'running' ? ' active' : state === 'done' ? ' done' : '');
    }
  }

  function resetPipeline() { [1,2,3,4].forEach(n => setStep(n, 'idle')); }

  // ── Terminal log ───────────────────────────────────────────────────────
  function tlog(msg, mtype) {
    const term = document.getElementById('term');
    const body = document.getElementById('termBody');
    if (!term || !body) return;
    term.classList.add('vis');
    const t   = new Date().toLocaleTimeString('en', { hour12: false });
    const div = document.createElement('div');
    div.className = 'tlog';
    div.innerHTML = `<span class="ttime">[${t}]</span><span class="tmsg ${mtype || ''}">${msg}</span>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function clearTerminal() {
    const body = document.getElementById('termBody');
    const term = document.getElementById('term');
    if (body) body.innerHTML = '';
    if (term) term.classList.remove('vis');
  }

  // ── System status ──────────────────────────────────────────────────────
  function setStatus(label, color) {
    const el  = document.getElementById('sstat');
    const dot = document.getElementById('sdot');
    if (el)  el.textContent        = label;
    if (dot) dot.style.background  = color || 'var(--lime)';
  }

  // ── Char counter ───────────────────────────────────────────────────────
  function updateCharCount() {
    const ta = document.getElementById('jdIn');
    const cc = document.getElementById('charCt');
    if (ta && cc) cc.textContent = `${ta.value.length} chars`;
  }

  // ── Panels ─────────────────────────────────────────────────────────────
  function showPanel(id) { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
  function hidePanel(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

  function showResults() {
    hidePanel('emptyState');
    const rl = document.getElementById('resList');
    if (rl) rl.style.display = 'block';
  }

  function showError(message) {
    const el = document.getElementById('emptyState');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div class="empty-state">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <div class="empty-title" style="color:var(--rose)">Agent Error</div>
        <div class="empty-sub" style="white-space:pre-wrap;">${message}</div>
        <div style="margin-top:16px;font-size:12px;color:var(--ink3);">Check your Gemini API key and try again.</div>
      </div>`;
  }

  // ── Run button ─────────────────────────────────────────────────────────
  function setRunning(isRunning) {
    const btn   = document.getElementById('runBtn');
    const inner = document.getElementById('btnInner');
    if (!btn || !inner) return;
    btn.disabled = isRunning;
    inner.innerHTML = isRunning
      ? '<div class="spin"></div> Agent Running…'
      : '⚡ Launch Talent Scout Agent';
  }

  // ── Toggle API key visibility ──────────────────────────────────────────
  function toggleKey() {
    const inp  = document.getElementById('apiKey');
    const icon = document.getElementById('eyeIcon');
    if (!inp) return;
    const isHidden = inp.type === 'password';
    inp.type = isHidden ? 'text' : 'password';
    if (icon) icon.textContent = isHidden ? '🙈' : '👁';
  }

  // ── CSV Upload modal ───────────────────────────────────────────────────
  function showCSVModal() {
    document.getElementById('csvModal').classList.add('open');
  }
  function hideCSVModal() {
    document.getElementById('csvModal').classList.remove('open');
  }

  // ── Live Chat modal ────────────────────────────────────────────────────
  function showChatModal(candidate, jdRole, apiKey, runId) {
    const modal = document.getElementById('chatModal');
    const title = document.getElementById('chatTitle');
    const msgs  = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (!modal) return;
    title.textContent = `Live Chat — ${candidate.name}`;
    msgs.innerHTML = `
      <div class="chat-bubble system">
        You're now chatting with <strong>${candidate.name}</strong> (${candidate.role} @ ${candidate.company}).
        This is a live AI-powered conversation — ${candidate.name} will respond based on their profile and personality.
      </div>`;
    input.value = '';

    let history = [];

    // Pre-warm with simulated messages if available
    if (candidate.conversation?.length) {
      candidate.conversation.forEach(m => {
        history.push(m);
        appendChatBubble(m.role, m.role === 'recruiter' ? 'You (Recruiter)' : candidate.name, m.text);
      });
    } else {
      const greeting = `Hi ${candidate.name}! I came across your profile and think you'd be a great fit for a ${jdRole} role. Do you have a moment to connect?`;
      history.push({ role: 'recruiter', text: greeting });
      appendChatBubble('recruiter', 'You (Recruiter)', greeting);
    }

    const doSend = async () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendBtn.disabled = true;
      history.push({ role: 'recruiter', text });
      appendChatBubble('recruiter', 'You (Recruiter)', text);
      appendTypingIndicator();

      try {
        const res = await Api.engageCandidate({
          runId,
          candidateId:          candidate.id,
          candidateName:        candidate.name,
          candidatePersonality: candidate.personality,
          candidateBio:         candidate.bio,
          jdRole,
          history:    history.slice(-10),
          userMessage: text,
          apiKey,
        });
        removeTypingIndicator();
        history.push({ role: 'candidate', text: res.reply });
        appendChatBubble('candidate', candidate.name, res.reply);
      } catch (err) {
        removeTypingIndicator();
        appendChatBubble('system', 'System', `Error: ${err.message}`);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    };

    sendBtn.onclick = doSend;
    input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } };
    modal.classList.add('open');
  }

  function hideChatModal() {
    const modal = document.getElementById('chatModal');
    if (modal) modal.classList.remove('open');
  }

  function appendChatBubble(role, label, text) {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.innerHTML = `<div class="chat-label">${label}</div><div class="chat-text">${text}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function appendTypingIndicator() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-bubble candidate typing-indicator';
    div.id = 'typingDot';
    div.innerHTML = '<div class="chat-label">Candidate</div><div class="chat-text"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('typingDot')?.remove();
  }

  // ── Full reset ─────────────────────────────────────────────────────────
  function reset() {
    resetPipeline();
    clearTerminal();
    setStatus('RUNNING', 'var(--neon)');
    hidePanel('parsedPanel');
    hidePanel('emptyState');
    const rl = document.getElementById('resList');
    if (rl) rl.style.display = 'none';
  }

  return {
    setStep, resetPipeline,
    tlog, clearTerminal,
    setStatus,
    updateCharCount,
    showPanel, hidePanel,
    showResults, showError,
    setRunning, toggleKey,
    showCSVModal, hideCSVModal,
    showChatModal, hideChatModal,
    reset,
  };
})();

window.UI = UI;
