# Resumer — ATS Resume Builder

An AI-informed, **dependency-free web app** that turns raw candidate inputs into a modern,
recruiter-approved, metric-driven resume optimized for Applicant Tracking Systems (ATS).

Everything runs in the browser — **no candidate data ever leaves the page**.

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

## Run it

No build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Click **Load sample** to see a full end-to-end example.

## Test the engine

```bash
node test/engine.test.js
```

## Project structure

```
index.html          # UI
css/styles.css      # styles (light/dark aware, print-friendly)
js/engine.js        # pure ATS engine (scoring, keywords, generation, audit)
js/app.js           # UI controller (form ↔ engine, copy/download, localStorage)
test/engine.test.js # lightweight assertions for the engine
```

## Roadmap

- Optional LLM backend for richer summary/bullet rewriting.
- PDF/DOCX export.
- Multiple experience entries and templates.
