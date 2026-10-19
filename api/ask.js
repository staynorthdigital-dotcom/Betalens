// POST /api/ask  { ctx, image?: base64 jpeg }  ->  { text, usage }
import { authed, readJson, send, getProfile, usageOf, bump } from './_lib/common.js';
import { complete, checkImages, FAST_MODEL, MODEL } from './_lib/claude.js';
import { askPrompt, GRADES } from '../shared/prompt.js';

export default authed(async (req, res, user) => {
  const body = await readJson(req);
  const ctx = body.ctx || {};
  if (!String(ctx.question || '').trim()) return send(res, 400, { code: 'bad_request', error: 'Ask a question first.' });
  const images = checkImages(body.image ? [body.image] : []);

  const p = await getProfile(user.id);
  const usage = usageOf(p);
  if (usage.asks >= usage.askLimit) return send(res, 402, { code: 'limit', error: "You've used this month's questions.", usage });

  const profile = { height: p.height, strengths: p.strengths || [], weaknesses: p.weaknesses || [], goal: p.goal };
  const grade = GRADES.includes(ctx.grade) ? ctx.grade : (p.grade || 'V3');
  const text = await complete({
    model: images.length ? MODEL : FAST_MODEL,
    images,
    text: askPrompt({ ...ctx, grade, hasImage: images.length > 0 }, profile),
    maxTokens: 600
  });
  usage.asks = await bump(user.id, 'ask');
  send(res, 200, { text, usage });
});
