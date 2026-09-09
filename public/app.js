/* Greenlight — UI. Vanilla JS, no build step. Streams the crew's work from POST /api/greenlight (SSE over fetch). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const favicon = (u) => `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host(u))}`;

  const SAMPLES = [
    { title: 'Something Borrowed, Someone Blue', format: 'Feature film', budgetTier: 'Indie ($2–20M)', logline: 'A burnt-out Mumbai wedding planner discovers her biggest client is marrying the man she was once engaged to — and has 72 hours to either stop the wedding or deliver the best one of her career.' },
    { title: 'Dead Air', format: 'Limited series', budgetTier: 'Mid ($20–80M)', logline: 'When every satellite goes dark at once, a night-shift air-traffic controller in Reykjavik must land 400 blind aircraft using only 1970s radio and a stranger on the line who seems to know what happens next.' },
    { title: 'The Understudy', format: 'Documentary', budgetTier: 'Micro (under $2M)', logline: 'For twenty years a Broadway understudy never went on stage. When the star vanished mid-run in 2019, she stepped into the spotlight — and into a police investigation that is still open.' },
  ];

  const AVATARS = { comps: 'CA', market: 'AM', risk: 'RC', head: 'HD' };
  const STATUS_TEXT = { waiting: 'Waiting', thinking: 'Thinking', searching: 'Searching', done: 'Done', error: 'Error' };
  const VERDICT_COLOR = { GREENLIGHT: 'var(--accent)', DEVELOP: 'var(--amber)', PASS: 'var(--red)' };

  const form = $('#pitch-form');
  const runBtn = $('#run');
  const formError = $('#form-error');
  const crewView = $('#crew');
  const crewGrid = $('#crew-grid');
  const memoView = $('#memo');
  const cards = new Map();
  let lastMemo = null;

  // Samples
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
    const s = SAMPLES[Number(b.dataset.sample)];
    $('#logline').value = s.logline; $('#title').value = s.title; $('#format').value = s.format; $('#budgetTier').value = s.budgetTier;
    $('#logline').focus();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const brief = { logline: $('#logline').value.trim(), title: $('#title').value.trim(), format: $('#format').value, budgetTier: $('#budgetTier').value };
    if (brief.logline.length < 20) { showError('Give the crew at least a sentence to work with.'); return; }
    await run(brief);
  });

  function showError(msg) { formError.textContent = msg; formError.hidden = false; }

  function setBusy(b) { runBtn.disabled = b; $('.btn-label', runBtn).textContent = b ? 'Crew is working…' : 'Run the crew'; }

  async function run(brief) {
    setBusy(true);
    memoView.hidden = true; memoView.innerHTML = ''; lastMemo = null;
    crewGrid.innerHTML = ''; cards.clear();
    crewView.hidden = false;
    crewView.scrollIntoView({ behavior: 'smooth', block: 'start' });

    let res;
    try {
      res = await fetch('/api/greenlight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brief) });
    } catch { showError('Could not reach the server.'); setBusy(false); return; }
    if (!res.ok) {
      let msg = `Request failed (${res.status}).`;
      try { msg = (await res.json()).error || msg; } catch {}
      showError(msg); setBusy(false); crewView.hidden = true; return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            try { handle(JSON.parse(line.slice(5).trim()), brief); } catch (err) { console.warn('bad event', err); }
          }
        }
      }
    } finally { setBusy(false); }
  }

  function handle(ev, brief) {
    switch (ev.type) {
      case 'run_start': {
        for (const a of ev.agents) crewGrid.appendChild(makeCard(a));
        crewGrid.appendChild(makeCard({ id: 'head', name: 'Head of Development', role: 'Synthesizes the crew’s research into the greenlight memo' }, true));
        $('#crew-sub').textContent = `Three specialists research in parallel on ${ev.model}. Then the Head of Development writes the memo.`;
        break;
      }
      case 'agent_status': {
        const c = cards.get(ev.agent); if (!c) return;
        setStatus(c, ev.status);
        if (ev.agent === 'head' && ev.status === 'thinking') {
          const li = el('li', 'feed-item writing'); li.appendChild(el('span', 'spinner')); li.appendChild(el('span', null, 'Reading the reports and writing the memo…'));
          $('.feed', c).appendChild(li);
        }
        if (ev.status === 'done' && ev.findings) {
          const d = $('.findings', c); d.hidden = false; $('.findings-body', d).innerHTML = md(ev.findings);
          $('summary', d).textContent = `Findings · ${ev.searches} search${ev.searches === 1 ? '' : 'es'} · ${ev.sources} sources`;
        }
        break;
      }
      case 'search': {
        const c = cards.get(ev.agent); if (!c) return;
        const li = el('li', 'feed-item'); li.dataset.pending = '1';
        const tag = el('span', 'feed-tag', 'Parallel search');
        li.appendChild(tag);
        if (ev.objective) li.appendChild(el('div', 'feed-objective', ev.objective));
        const q = el('div', 'queries'); for (const s of ev.queries) q.appendChild(el('span', 'query', s)); li.appendChild(q);
        const r = el('div', 'results'); r.appendChild(el('span', 'result-count', 'Searching the live web…')); li.appendChild(r);
        $('.feed', c).appendChild(li);
        break;
      }
      case 'search_result': {
        const c = cards.get(ev.agent); if (!c) return;
        const li = $('.feed-item[data-pending="1"]', c); if (!li) return; delete li.dataset.pending;
        const r = $('.results', li); r.innerHTML = '';
        r.appendChild(el('span', 'result-count', `${ev.count} source${ev.count === 1 ? '' : 's'} found`));
        for (const x of ev.results.slice(0, 4)) {
          const row = el('div', 'result'); const img = el('img'); img.src = favicon(x.url); img.alt = ''; row.appendChild(img);
          const a = el('a', null, x.title || host(x.url)); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; a.title = x.url; row.appendChild(a);
          r.appendChild(row);
        }
        break;
      }
      case 'search_error': {
        const c = cards.get(ev.agent); if (!c) return;
        const li = $('.feed-item[data-pending="1"]', c); if (li) { delete li.dataset.pending; $('.results', li).innerHTML = `<span class="feed-error">${esc(ev.message)}</span>`; }
        break;
      }
      case 'memo': renderMemo(ev.memo, ev.meta, brief); break;
      case 'error': {
        showError(ev.message);
        for (const c of cards.values()) if ($('.status', c).dataset.status !== 'done') setStatus(c, 'error');
        break;
      }
      case 'done': break;
    }
  }

  function makeCard(a, head = false) {
    const node = $('#agent-card').content.firstElementChild.cloneNode(true);
    node.dataset.agent = a.id; if (head) node.classList.add('head');
    $('.avatar', node).textContent = AVATARS[a.id] || a.name.slice(0, 2).toUpperCase();
    $('.agent-name', node).textContent = a.name; $('.agent-role', node).textContent = a.role;
    cards.set(a.id, node); return node;
  }
  function setStatus(card, status) { const s = $('.status', card); s.dataset.status = status; $('.status-text', s).textContent = STATUS_TEXT[status] || status; }

  // Minimal markdown for the specialists' findings: bullets, bold, links, (source: url)
  function md(text) {
    const lines = esc(text).split('\n'); let out = ''; let inList = false;
    const inline = (s) => s
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\(source:\s*(https?:\/\/[^\s)]+)\)/gi, (_, u) => ` <a href="${u}" target="_blank" rel="noopener">[${esc(host(u))}]</a>`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[^"(\]>])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener">${esc(host(u))}</a>`);
    for (let l of lines) {
      const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (m) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(m[1])}</li>`; continue; }
      if (inList) { out += '</ul>'; inList = false; }
      l = l.trim(); if (!l) continue;
      if (/^#{1,6}\s/.test(l)) out += `<p><b>${inline(l.replace(/^#{1,6}\s/, ''))}</b></p>`; else out += `<p>${inline(l)}</p>`;
    }
    if (inList) out += '</ul>';
    return out;
  }

  function renderMemo(memo, meta, brief) {
    lastMemo = { memo, meta, brief };
    const color = VERDICT_COLOR[memo.verdict] || 'var(--accent)';
    const r = 58, circ = 2 * Math.PI * r, offset = circ * (1 - memo.confidence / 100);
    const comps = memo.comps.map((c) => `<tr><td class="title">${esc(c.title)}<span class="why">${esc(c.whyComparable)}</span></td><td>${esc(c.year)}</td><td>${esc(c.budget)}</td><td>${esc(c.performance)}${c.sourceUrl ? ` <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener" title="${esc(c.sourceUrl)}">↗</a>` : ''}</td></tr>`).join('');
    const risks = memo.risks.map((x) => `<li class="risk"><span class="sev ${esc(x.severity)}" title="${esc(x.severity)} risk"></span><div><b>${esc(x.risk)}</b><span>${esc(x.mitigation)}</span></div></li>`).join('');
    const strengths = memo.strengths.map((s) => `<li><span class="tick">✓</span><span>${esc(s)}</span></li>`).join('');
    const steps = memo.nextSteps.map((s, i) => `<li><span class="num">${i + 1}</span><span>${esc(s)}</span></li>`).join('');
    const sources = memo.sources.map((s) => `<div class="source"><img src="${favicon(s.url)}" alt=""><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a><small>${esc(host(s.url))}</small></div>`).join('');
    const secs = meta ? (meta.durationMs / 1000).toFixed(0) : '';

    memoView.innerHTML = `
      <div class="memo-wrap" style="--verdict:${color}">
        <div class="card verdict-card">
          <div class="ring" role="img" aria-label="Confidence ${memo.confidence}%">
            <svg width="132" height="132" viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="${r}"/><circle class="bar" cx="66" cy="66" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/></svg>
            <div class="ring-label"><b>${memo.confidence}</b><span>confidence</span></div>
          </div>
          <div class="verdict-head">
            <span class="verdict-badge">${esc(memo.verdict)}</span>
            <h2>${esc(memo.headline)}</h2>
            <p class="title">${esc(memo.title)}</p>
            <p class="logline">${esc(memo.logline)}</p>
          </div>
        </div>
        <div class="card panel"><h3>Executive summary</h3><p class="body">${esc(memo.summary)}</p></div>
        <div class="memo-grid">
          <div class="card panel"><h3>Comparable titles</h3><div class="table-scroll"><table><thead><tr><th>Title</th><th>Year</th><th>Budget</th><th>Performance</th></tr></thead><tbody>${comps}</tbody></table></div></div>
          <div class="card panel"><h3>Audience &amp; positioning</h3>
            <dl class="kv">
              <div><dt>Positioning</dt><dd>${esc(memo.audience.positioning)}</dd></div>
              <div><dt>Primary audience</dt><dd>${esc(memo.audience.primary)}</dd></div>
              <div><dt>Secondary audience</dt><dd>${esc(memo.audience.secondary)}</dd></div>
              <div><dt>Platform</dt><dd>${esc(memo.audience.platform)}</dd></div>
              <div><dt>Budget band</dt><dd>${esc(memo.budgetBand)}</dd></div>
            </dl>
          </div>
        </div>
        <div class="memo-grid">
          <div class="card panel"><h3>Risks &amp; mitigations</h3><ul class="list">${risks}</ul></div>
          <div class="card panel"><h3>Strengths</h3><ul class="list">${strengths}</ul></div>
        </div>
        <div class="memo-grid">
          <div class="card panel"><h3>Next steps</h3><ol class="list">${steps}</ol></div>
          <div class="card panel"><h3>Sources</h3><div class="sources">${sources}</div></div>
        </div>
        <div class="actions">
          <span class="meta">Memo by the Greenlight crew · ${esc(meta?.model || '')}${secs ? ` · ${secs}s` : ''} · research via Parallel Search API</span>
          <div style="display:flex;gap:10px">
            <button class="btn ghost" id="copy">Copy as Markdown</button>
            <button class="btn primary" id="again">New pitch</button>
          </div>
        </div>
      </div>`;
    memoView.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => { $('.ring .bar', memoView).style.strokeDashoffset = offset; }));
    memoView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#again').addEventListener('click', () => { memoView.hidden = true; crewView.hidden = true; $('#logline').value = ''; $('#title').value = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); $('#logline').focus(); });
    $('#copy').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(toMarkdown(memo, brief)); e.target.textContent = 'Copied'; e.target.classList.add('copied'); setTimeout(() => { e.target.textContent = 'Copy as Markdown'; e.target.classList.remove('copied'); }, 1600); } catch { e.target.textContent = 'Copy failed'; }
    });
  }

  function toMarkdown(m) {
    return [
      `# Greenlight memo — ${m.title}`, '', `**Verdict: ${m.verdict}** (confidence ${m.confidence}/100)`, '', `> ${m.headline}`, '', `**Logline.** ${m.logline}`, '', m.summary, '',
      '## Comparable titles', '', '| Title | Year | Budget | Performance | Why |', '|---|---|---|---|---|', ...m.comps.map((c) => `| ${c.title} | ${c.year} | ${c.budget} | ${c.performance} | ${c.whyComparable} |`), '',
      '## Audience & positioning', '', `- **Positioning:** ${m.audience.positioning}`, `- **Primary:** ${m.audience.primary}`, `- **Secondary:** ${m.audience.secondary}`, `- **Platform:** ${m.audience.platform}`, `- **Budget band:** ${m.budgetBand}`, '',
      '## Strengths', '', ...m.strengths.map((s) => `- ${s}`), '', '## Risks', '', ...m.risks.map((r) => `- **${r.risk}** (${r.severity}) — ${r.mitigation}`), '',
      '## Next steps', '', ...m.nextSteps.map((s, i) => `${i + 1}. ${s}`), '', '## Sources', '', ...m.sources.map((s) => `- [${s.title}](${s.url})`), '',
      '_Researched by the Greenlight crew (Gemini + Parallel Search API)._',
    ].join('\n');
  }
})();
