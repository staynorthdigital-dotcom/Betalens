// Data + AI layer. Two modes:
//  live: Supabase (accounts, profiles, saved climbs) + our /api server (Claude, Stripe)
//  demo: everything on this device; AI through Claude when the page runs inside Claude
import { betaPrompt, askPrompt, cleanBeta } from '../shared/prompt.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const err = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

const DEFAULT_PROFILE = {
  name: '', homeGym: '', grade: 'V3', height: '170–180 cm', strengths: [], weaknesses: [],
  goal: 'technique', feetOnRoute: true, accent: '#ff5a1f', onboarded: false,
  plan: 'free', scansUsed: 0, freeScans: 5
};

export const backend = {
  mode: 'demo', config: {}, sb: null, session: null,
  claudeSample: null, claudeUser: null, imgMax: 0,
  listeners: new Set(),

  async init() {
    try {
      const r = await fetch('/api/config', { headers: { accept: 'application/json' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const cfg = await r.json();
        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
          this.config = cfg;
          const { createClient } = await import(SUPABASE_JS);
          this.sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
          const { data } = await this.sb.auth.getSession();
          this.session = data.session;
          this.sb.auth.onAuthStateChange((_e, s) => { this.session = s; this.listeners.forEach(f => f(s)); });
          this.mode = 'live';
          this.imgMax = 2;
          return;
        }
      }
    } catch {}
    this.mode = 'demo';
    this.config = { freeScans: 5, prices: { monthly: '£3.99 a month', yearly: '£29.99 a year' } };
    if (window.claude?.use) {
      const [s, u] = await Promise.all([window.claude.use('sample').catch(() => null), window.claude.use('user').catch(() => null)]);
      this.claudeSample = s;
      if (u) { try { this.claudeUser = await u.me(); } catch {} }
      if (s) { try { const l = await s.limits(); this.imgMax = l.images?.maxCount || 0; } catch {} }
    }
  },

  get aiAvailable() { return this.mode === 'live' || !!this.claudeSample; },
  onAuth(f) { this.listeners.add(f); },

  /* ---------- accounts ---------- */
  isSignedIn() { return this.mode === 'live' ? !!this.session : !!LS.get('bl.demoUser', null); },
  email() { return this.session?.user?.email || ''; },
  async signInEmail(email) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw err('auth', error.message);
  },
  async signInGoogle() {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) throw err('auth', error.message);
  },
  demoSignIn(name) { LS.set('bl.demoUser', { name }); },
  async signOut() {
    if (this.mode === 'live') await this.sb.auth.signOut();
    else { LS.del('bl.demoUser'); }
  },

  /* ---------- profile ---------- */
  async getProfile() {
    if (this.mode === 'demo') {
      const u = LS.get('bl.demoUser', {});
      return { ...DEFAULT_PROFILE, name: u.name || this.claudeUser?.name || '', ...LS.get('bl.profile', {}), plan: 'demo', freeScans: Infinity };
    }
    const uid = this.session.user.id;
    const { data, error } = await this.sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw err('db', error.message);
    const p = data || {};
    const period = new Date().toISOString().slice(0, 7);
    return {
      ...DEFAULT_PROFILE,
      name: p.name || '', homeGym: p.home_gym || '', grade: p.grade || 'V3', height: p.height || DEFAULT_PROFILE.height,
      strengths: p.strengths || [], weaknesses: p.weaknesses || [], goal: p.goal || 'technique',
      feetOnRoute: p.feet_on_route ?? true, accent: p.accent || DEFAULT_PROFILE.accent, onboarded: !!p.onboarded,
      plan: p.plan || 'free', scansUsed: p.scans_period === period ? (p.scans_month || 0) : 0,
      freeScans: this.config.freeScans ?? 5
    };
  },
  async saveProfile(p) {
    if (this.mode === 'demo') {
      const { plan, scansUsed, freeScans, ...rest } = p;
      LS.set('bl.profile', rest);
      if (p.name) LS.set('bl.demoUser', { name: p.name });
      return;
    }
    const row = {
      name: p.name, home_gym: p.homeGym, grade: p.grade, height: p.height, strengths: p.strengths,
      weaknesses: p.weaknesses, goal: p.goal, feet_on_route: p.feetOnRoute, accent: p.accent, onboarded: p.onboarded
    };
    const { error } = await this.sb.from('profiles').update(row).eq('id', this.session.user.id);
    if (error) throw err('db', error.message);
  },

  /* ---------- saved climbs ---------- */
  async listClimbs() {
    if (this.mode === 'demo') return LS.get('bl.climbs', []);
    const { data, error } = await this.sb.from('climbs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw err('db', error.message);
    const paths = data.map(c => c.image_path).filter(Boolean);
    let urls = {};
    if (paths.length) {
      const { data: s } = await this.sb.storage.from('climbs').createSignedUrls(paths, 3600);
      (s || []).forEach(x => { if (x.signedUrl) urls[x.path] = x.signedUrl; });
    }
    return data.map(c => ({ id: c.id, createdAt: c.created_at, colour: c.colour, colourName: c.colour_name, grade: c.grade, beta: c.beta, sent: c.sent, imageUrl: urls[c.image_path] || '' }));
  },
  async addClimb({ image, colour, colourName, grade, beta }) {
    if (this.mode === 'demo') {
      const list = LS.get('bl.climbs', []);
      const item = { id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString(), colour, colourName, grade, beta, sent: false, imageUrl: await blobToDataUrl(image) };
      list.unshift(item);
      while (list.length > 12) list.pop();
      while (list.length && !LS.set('bl.climbs', list)) list.pop();
      return item;
    }
    const uid = this.session.user.id;
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const up = await this.sb.storage.from('climbs').upload(path, image, { contentType: 'image/jpeg' });
    if (up.error) throw err('db', up.error.message);
    const { data, error } = await this.sb.from('climbs').insert({ user_id: uid, colour, colour_name: colourName, grade, beta, image_path: path }).select().single();
    if (error) throw err('db', error.message);
    return { id: data.id, createdAt: data.created_at, colour, colourName, grade, beta, sent: false, imageUrl: URL.createObjectURL(image) };
  },
  async updateClimb(id, patch) {
    if (this.mode === 'demo') {
      const list = LS.get('bl.climbs', []); const c = list.find(x => x.id === id); if (c) Object.assign(c, patch); LS.set('bl.climbs', list); return;
    }
    const { error } = await this.sb.from('climbs').update({ sent: patch.sent }).eq('id', id);
    if (error) throw err('db', error.message);
  },
  async deleteClimb(id) {
    if (this.mode === 'demo') { LS.set('bl.climbs', LS.get('bl.climbs', []).filter(x => x.id !== id)); return; }
    const { data } = await this.sb.from('climbs').select('image_path').eq('id', id).maybeSingle();
    if (data?.image_path) await this.sb.storage.from('climbs').remove([data.image_path]);
    const { error } = await this.sb.from('climbs').delete().eq('id', id);
    if (error) throw err('db', error.message);
  },

  /* ---------- AI ---------- */
  async api(path, body, signal) {
    const r = await fetch('/api/' + path, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (this.session?.access_token || '') },
      body: JSON.stringify(body || {})
    });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw err(j.code || 'server', j.error || 'Something went wrong on the server.', j);
    return j;
  },

  /** images: Blob[] (original, annotated). Returns { beta, usage }. */
  async runBeta(ctx, images, profile, signal) {
    const n = Math.min(images.length, this.imgMax || 0);
    const use = n >= 2 ? images.slice(0, 2) : n === 1 ? [images[images.length - 1]] : [];
    const c = { ...ctx, nImg: use.length };
    if (this.mode === 'live') {
      const b64 = await Promise.all(use.map(blobToB64));
      return this.api('beta', { ctx: c, images: b64 }, signal);
    }
    if (!this.claudeSample) throw err('no_ai', 'AI beta needs the live app or the Claude app.');
    try {
      const r = await this.claudeSample.json(betaPrompt(c, profile), { images: use.length ? use : undefined, signal, modelTier: 'default' });
      return { beta: cleanBeta(r, ctx.holdCount, ctx.grade), usage: null };
    } catch (e) { throw err(e.code || 'ai', e.message || 'AI error'); }
  },

  async ask(ctx, image, profile, onText, signal) {
    const c = { ...ctx, hasImage: !!(image && this.imgMax) };
    if (this.mode === 'live') {
      const j = await this.api('ask', { ctx: c, image: c.hasImage ? await blobToB64(image) : null }, signal);
      onText(j.text); return j.text;
    }
    if (!this.claudeSample) throw err('no_ai', 'AI needs the live app or the Claude app.');
    try {
      const r = await this.claudeSample(askPrompt(c, profile), { images: c.hasImage ? [image] : undefined, signal, cache: false, onText: ({ text }) => onText(text) });
      return r.text;
    } catch (e) { throw err(e.code || 'ai', e.message || 'AI error', { text: e.text }); }
  },

  /* ---------- payments ---------- */
  async checkout(interval) {
    if (this.mode !== 'live') throw err('demo', 'Payments switch on once the app is live.');
    const { url } = await this.api('checkout', { interval });
    location.href = url;
  },
  async portal() {
    if (this.mode !== 'live') throw err('demo', 'Payments switch on once the app is live.');
    const { url } = await this.api('portal', {});
    location.href = url;
  }
};
