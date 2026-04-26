/**
 * api.js — Frontend API & SSE Client
 */

const Api = (() => {
  const BASE = '/api';

  async function request(path, options = {}) {
    const res  = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.details?.join(', ') || `HTTP ${res.status}`);
    return data;
  }

  /**
   * Run full 4-step pipeline via Server-Sent Events.
   * Streams step/log/parsed/runId/result/error/done events in real time.
   */
  function runAgentSSE({ jdText, apiKey, topN = 5, csvSessionId = null }, callbacks = {}) {
    const { onStep, onLog, onParsed, onRunId, onResult, onError, onDone } = callbacks;

    fetch(`${BASE}/agent/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ jdText, apiKey, topN, csvSessionId }),
    })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError?.(data.error || `Server error ${res.status}`);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        // Keep last (possibly incomplete) chunk in buffer
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          // Each SSE event may have multiple lines; find the data: line
          for (const line of part.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr);
              switch (evt.type) {
                case 'step':   onStep?.(evt);          break;
                case 'log':    onLog?.(evt);            break;
                case 'parsed': onParsed?.(evt);         break;
                case 'runId':  onRunId?.(evt.runId);    break;
                case 'result': onResult?.(evt);         break;
                case 'error':  onError?.(evt.message);  break;
                case 'done':   onDone?.(evt);           break;
              }
            } catch (_) { /* skip malformed JSON */ }
          }
        }
      }

      // Stream ended cleanly
      onDone?.({});
    })
    .catch((err) => onError?.(err.message));
  }

  /** One live chat turn — Gemini responds as the candidate */
  function engageCandidate(payload) {
    return request('/agent/engage', {
      method: 'POST',
      body:   JSON.stringify(payload),
    });
  }

  /** Parse a CSV string → save candidates to DB → return sessionId */
  function uploadCSV(csvText) {
    return request('/agent/upload-csv', {
      method: 'POST',
      body:   JSON.stringify({ csvText }),
    });
  }

  /** Delete a CSV session's candidates from DB */
  function deleteSession(sessionId) {
    return request(`/agent/session/${sessionId}`, { method: 'DELETE' });
  }

  function getSamples()    { return request('/candidates/samples'); }
  function healthCheck()   { return request('/health'); }

  return { runAgentSSE, engageCandidate, uploadCSV, deleteSession, getSamples, healthCheck };
})();

window.Api = Api;