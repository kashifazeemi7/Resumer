# Resumer — ATS Resume Builder

A **web app** that turns raw candidate inputs into a modern, recruiter-approved,
metric-driven resume optimized for Applicant Tracking Systems (ATS).

It works in two modes:

- **AI-enhanced** — when an `ANTHROPIC_API_KEY` is configured, a Vercel serverless
  function calls the **Claude API** to rewrite bullets into natural XYZ-standard
  achievements and craft the professional summary. The key stays server-side.
- **Rule-based** — with no key configured, a deterministic in-browser engine handles
  scoring, keyword matching, and heuristic bullet rewriting. The app falls back to this
  automatically, so it always works, even opened as a local file.

The active mode is shown as a badge on the diagnostic panel.

## What it does

Given a candidate's target role, raw work history, and skills, Resumer produces the three
output modules of the resume-building engine:

1. **ATS & Match Score Diagnostic**
   - Estimated ATS compatibility score (0–100) from weighted signals.
   - Real-time keyword matching against a pasted job description (matched vs. missing).
   - Readability & impact grade.

2. **Complete Modern Resume (copy-paste ready)**
   - Clean, single-column, parser-safe markdown.
   - Standardized headers: *Professional Summary, Core Competencies, Professional Experience,
     Key Projects, Education & Certifications*.
   - No tables, text boxes, icons, or characters that break ATS parsers.

3. **Resume Optimization Audit**
   - "Before & After" bullet transformations using the **Google XYZ standard**
     — *"Accomplished [X], as measured by [Y], by doing [Z]"*.
   - Recommendations for high-value additions (certifications, portfolio links, quantification).

## Engine logic

- **ATS scoring** weights keyword coverage (30), quantified achievements (25),
  action-verb openers (20), core-field completeness (15), and parser-safe structure (10).
- **Keyword matching** extracts frequency-ranked words and phrases from the job description
  and checks them against the candidate corpus.
- **Bullet analysis** grades each line for metrics + action verbs, then rewrites weak,
  responsibility-driven statements into quantified achievements.
- **Skill structuring** separates technical skills from strategic/functional capabilities.

See [`js/engine.js`](js/engine.js) — the engine is pure and framework-free.

## Run it locally

**Rule-based only (no key), zero setup:**

```bash
python3 -m http.server 8000    # then open http://localhost:8000
```

**With the AI backend** (runs the serverless function locally):

```bash
npm i -g vercel
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
vercel dev                     # serves the site + /api/enhance
```

Click **Load sample** to see a full end-to-end example.

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this on `main`).
2. In Vercel: **Add New → Project → Import** this repo. It's detected as a static
   site with serverless functions in `api/` — no build command needed.
3. Add an environment variable **`ANTHROPIC_API_KEY`** (Project → Settings →
   Environment Variables) to enable AI mode. Without it, the app deploys fine and
   runs in rule-based mode.
4. Deploy. Or from the CLI: `vercel` (preview) / `vercel --prod`.

## Test the engine

```bash
npm test        # node test/engine.test.js
```

## Project structure

```
index.html          # UI
css/styles.css      # styles (light/dark aware, print-friendly)
js/engine.js        # pure ATS engine (scoring, keywords, generation, audit)
js/app.js           # UI controller (form ↔ engine + AI backend, copy/download)
api/enhance.js      # Vercel serverless function — calls the Claude API
vercel.json         # Vercel config
test/engine.test.js # lightweight assertions for the engine
```

## Roadmap

- PDF/DOCX export.
- Multiple experience entries and templates.
- Semantic (embedding-based) keyword matching.
