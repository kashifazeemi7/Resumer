/* Lightweight, dependency-free tests for the Resumer engine. Run: node test/engine.test.js */
const assert = require('assert');
const engine = require('../js/engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

test('extractKeywords finds phrases and drops stop words', () => {
  const kws = engine.extractKeywords('product management and product strategy for the SaaS platform');
  assert.ok(kws.includes('product'), 'has "product"');
  assert.ok(!kws.includes('the'), 'stop word excluded');
});

test('analyzeBullets grades a strong bullet strong', () => {
  const [b] = engine.analyzeBullets('Scaled revenue by 40% across three regions');
  assert.strictEqual(b.grade, 'strong');
  assert.ok(b.metric && b.strongVerb);
});

test('analyzeBullets flags a weak responsibility bullet', () => {
  const [b] = engine.analyzeBullets('Responsible for managing the roadmap');
  assert.strictEqual(b.grade, 'weak');
  assert.ok(b.weak);
});

test('rewriteBullet strips weak opener and scaffolds a metric', () => {
  const out = engine.rewriteBullet('Responsible for managing the roadmap');
  assert.ok(!/^responsible/i.test(out), 'weak opener removed');
  assert.ok(/\[/.test(out), 'metric scaffold added');
});

test('categorizeSkills separates technical from functional', () => {
  const s = engine.categorizeSkills('Python, SQL, Stakeholder Management, Leadership');
  assert.ok(s.technical.some((t) => /python/i.test(t)));
  assert.ok(s.functional.some((t) => /leadership/i.test(t)));
});

test('runEngine returns all three modules and a bounded score', () => {
  const r = engine.runEngine({
    fullName: 'Test User', targetTitle: 'Data Analyst', level: 'Entry-Level',
    rawExperience: 'Built dashboards\nReduced report time by 30%',
    skills: 'SQL, Tableau, Communication',
    jobDescription: 'Data Analyst with SQL and Tableau to build dashboards and reports.',
  });
  assert.ok(r.diagnostic && r.resume && r.audit);
  assert.ok(r.diagnostic.score >= 0 && r.diagnostic.score <= 100);
  assert.ok(r.resume.includes('## Professional Summary'));
  assert.ok(r.resume.includes('## Core Competencies'));
  assert.ok(typeof r.diagnostic.coverage === 'number');
});

console.log(`\n${passed} passed`);
