/*
 * Resumer — UI controller.
 * Wires the form to the engine, renders the three output modules, and
 * handles copy / download / sample-data actions. Persists inputs to
 * localStorage so a refresh doesn't lose work.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'resumer.input.v1';

  const FIELDS = [
    'fullName', 'email', 'phone', 'location', 'linkedin', 'portfolio',
    'level', 'targetTitle', 'industry',
    'roleTitle', 'company', 'dates',
    'rawExperience', 'skills', 'projects', 'education', 'summary', 'jobDescription',
  ];

  const $ = (id) => document.getElementById(id);

  function collectInput() {
    const input = {};
    FIELDS.forEach((f) => { input[f] = ($(f) ? $(f).value : '') || ''; });
    return input;
  }

  function saveInput(input) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch (e) { /* ignore */ }
  }

  function loadInput() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      FIELDS.forEach((f) => { if ($(f) && data[f] != null) $(f).value = data[f]; });
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  function scoreClass(score) {
    if (score >= 80) return 'good';
    if (score >= 60) return 'ok';
    return 'low';
  }

  function renderDiagnostic(d) {
    const el = $('diagnostic');
    const cls = scoreClass(d.score);

    const signalRows = d.signals.map((s) => `
      <div class="signal">
        <div class="signal-head">
          <span>${escapeHtml(s.label)}</span>
          <span class="signal-value">${escapeHtml(s.value)} · ${Math.round(s.points)}/${s.max}</span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${(s.points / s.max) * 100}%"></div></div>
      </div>`).join('');

    const matched = d.matchedKeywords.length
      ? d.matchedKeywords.map((k) => `<span class="chip chip-match">${escapeHtml(k)}</span>`).join('')
      : '<span class="muted">None detected yet.</span>';

    const missing = d.missingKeywords.length
      ? d.missingKeywords.map((k) => `<span class="chip chip-miss">${escapeHtml(k)}</span>`).join('')
      : '<span class="muted">Nothing missing — great coverage!</span>';

    el.innerHTML = `
      <div class="score-wrap">
        <div class="score-ring ${cls}"><span>${d.score}</span><small>ATS</small></div>
        <div class="score-meta">
          <p><strong>Estimated ATS Compatibility:</strong> ${d.score}% (${cls === 'good' ? 'Strong' : cls === 'ok' ? 'Moderate' : 'Needs work'})</p>
          <p><strong>Readability &amp; Impact:</strong> Grade ${d.readability.grade} — ${escapeHtml(d.readability.note)}</p>
          ${d.coverage !== null ? `<p><strong>Job-description keyword match:</strong> ${d.coverage}%</p>` : '<p class="muted">Paste a job description to enable real-time keyword matching.</p>'}
        </div>
      </div>
      <div class="signals">${signalRows}</div>
      <h4>Emphasized keywords (matched)</h4>
      <div class="chips">${matched}</div>
      <h4>Missing / high-value keywords to add</h4>
      <div class="chips">${missing}</div>
    `;
  }

  function renderResume(markdown) {
    $('resumeMarkdown').textContent = markdown;
    $('resumePreview').innerHTML = miniMarkdown(markdown);
  }

  function renderAudit(audit) {
    const el = $('audit');
    const transforms = audit.transformations.length
      ? audit.transformations.map((t) => `
        <div class="transform">
          <div class="before"><span class="tag">Before</span> ${escapeHtml(t.before)}</div>
          <div class="after"><span class="tag tag-good">After</span> ${escapeHtml(t.after)}</div>
        </div>`).join('')
      : '<p class="muted">All bullets already meet the XYZ standard. 🎯</p>';

    const recs = audit.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('');

    el.innerHTML = `
      <h4>Before &amp; After transformations</h4>
      ${transforms}
      <h4>Recommended additions</h4>
      <ul class="recs">${recs}</ul>
    `;
  }

  /* ---------------------------------------------------------------------- */
  /* Tiny markdown renderer (headings, bold, lists) — preview only          */
  /* ---------------------------------------------------------------------- */

  function miniMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

    lines.forEach((line) => {
      if (/^# /.test(line)) { closeList(); html += `<h1>${inline(line.slice(2))}</h1>`; }
      else if (/^## /.test(line)) { closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; }
      else if (/^- /.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(line.slice(2))}</li>`; }
      else if (line.trim() === '') { closeList(); }
      else { closeList(); html += `<p>${inline(line)}</p>`; }
    });
    closeList();
    return html;
  }

  function inline(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  async function build() {
    const input = collectInput();
    saveInput(input);

    const btn = $('buildBtn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Building…';

    // Try the AI backend; fall back to the local rule engine if unavailable.
    let ai = null;
    let aiError = null;
    try {
      ai = await enhanceWithAI(input);
    } catch (e) {
      aiError = e.message || 'AI backend unavailable';
    }

    const result = window.ResumerEngine.runEngine(input, ai);
    renderMode(result.aiApplied, aiError);
    renderDiagnostic(result.diagnostic);
    renderResume(result.resume);
    renderAudit(result.audit);

    btn.disabled = false;
    btn.textContent = label;
    $('output').hidden = false;
    $('output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function enhanceWithAI(input) {
    const bullets = (input.rawExperience || '')
      .split(/\r?\n/).map((l) => l.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean);

    const res = await fetch('/api/enhance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: input.level, targetTitle: input.targetTitle, industry: input.industry,
        skills: input.skills, summary: input.summary, bullets,
      }),
    });

    if (res.status === 501) return null; // backend not configured — use rule engine silently
    if (!res.ok) throw new Error(`AI backend returned ${res.status}`);
    return res.json();
  }

  function renderMode(aiApplied, aiError) {
    const el = $('modeBadge');
    if (!el) return;
    if (aiApplied) {
      el.className = 'mode-badge mode-ai';
      el.textContent = '✨ AI-enhanced (Claude)';
    } else {
      el.className = 'mode-badge mode-rule';
      el.textContent = aiError ? `Rule-based engine · ${aiError}` : 'Rule-based engine (AI backend not configured)';
    }
  }

  function copyResume() {
    const text = $('resumeMarkdown').textContent;
    navigator.clipboard.writeText(text).then(() => flash($('copyBtn'), 'Copied!'));
  }

  function downloadResume() {
    const text = $('resumeMarkdown').textContent;
    const name = (collectInput().fullName || 'resume').replace(/\s+/g, '_');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Export a selectable-text, ATS-friendly PDF via the browser's print engine.
  function downloadPdf() {
    const markdown = $('resumeMarkdown').textContent;
    if (!markdown.trim()) return;
    const name = (collectInput().fullName || 'Resume').trim();

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${escapeHtml(name)} — Resume</title>
      <style>
        @page { size: Letter; margin: 0.6in; }
        * { box-sizing: border-box; }
        body { font: 11pt/1.4 Georgia, "Times New Roman", serif; color: #000; margin: 0; }
        h1 { font-size: 20pt; margin: 0 0 2pt; }
        .contact { font-size: 9.5pt; color: #333; margin: 0 0 10pt; }
        h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .06em;
             border-bottom: 1px solid #000; padding-bottom: 2pt; margin: 14pt 0 6pt; }
        p { margin: 3pt 0; }
        ul { margin: 4pt 0; padding-left: 18pt; }
        li { margin: 2pt 0; }
        strong { font-weight: bold; }
        @media print { .noprint { display: none; } }
      </style></head><body>
      ${resumeToPrintHtml(markdown)}
      <script>window.onload=function(){window.print();};</` + `script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to export the PDF, or use "Download .md".'); return; }
    w.document.open();
    w.document.write(doc);
    w.document.close();
  }

  // Like miniMarkdown, but the top "# Name" line renders as the header block.
  function resumeToPrintHtml(md) {
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    let contactDone = false;
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

    lines.forEach((line, idx) => {
      if (/^# /.test(line)) { closeList(); html += `<h1>${inline(line.slice(2))}</h1>`; }
      else if (/^## /.test(line)) { closeList(); html += `<h2>${inline(line.slice(3))}</h2>`; }
      else if (/^- /.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(line.slice(2))}</li>`; }
      else if (line.trim() === '') { closeList(); }
      else {
        closeList();
        // The first non-heading line right after the name is the contact row.
        if (!contactDone && /<h1>/.test(html) && !/<h2>/.test(html)) { html += `<p class="contact">${inline(line)}</p>`; contactDone = true; }
        else html += `<p>${inline(line)}</p>`;
      }
    });
    closeList();
    return html;
  }

  function flash(btn, msg) {
    const original = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = original; }, 1500);
  }

  function loadSample() {
    const sample = {
      fullName: 'Jordan Rivera',
      email: 'jordan.rivera@email.com',
      phone: '(555) 012-3456',
      location: 'Austin, TX',
      linkedin: 'linkedin.com/in/jordanrivera',
      portfolio: 'github.com/jrivera',
      level: 'Mid-Career',
      targetTitle: 'Senior Product Manager',
      industry: 'SaaS',
      roleTitle: 'Product Manager',
      company: 'CloudFlow Inc.',
      dates: '2021 – Present',
      rawExperience: [
        'Responsible for the product roadmap for the analytics dashboard',
        'Worked on improving onboarding which increased activation by 22%',
        'Helped the engineering team ship features faster',
        'Led a cross-functional team of 8 to launch a new billing platform',
        'Managed customer feedback and reduced churn from 9% to 5%',
        'In charge of A/B testing experiments across the growth funnel',
      ].join('\n'),
      skills: 'Product Strategy, Roadmapping, SQL, Amplitude, Figma, A/B Testing, Jira, Stakeholder Management, Agile, User Research, Salesforce',
      projects: [
        'Rebuilt the self-serve onboarding flow, cutting time-to-value from 14 days to 3',
        'Launched usage-based pricing that grew net revenue retention to 118%',
      ].join('\n'),
      education: [
        'B.S. Business Administration, University of Texas at Austin, 2016',
        'Certified Scrum Product Owner (CSPO)',
      ].join('\n'),
      summary: '',
      jobDescription: 'We are seeking a Senior Product Manager to own our SaaS analytics platform. You will drive the product roadmap, run experiments, partner with engineering and design, and use data (SQL, Amplitude) to improve activation, retention, and revenue. Experience with stakeholder management, agile, and user research required.',
    };
    FIELDS.forEach((f) => { if ($(f) && sample[f] != null) $(f).value = sample[f]; });
    build();
  }

  function clearAll() {
    if (!confirm('Clear all fields?')) return;
    FIELDS.forEach((f) => { if ($(f)) $(f).value = ''; });
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    $('output').hidden = true;
  }

  /* ---------------------------------------------------------------------- */
  /* Init                                                                   */
  /* ---------------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    loadInput();
    $('buildBtn').addEventListener('click', build);
    $('sampleBtn').addEventListener('click', loadSample);
    $('clearBtn').addEventListener('click', clearAll);
    $('copyBtn').addEventListener('click', copyResume);
    $('downloadBtn').addEventListener('click', downloadResume);
    $('pdfBtn').addEventListener('click', downloadPdf);
  });
})();
