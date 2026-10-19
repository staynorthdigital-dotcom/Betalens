import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-5-5';

const MAX_B64 = 3_500_000; // about 2.6 MB of JPEG per image

export function checkImages(images) {
  if (!Array.isArray(images)) return [];
  if (images.length > 2) throw Object.assign(new Error('Too many images'), { status: 400 });
  return images.map(d => {
    if (typeof d !== 'string' || d.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(d)) throw Object.assign(new Error('Bad image'), { status: 400 });
    return d;
  });
}

/** One user turn: images (base64 JPEG) then text. Returns the reply text. */
export async function complete({ model = MODEL, images = [], text, maxTokens = 1500 }) {
  const content = [
    ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
    { type: 'text', text }
  ];
  const msg = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] });
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
