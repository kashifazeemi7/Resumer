/*
 * Vercel serverless function — the "AI-powered" layer.
 *
 * Calls the Claude API to rewrite raw experience bullets into natural,
 * XYZ-standard achievements and to craft a professional summary. The API
 * key stays server-side (Vercel env var ANTHROPIC_API_KEY) and never
 * reaches the browser.
 *
 * Request  (POST JSON): { level, targetTitle, industry, skills, summary, bullets: string[] }
 * Response (JSON):      { summary: string, bullets: [{ original, rewritten }], model }
 *
 * If ANTHROPIC_API_KEY is unset the function returns 501 so the frontend
 * can transparently fall back to the local rule-based engine.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(501).json({ error: 'AI backend not configured (ANTHROPIC_API_KEY missing).' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const bullets = Array.isArray(body.bullets) ? body.bullets.filter((b) => b && b.trim()) : [];
  if (!bullets.length && !body.targetTitle) {
    res.status(400).json({ error: 'Provide at least a target title or some experience bullets.' });
    return;
  }

  const prompt = buildPrompt(body, bullets);

  try {
    const aiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        // Force a JSON-only reply by prefilling the assistant turn.
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{' },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      res.status(502).json({ error: 'Claude API error', detail: detail.slice(0, 500) });
      return;
    }

    const data = await aiRes.json();
    const text = '{' + (data.content && data.content[0] && data.content[0].text ? data.content[0].text : '');
    const parsed = safeParse(text);

    if (!parsed) {
      res.status(502).json({ error: 'Could not parse model output.' });
      return;
    }

    // Align rewritten bullets back to originals.
    const outBullets = bullets.map((original, i) => ({
      original,
      rewritten: (parsed.bullets && parsed.bullets[i]) || original,
    }));

    res.status(200).json({
      summary: parsed.summary || '',
      bullets: outBullets,
      model: MODEL,
    });
  } catch (err) {
    res.status(500).json({ error: 'Request failed', detail: String(err).slice(0, 300) });
  }
};

function buildPrompt(body, bullets) {
  const list = bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
  return [
    'You are an expert technical recruiter and resume writer.',
    'Rewrite the candidate\'s raw experience bullets and write a professional summary.',
    '',
    'Rules:',
    '- Every bullet must begin with a strong, modern action verb.',
    '- Apply the Google XYZ standard: "Accomplished [X], as measured by [Y], by doing [Z]".',
    '- Where the candidate gave a real metric, keep it. Where none exists, add a clearly-marked',
    '  placeholder like [X%] or [$Y] rather than inventing specific numbers.',
    '- Keep each bullet to one concise line. No first-person pronouns. No fabricated facts.',
    '- The summary is exactly 3 sentences: core experience, signature achievement, domain expertise.',
    '',
    `Candidate level: ${body.level || 'unspecified'}`,
    `Target title: ${body.targetTitle || 'unspecified'}`,
    `Target industry: ${body.industry || 'unspecified'}`,
    `Skills: ${body.skills || 'unspecified'}`,
    body.summary ? `Existing summary to refine: ${body.summary}` : '',
    '',
    'Raw bullets:',
    list || '(none provided)',
    '',
    'Respond with ONLY a JSON object of this exact shape and nothing else:',
    '{"summary": "<3 sentences>", "bullets": ["<rewritten 1>", "<rewritten 2>", ...]}',
    `The "bullets" array must have exactly ${bullets.length} item(s), in the same order.`,
  ].filter((l) => l !== '').join('\n');
}

function safeParse(text) {
  try { return JSON.parse(text); } catch (e) { /* try to recover */ }
  // Trim to the outermost balanced braces.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { /* give up */ }
  }
  return null;
}
