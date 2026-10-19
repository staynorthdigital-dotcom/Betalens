// POST /api/beta  { ctx, images: [base64 jpeg, ...] }  ->  { beta, usage }
import { authed, readJson, send, getProfile, usageOf, bump } from './_lib/common.js';
import { complete, checkImages, MODEL } from './_lib/claude.js';
import { betaPrompt, cleanBeta, parseJsonReply, GRADES } from '../shared/prompt.js';

export default authed(async (req, res, user) => {
  const body = await readJson(req);
  const ctx = body.ctx || {};
  const images = checkImages(body.images);
  const holdCount = Math.max(0, Math.min(60, Number(ctx.holdCount) || 0));
  const grade = GRADES.includes(ctx.grade) ? ctx.grade : 'V3';
  if (!holdCount) return send(res, 400, { code: 'bad_request', error: 'No holds found in this photo.' });

  const p = await getProfile(user.id);
  const usage = usageOf(p);
  if (usage.used >= usage.limit) return send(res, 402, { code: 'limit', error: "You've used this month's scans.", usage });

  const profile = { height: p.height, strengths: p.strengths || [], weaknesses: p.weaknesses || [], goal: p.goal };
  const text = betaPrompt({ ...ctx, grade, nImg: images.length }, profile);
  let parsed = parseJsonReply(await complete({ model: MODEL, images, text, maxTokens: 1800 }));
  if (!parsed) parsed = parseJsonReply(await complete({ model: MODEL, images, text: text + '\n\nReturn valid JSON only.', maxTokens: 1800 }));
  if (!parsed) return send(res, 502, { code: 'invalid_json', error: 'The coach sent back something unreadable. Try again.' });

  const beta = cleanBeta(parsed, holdCount, grade);
  if (beta.moves.length) usage.used = await bump(user.id, 'scan');
  send(res, 200, { beta, usage });
});
