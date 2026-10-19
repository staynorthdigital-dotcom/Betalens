// Prompts shared by the browser (demo mode) and the server (live mode).
// Keep this file free of browser- or Node-only APIs.

export const GRADES = ['VB','V0','V1','V2','V3','V4','V5','V6','V7','V8','V9','V10'];

export const STYLES = ['Crimps','Slab','Overhang','Dynos','Slopers','Pinches','Heel hooks','Mantles'];

export const GOALS = {
  harder: 'Send harder grades',
  technique: 'Improve technique',
  fun: 'Have fun and keep fit',
  comp: 'Train for comps'
};

function climberLine(p = {}) {
  const parts = [];
  if (p.height) parts.push(`height ${p.height}`);
  if (p.strengths?.length) parts.push(`strong at ${p.strengths.join(', ')}`);
  if (p.weaknesses?.length) parts.push(`finds ${p.weaknesses.join(', ')} hard`);
  if (p.goal && GOALS[p.goal]) parts.push(`main goal: ${GOALS[p.goal].toLowerCase()}`);
  return parts.length ? parts.join('; ') : 'no extra details';
}

/**
 * ctx: { colourName, grade, note, holdList, nImg, feetOnRoute }
 * profile: { height, strengths, weaknesses, goal }
 */
export function betaPrompt(ctx, profile = {}) {
  const col = String(ctx.colourName || 'route').toLowerCase();
  const grade = ctx.grade || 'V3';
  const imgs = ctx.nImg >= 2
    ? `Image 1 is the climber's photo of the wall. Image 2 is the same photo with only the ${col} holds kept in colour, everything else greyed out, and each ${col} hold ringed and numbered (1 = lowest on the wall).`
    : ctx.nImg === 1
      ? `The image is the climber's photo with only the ${col} holds kept in colour, everything else greyed out, and each ${col} hold ringed and numbered (1 = lowest).`
      : `No image is available; work from the hold positions below.`;
  const feet = ctx.feetOnRoute
    ? `Feet must also stay on the numbered ${col} holds (no other holds or footholds), though smearing on the bare wall is allowed.`
    : `Feet may use any hold or the wall, but say so in the cue when a foot is off-route.`;
  return `You are an experienced, encouraging bouldering coach reading a problem from a photo. ${imgs}
The problem is the ${col} holds only. Hands must use the numbered ${col} holds. ${feet}
Climber: currently climbing around ${grade}; ${climberLine(profile)}.
What they are struggling with: ${String(ctx.note || '').slice(0, 500) || 'nothing specific; give the cleanest sequence for their level.'}
Numbered holds (x, y are fractions of width and height from the top-left; size is relative):
${String(ctx.holdList || '').slice(0, 4000)}

Give beta suited to a ${grade} climber with the profile above: for lower grades favour static, balanced moves; for higher grades you may use flags, drop-knees, heel hooks or dynamic moves when they help. Play to their strengths and give extra help on the styles they find hard.
Reply with only JSON in this shape:
{"read":"one sentence on the problem's character and how hard it looks","moves":[{"hold":3,"limb":"LH","cue":"under 14 words"}],"cruxes":[{"hold":7,"fix":"under 25 words"}],"if_struggling":["under 25 words"],"grade_note":"under 30 words on making it easier or harder relative to ${grade}"}
limb is one of LH, RH, LF, RF, BH (both hands match). Start with the start holds (hands and feet), finish by matching the top hold. At most 16 moves, at most 2 cruxes, at most 3 struggling tips. Skip any numbered hold that is clearly not part of the problem. If the photo is not a climbing wall, return "moves": [] and say so in "read".`;
}

/** ctx: { colourName, grade, question, beta, hasImage } */
export function askPrompt(ctx, profile = {}) {
  if (ctx.general) {
    return `You are an encouraging, practical bouldering coach. The climber is currently climbing around ${ctx.grade}; ${climberLine(profile)}.
Their question: ${String(ctx.question || '').slice(0, 600)}
Answer in under 150 words of plain text (no markdown headings). Give concrete, safe advice they can try at their next session. If the question is about pain or injury, suggest they rest and see a physio or doctor rather than diagnosing.`;
  }
  const col = String(ctx.colourName || 'route').toLowerCase();
  const b = ctx.beta || {};
  return `You are an encouraging bouldering coach. The climber (around ${ctx.grade}; ${climberLine(profile)}) is on a ${col} problem. ${ctx.hasImage ? `The image shows the ${col} holds numbered, with your earlier sequence drawn on it (coloured line = hands, dashed = feet).` : ''}
Your earlier beta: ${JSON.stringify({ moves: b.moves || [], cruxes: b.cruxes || [] }).slice(0, 4000)}
Their question: ${String(ctx.question || '').slice(0, 600)}
Answer in under 120 words of plain text (no markdown). Be concrete about body position, hips, feet and which numbered hold. If the earlier beta was likely wrong for them, say what to change.`;
}

/** Make whatever the model returned safe to render. */
export function cleanBeta(r, holdCount, grade) {
  const okHold = n => Number.isInteger(n) && n >= 1 && n <= holdCount;
  const LIMBS = new Set(['LH','RH','LF','RF','BH']);
  const moves = (Array.isArray(r?.moves) ? r.moves : []).map(m => ({
    hold: Math.round(Number(m?.hold)),
    limb: LIMBS.has(String(m?.limb).toUpperCase()) ? String(m.limb).toUpperCase() : 'RH',
    cue: String(m?.cue || '').slice(0, 160)
  })).filter(m => okHold(m.hold)).slice(0, 18);
  const cruxes = (Array.isArray(r?.cruxes) ? r.cruxes : []).map(c => ({
    hold: Math.round(Number(c?.hold)), fix: String(c?.fix || '').slice(0, 240)
  })).filter(c => okHold(c.hold) && c.fix).slice(0, 3);
  return {
    read: String(r?.read || '').slice(0, 400),
    moves, cruxes,
    if_struggling: (Array.isArray(r?.if_struggling) ? r.if_struggling : []).map(s => String(s).slice(0, 240)).slice(0, 4),
    grade_note: String(r?.grade_note || '').slice(0, 300),
    grade
  };
}

/** Pull one JSON value out of a model reply. */
export function parseJsonReply(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
