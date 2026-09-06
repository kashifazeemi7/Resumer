/*
 * Resumer — ATS Resume Builder Engine
 *
 * A dependency-free engine that implements the resume-building logic:
 *   1. ATS & parsing diagnostics (compatibility score, keyword match, readability).
 *   2. High-impact writing analysis (Google XYZ metric standard, action verbs).
 *   3. Structured, ATS-compliant markdown resume generation.
 *
 * Everything runs in the browser. No candidate data leaves the page.
 */

/* -------------------------------------------------------------------------- */
/* Word banks                                                                 */
/* -------------------------------------------------------------------------- */

// Modern, recruiter-approved action verbs, grouped by the kind of impact they signal.
const ACTION_VERBS = {
  leadership: ['Orchestrated', 'Spearheaded', 'Directed', 'Championed', 'Mobilized', 'Steered', 'Chaired'],
  building: ['Engineered', 'Architected', 'Built', 'Designed', 'Developed', 'Launched', 'Established', 'Rebuilt'],
  growth: ['Scaled', 'Accelerated', 'Expanded', 'Grew', 'Drove', 'Boosted', 'Amplified'],
  optimization: ['Optimized', 'Streamlined', 'Automated', 'Reduced', 'Consolidated', 'Refactored', 'Eliminated'],
  delivery: ['Delivered', 'Shipped', 'Executed', 'Implemented', 'Deployed', 'Completed'],
  analysis: ['Analyzed', 'Diagnosed', 'Quantified', 'Modeled', 'Forecasted', 'Benchmarked'],
};

const ALL_ACTION_VERBS = Object.values(ACTION_VERBS).flat();

// Weak, responsibility-driven openers that dilute impact.
const WEAK_OPENERS = [
  'responsible for', 'worked on', 'helped', 'helped with', 'assisted', 'assisted with',
  'tasked with', 'duties included', 'in charge of', 'participated in', 'involved in',
  'handled', 'managed to', 'was responsible', 'contributed to',
];

// Section headers ATS parsers reliably recognize.
const STANDARD_SECTIONS = [
  'Professional Summary',
  'Core Competencies',
  'Professional Experience',
  'Key Projects',
  'Education & Certifications',
];

// Very common English words to exclude from keyword extraction.
const STOP_WORDS = new Set(`a an the and or but of to in on at for with from by as is are was were be been being
this that these those it its we you they our your their i me my he she his her them us
will would should could can may might must shall do does did have has had not no nor so than too very
about into over under again further then once here there all any both each few more most other some such
only own same s t just don now who what which when where why how our ours you're we're they're
job role work working team teams company companies experience skill skills using use used based like
strong excellent good great ability able across within including etc via per`.split(/\s+/));

/* -------------------------------------------------------------------------- */
/* Text utilities                                                             */
/* -------------------------------------------------------------------------- */

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\- ]/g, ' ')
    .split(/\s+/)
    // strip leading/trailing punctuation (keeps "node.js" / "c++" but drops "platform.")
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter(Boolean);
}

function splitLines(text) {
  return (text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-*•‣◦⁃∙]+/, '').trim())
    .filter((l) => l.length > 0);
}

function titleCase(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function unique(arr) {
  return [...new Set(arr)];
}

/* -------------------------------------------------------------------------- */
/* Keyword extraction & matching                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extract candidate keywords from free text, ranked by frequency.
 * Keeps single words and common two-word phrases (bigrams) that look
 * meaningful (e.g. "product management", "machine learning").
 */
function extractKeywords(text, limit = 40) {
  const tokens = tokenize(text).filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  const freq = new Map();

  tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1));

  // Bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
    const phrase = `${a} ${b}`;
    freq.set(phrase, (freq.get(phrase) || 0) + 1.5); // weight phrases slightly higher
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .slice(0, limit);
}

/**
 * Compare the resume corpus (everything the candidate provided) against the
 * job description. Returns matched and missing high-value keywords.
 */
function matchKeywords(candidateCorpus, jobDescription) {
  const jdKeywords = extractKeywords(jobDescription, 30);
  const corpus = tokenize(candidateCorpus).join(' ');

  const matched = [];
  const missing = [];

  jdKeywords.forEach((kw) => {
    if (corpus.includes(kw)) matched.push(kw);
    else missing.push(kw);
  });

  const coverage = jdKeywords.length ? Math.round((matched.length / jdKeywords.length) * 100) : null;

  return { jdKeywords, matched: unique(matched), missing: unique(missing), coverage };
}

/* -------------------------------------------------------------------------- */
/* Bullet analysis (XYZ standard)                                            */
/* -------------------------------------------------------------------------- */

const METRIC_REGEX = /(\$\s?\d|\d+\s?%|\d[\d,.]*\s?(k|m|bn|b|million|billion|thousand)\b|\b\d[\d,.]*\b|\bhundreds?\b|\bthousands?\b|\bdozens?\b)/i;

function startsWithActionVerb(line) {
  const first = (line.split(/\s+/)[0] || '').replace(/[^a-zA-Z]/g, '');
  return ALL_ACTION_VERBS.some((v) => v.toLowerCase() === first.toLowerCase());
}

function startsWeak(line) {
  const lower = line.toLowerCase();
  return WEAK_OPENERS.some((w) => lower.startsWith(w));
}

function hasMetric(line) {
  return METRIC_REGEX.test(line);
}

/**
 * Score each experience bullet against the XYZ standard and suggest an upgrade.
 */
function analyzeBullets(rawExperience) {
  const lines = splitLines(rawExperience);
  return lines.map((line) => {
    const metric = hasMetric(line);
    const strongVerb = startsWithActionVerb(line);
    const weak = startsWeak(line);

    let grade;
    if (metric && strongVerb) grade = 'strong';
    else if (metric || strongVerb) grade = 'medium';
    else grade = 'weak';

    return { original: line, metric, strongVerb, weak, grade, suggestion: rewriteBullet(line) };
  });
}

/**
 * Produce an improved bullet: swap a weak opener for an action verb and
 * scaffold the XYZ pattern where a metric is missing.
 */
function rewriteBullet(line) {
  let text = line.trim();
  const lower = text.toLowerCase();

  // Strip weak opener.
  const weak = WEAK_OPENERS.find((w) => lower.startsWith(w));
  if (weak) {
    text = text.slice(weak.length).trim();
    text = text.replace(/^(the|a|an|to|for|of)\s+/i, '');
  }

  // Ensure it opens with an action verb.
  if (!startsWithActionVerb(text)) {
    const verb = suggestVerbFor(text);
    text = `${verb} ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  } else {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Scaffold a measurable outcome if none present.
  if (!hasMetric(text)) {
    text = text.replace(/[.\s]+$/, '');
    text += ', driving [X% improvement / $Y saved / Z faster] as measured by [metric]';
  }

  return text;
}

function suggestVerbFor(text) {
  const t = text.toLowerCase();
  if (/\b(lead|led|team|stakeholder|manage|mentor)\b/.test(t)) return pick(ACTION_VERBS.leadership);
  if (/\b(build|built|creat|develop|design|feature|system|platform)\b/.test(t)) return pick(ACTION_VERBS.building);
  if (/\b(grow|growth|revenue|sales|acquire|user|customer)\b/.test(t)) return pick(ACTION_VERBS.growth);
  if (/\b(reduc|cut|save|automat|efficien|optimi|streamlin)\b/.test(t)) return pick(ACTION_VERBS.optimization);
  if (/\b(analy|report|data|metric|research|forecast)\b/.test(t)) return pick(ACTION_VERBS.analysis);
  return pick(ACTION_VERBS.delivery);
}

// Deterministic "pick" so the same input yields the same suggestion.
function pick(arr, seed) {
  return arr[0];
}

/* -------------------------------------------------------------------------- */
/* ATS compatibility scoring                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Compute an ATS compatibility score (0-100) from weighted signals:
 *   - Keyword coverage vs the job description (or keyword richness if none).
 *   - Quantified achievements ratio.
 *   - Action-verb usage.
 *   - Core fields completeness.
 *   - Clean, parser-safe structure (always true for our output, but we credit inputs).
 */
function computeAtsScore(input, bulletAnalysis, keywordMatch) {
  const signals = [];

  // 1. Keyword coverage (30 pts)
  let kwScore;
  if (keywordMatch.coverage !== null) {
    kwScore = (keywordMatch.coverage / 100) * 30;
    signals.push({ label: 'Keyword match vs. job description', value: `${keywordMatch.coverage}%`, points: kwScore, max: 30 });
  } else {
    const richness = Math.min(1, extractKeywords(getCorpus(input), 40).length / 25);
    kwScore = richness * 30;
    signals.push({ label: 'Keyword richness (no JD provided)', value: `${Math.round(richness * 100)}%`, points: kwScore, max: 30 });
  }

  // 2. Quantified achievements (25 pts)
  const total = bulletAnalysis.length || 1;
  const quantified = bulletAnalysis.filter((b) => b.metric).length;
  const qRatio = quantified / total;
  const qScore = qRatio * 25;
  signals.push({ label: 'Quantified achievements', value: `${quantified}/${bulletAnalysis.length} bullets`, points: qScore, max: 25 });

  // 3. Action-verb openers (20 pts)
  const strongVerbs = bulletAnalysis.filter((b) => b.strongVerb).length;
  const vRatio = strongVerbs / total;
  const vScore = vRatio * 20;
  signals.push({ label: 'Strong action-verb openers', value: `${strongVerbs}/${bulletAnalysis.length} bullets`, points: vScore, max: 20 });

  // 4. Core field completeness (15 pts)
  const coreFields = ['fullName', 'targetTitle', 'rawExperience', 'skills'];
  const filled = coreFields.filter((f) => (input[f] || '').trim().length > 0).length;
  const cScore = (filled / coreFields.length) * 15;
  signals.push({ label: 'Core fields completeness', value: `${filled}/${coreFields.length}`, points: cScore, max: 15 });

  // 5. Structure & parser safety (10 pts) — our output is always single-column, standard-header, no tables.
  const sScore = 10;
  signals.push({ label: 'Parser-safe structure (single-column, standard headers)', value: 'Compliant', points: sScore, max: 10 });

  const score = Math.round(signals.reduce((sum, s) => sum + s.points, 0));
  return { score: Math.max(0, Math.min(100, score)), signals };
}

function getCorpus(input) {
  return [input.rawExperience, input.skills, input.targetTitle, input.summary, input.projects, input.education]
    .filter(Boolean)
    .join('\n');
}

/* -------------------------------------------------------------------------- */
/* Readability grade                                                          */
/* -------------------------------------------------------------------------- */

function readabilityGrade(bulletAnalysis) {
  const strong = bulletAnalysis.filter((b) => b.grade === 'strong').length;
  const medium = bulletAnalysis.filter((b) => b.grade === 'medium').length;
  const total = bulletAnalysis.length || 1;
  const ratio = (strong + medium * 0.5) / total;
  if (ratio >= 0.85) return { grade: 'A', note: 'Crisp, metric-led, recruiter-ready.' };
  if (ratio >= 0.7) return { grade: 'B+', note: 'Strong impact; tighten a few remaining bullets.' };
  if (ratio >= 0.5) return { grade: 'B', note: 'Solid base; add metrics to lift impact.' };
  if (ratio >= 0.3) return { grade: 'C', note: 'Responsibility-heavy; quantify outcomes.' };
  return { grade: 'D', note: 'Rewrite bullets using the XYZ standard.' };
}

/* -------------------------------------------------------------------------- */
/* Skill structuring                                                          */
/* -------------------------------------------------------------------------- */

const TECH_HINTS = /\b(python|java|javascript|typescript|c\+\+|c#|go|rust|ruby|php|sql|nosql|react|vue|angular|node|django|flask|spring|aws|azure|gcp|docker|kubernetes|terraform|git|sql|tableau|power ?bi|excel|figma|salesforce|hubspot|jira|linux|kafka|spark|hadoop|tensorflow|pytorch|graphql|rest|api|html|css|sass|mongodb|postgres|mysql|redis)\b/i;

function categorizeSkills(skillsText) {
  const items = (skillsText || '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const technical = [];
  const functional = [];

  items.forEach((item) => {
    if (TECH_HINTS.test(item)) technical.push(item);
    else functional.push(item);
  });

  return { technical: unique(technical), functional: unique(functional), all: unique(items) };
}

/* -------------------------------------------------------------------------- */
/* Resume generation (markdown)                                              */
/* -------------------------------------------------------------------------- */

function buildSummary(input, keywordMatch, ai) {
  if (ai && ai.summary && ai.summary.trim()) return ai.summary.trim();
  if (input.summary && input.summary.trim()) return input.summary.trim();

  const level = input.level || 'experienced';
  const title = input.targetTitle || 'professional';
  const industry = input.industry ? ` in ${input.industry}` : '';
  const topKeywords = (keywordMatch.matched.length ? keywordMatch.matched : keywordMatch.jdKeywords)
    .slice(0, 3)
    .map(titleCase);
  const expertise = topKeywords.length ? topKeywords.join(', ') : 'cross-functional delivery';

  return [
    `${titleCase(level)} ${title}${industry} with a track record of turning complex problems into measurable business outcomes.`,
    `Signature strength in ${expertise}, consistently delivering quantifiable gains in efficiency, revenue, and quality.`,
    `Recognized for pairing hands-on execution with strategic thinking to ship results that scale.`,
  ].join(' ');
}

function generateResume(input, analysis, ai) {
  const { bulletAnalysis, keywordMatch, skills } = analysis;
  const aiBullets = ai && Array.isArray(ai.bullets) ? ai.bullets : null;
  const lines = [];

  // Header — plain text, no icons, no columns.
  lines.push(`# ${input.fullName || 'Your Name'}`);
  const contactBits = [input.targetTitle, input.location, input.email, input.phone, input.linkedin, input.portfolio]
    .filter((b) => b && b.trim());
  if (contactBits.length) lines.push(contactBits.join(' | '));
  lines.push('');

  // Professional Summary
  lines.push('## Professional Summary');
  lines.push(buildSummary(input, keywordMatch, ai));
  lines.push('');

  // Core Competencies
  lines.push('## Core Competencies');
  if (skills.technical.length) lines.push(`**Technical:** ${skills.technical.map(titleCase).join(', ')}`);
  if (skills.functional.length) lines.push(`**Strategic & Functional:** ${skills.functional.map(titleCase).join(', ')}`);
  if (!skills.technical.length && !skills.functional.length) lines.push('_Add skills, tools, and certifications to populate this section._');
  lines.push('');

  // Professional Experience
  lines.push('## Professional Experience');
  if (input.company || input.roleTitle) {
    const roleLine = [input.roleTitle || input.targetTitle, input.company].filter(Boolean).join(', ');
    const dateLine = input.dates ? ` (${input.dates})` : '';
    lines.push(`**${roleLine}**${dateLine}`);
  } else {
    lines.push('**[Most Recent Title], [Company]** (Start – End)');
  }
  const bullets = bulletAnalysis.length ? bulletAnalysis : [];
  if (bullets.length) {
    bullets.forEach((b, i) => {
      // Prefer an AI rewrite; else upgrade weak bullets with the rule engine.
      let text;
      if (aiBullets && aiBullets[i] && aiBullets[i].rewritten) text = aiBullets[i].rewritten;
      else text = b.grade === 'weak' ? b.suggestion : capitalize(b.original);
      lines.push(`- ${text}`);
    });
  } else {
    lines.push('- Paste your work history in the form to auto-generate quantified achievement bullets.');
  }
  lines.push('');

  // Key Projects
  const projects = splitLines(input.projects);
  if (projects.length) {
    lines.push('## Key Projects');
    projects.forEach((p) => lines.push(`- ${capitalize(p)}`));
    lines.push('');
  }

  // Education & Certifications
  lines.push('## Education & Certifications');
  const edu = splitLines(input.education);
  if (edu.length) edu.forEach((e) => lines.push(`- ${e}`));
  else lines.push('- [Degree], [Institution], [Year]');

  return lines.join('\n');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

function buildAudit(bulletAnalysis, input, ai) {
  const aiBullets = ai && Array.isArray(ai.bullets) ? ai.bullets : null;
  const transformations = bulletAnalysis
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.grade !== 'strong')
    .slice(0, 5)
    .map(({ b, i }) => ({
      before: b.original,
      after: aiBullets && aiBullets[i] ? aiBullets[i].rewritten : b.suggestion,
    }));

  const recommendations = [];
  if (!input.portfolio && !input.linkedin) recommendations.push('Add a LinkedIn URL and, if relevant, a portfolio or GitHub link.');
  if (!/\b(certified|certification|certificate|aws|pmp|scrum|google|azure)\b/i.test(input.education + ' ' + input.skills)) {
    recommendations.push('List any certifications relevant to the target role (they are high-value ATS keywords).');
  }
  const quantified = bulletAnalysis.filter((b) => b.metric).length;
  if (quantified < bulletAnalysis.length) {
    recommendations.push(`Quantify ${bulletAnalysis.length - quantified} more bullet(s) with %, $, time, or scale figures.`);
  }
  if (!input.summary) recommendations.push('Review the auto-generated summary and personalize the signature achievement.');
  recommendations.push('Tailor keywords per application by pasting each job description before exporting.');

  return { transformations, recommendations };
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

function runEngine(input, ai) {
  const corpus = getCorpus(input);
  const bulletAnalysis = analyzeBullets(input.rawExperience);
  const keywordMatch = matchKeywords(corpus, input.jobDescription);
  const skills = categorizeSkills(input.skills);

  const ats = computeAtsScore(input, bulletAnalysis, keywordMatch);
  const readability = readabilityGrade(bulletAnalysis);
  const analysis = { bulletAnalysis, keywordMatch, skills };

  const resume = generateResume(input, analysis, ai);
  const audit = buildAudit(bulletAnalysis, input, ai);

  return {
    aiApplied: !!(ai && (ai.summary || (ai.bullets && ai.bullets.length))),
    diagnostic: {
      score: ats.score,
      signals: ats.signals,
      matchedKeywords: keywordMatch.matched,
      missingKeywords: keywordMatch.missing,
      coverage: keywordMatch.coverage,
      readability,
    },
    resume,
    audit,
    bulletAnalysis,
  };
}

// Expose for the browser and (optionally) for Node-based tests.
if (typeof window !== 'undefined') {
  window.ResumerEngine = { runEngine, extractKeywords, analyzeBullets, computeAtsScore, categorizeSkills };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runEngine, extractKeywords, analyzeBullets, computeAtsScore, categorizeSkills, rewriteBullet };
}
