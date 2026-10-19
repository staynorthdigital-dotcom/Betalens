// Beta Lens wall engine: loads a photo, finds holds of one colour,
// greys out everything else and draws numbered holds + the beta on top.

export const COLOURS = {
  yellow:{name:'Yellow',sw:'#f2c21b',t:(h,s,v,k)=>h>=40&&h<=70&&s>.40-k&&v>.45},
  orange:{name:'Orange',sw:'#ee7a1d',t:(h,s,v,k)=>h>=14&&h<40&&s>.50-k&&v>.45},
  red:   {name:'Red',   sw:'#d8322f',t:(h,s,v,k)=>(h<14||h>=342)&&s>.45-k&&v>.22},
  pink:  {name:'Pink',  sw:'#e35d9c',t:(h,s,v,k)=>h>=290&&h<342&&s>.28-k&&v>.40},
  purple:{name:'Purple',sw:'#7a3fb5',t:(h,s,v,k)=>h>=250&&h<290&&s>.22-k&&v>.15},
  blue:  {name:'Blue',  sw:'#2367c9',t:(h,s,v,k)=>h>=185&&h<250&&s>.35-k&&v>.18},
  green: {name:'Green', sw:'#2e9e4a',t:(h,s,v,k)=>h>=72&&h<170&&s>.28-k&&v>.18},
  white: {name:'White', sw:'#f4f4f2',t:(h,s,v,k)=>s<.14+k&&v>.80-k},
  black: {name:'Black', sw:'#1d1d1d',t:(h,s,v,k)=>v<.17+k}
};
export const HANDS = new Set(['LH','RH','BH']);

export function createEngine() {
  const src = document.createElement('canvas');
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const grey = document.createElement('canvas');
  const e = {
    colour: 'yellow', tol: 12, accent: '#ff5a1f',
    PW: 0, PH: 0, holds: [], excluded: new Set(),
    labels: null, labelToHold: new Int32Array(1),
    beta: null, sel: -1, src
  };
  let Hh, Ss, Vv;

  e.load = (drawable, w, h) => {
    const k = Math.min(1, 1000 / Math.max(w, h));
    src.width = Math.round(w * k); src.height = Math.round(h * k);
    sctx.drawImage(drawable, 0, 0, src.width, src.height);
    prep(); e.detect();
  };

  function prep() {
    const k = 360 / Math.max(src.width, src.height);
    e.PW = Math.max(1, Math.round(src.width * k)); e.PH = Math.max(1, Math.round(src.height * k));
    const { PW, PH } = e;
    const p = document.createElement('canvas'); p.width = PW; p.height = PH;
    const pc = p.getContext('2d', { willReadFrequently: true }); pc.drawImage(src, 0, 0, PW, PH);
    const d = pc.getImageData(0, 0, PW, PH).data, n = PW * PH;
    Hh = new Float32Array(n); Ss = new Float32Array(n); Vv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i*4]/255, g = d[i*4+1]/255, b = d[i*4+2]/255;
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b), df = mx - mn; let h = 0;
      if (df) { if (mx === r) h = ((g-b)/df) % 6; else if (mx === g) h = (b-r)/df + 2; else h = (r-g)/df + 4; h *= 60; if (h < 0) h += 360; }
      Hh[i] = h; Ss[i] = mx ? df/mx : 0; Vv[i] = mx;
    }
    grey.width = src.width; grey.height = src.height;
    const id = sctx.getImageData(0, 0, src.width, src.height), a = id.data;
    for (let i = 0; i < a.length; i += 4) { const v = (a[i]*.3 + a[i+1]*.59 + a[i+2]*.11) * .36 + 12; a[i] = a[i+1] = a[i+2] = v; }
    grey.getContext('2d').putImageData(id, 0, 0);
  }

  e.detect = () => {
    const { PW, PH } = e;
    const k = (e.tol - 10) / 100, test = COLOURS[e.colour].t, n = PW * PH, m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = test(Hh[i], Ss[i], Vv[i], k) ? 1 : 0;
    const labels = new Int32Array(n), st = new Int32Array(n); let L = 0; const raw = [];
    for (let i = 0; i < n; i++) {
      if (!m[i] || labels[i]) continue;
      L++; let sp = 0; st[sp++] = i; labels[i] = L;
      let a = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (sp) {
        const p = st[--sp], x = p % PW, y = (p / PW) | 0;
        a++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && m[p-1] && !labels[p-1]) { labels[p-1] = L; st[sp++] = p-1; }
        if (x < PW-1 && m[p+1] && !labels[p+1]) { labels[p+1] = L; st[sp++] = p+1; }
        if (y > 0 && m[p-PW] && !labels[p-PW]) { labels[p-PW] = L; st[sp++] = p-PW; }
        if (y < PH-1 && m[p+PW] && !labels[p+PW]) { labels[p+PW] = L; st[sp++] = p+PW; }
      }
      raw.push({ L, a, cx: sx/a, cy: sy/a, x0, y0, x1, y1 });
    }
    const minA = Math.max(20, n * .00025), maxA = n * .2;
    e.holds = raw.filter(b => b.a >= minA && b.a <= maxA).sort((a, b) => b.a - a.a).slice(0, 40).sort((a, b) => b.cy - a.cy);
    e.labelToHold = new Int32Array(L + 1);
    e.holds.forEach((b, i) => { b.n = i + 1; e.labelToHold[b.L] = i + 1; });
    e.labels = labels; e.excluded = new Set();
  };

  e.toggleAt = (fx, fy) => {
    const px = fx * e.PW, py = fy * e.PH;
    let h = e.labelToHold[e.labels?.[(py|0) * e.PW + (px|0)] || 0] || 0;
    if (!h) { let best = 18*18; e.holds.forEach(b => { const d = (b.cx-px)**2 + (b.cy-py)**2; if (d < best) { best = d; h = b.n; } }); }
    if (!h) return false;
    e.excluded.has(h) ? e.excluded.delete(h) : e.excluded.add(h);
    return true;
  };

  e.holdList = () => e.holds.filter(b => !e.excluded.has(b.n))
    .map(b => `#${b.n}: x=${(b.cx/e.PW).toFixed(2)}, y=${(b.cy/e.PH).toFixed(2)}, size=${((b.x1-b.x0+b.y1-b.y0)/2/Math.max(e.PW,e.PH)).toFixed(3)}`).join('\n');

  const rr = (c,x,y,w,h,r) => { c.beginPath(); if (c.roundRect) c.roundRect(x,y,w,h,r); else c.rect(x,y,w,h); };
  const geom = (b, sx, sy, u) => ({ x: b.cx*sx, y: b.cy*sy, r: Math.max(b.x1-b.x0, b.y1-b.y0)*sx/2 + 6*u });

  e.render = (cv, withBeta) => {
    const W = src.width, H = src.height; cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); c.drawImage(grey, 0, 0);
    const { PW, PH } = e;
    if (PW) {
      const mk = document.createElement('canvas'); mk.width = PW; mk.height = PH;
      const mc = mk.getContext('2d'); const md = mc.createImageData(PW, PH);
      for (let i = 0; i < PW*PH; i++) { const h = e.labelToHold[e.labels[i]]; if (h && !e.excluded.has(h)) md.data[i*4+3] = 255; }
      mc.putImageData(md, 0, 0);
      const col = document.createElement('canvas'); col.width = W; col.height = H;
      const cc = col.getContext('2d'); cc.drawImage(src, 0, 0);
      cc.globalCompositeOperation = 'destination-in'; cc.imageSmoothingEnabled = true; cc.drawImage(mk, 0, 0, W, H);
      c.drawImage(col, 0, 0);
    }
    const u = Math.max(W, H) / 960, sx = W / PW, sy = H / PH, ACC = e.accent;
    e.holds.forEach(b => {
      const g = geom(b, sx, sy, u), ex = e.excluded.has(b.n);
      c.lineWidth = 2*u; c.setLineDash(ex ? [5*u,5*u] : []);
      c.strokeStyle = ex ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.92)';
      c.beginPath(); c.arc(g.x, g.y, g.r, 0, 7); c.stroke(); c.setLineDash([]);
      if (!ex) {
        const bx = g.x + g.r*.72, by = g.y - g.r*.72;
        c.beginPath(); c.arc(bx, by, 10*u, 0, 7); c.fillStyle = 'rgba(16,19,22,.9)'; c.fill();
        c.fillStyle = '#fff'; c.font = `600 ${11*u}px "IBM Plex Mono",monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(b.n, bx, by + .5*u);
      }
    });
    const B = e.beta;
    if (withBeta && B && B.moves?.length) {
      const pos = n => geom(e.holds[n-1], sx, sy, u);
      [true, false].forEach(hand => {
        const pts = B.moves.filter(m => HANDS.has(m.limb) === hand).map(m => pos(m.hold));
        if (pts.length < 2) return;
        c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.lineJoin = 'round';
        c.strokeStyle = hand ? ACC : 'rgba(255,255,255,.75)'; c.globalAlpha = hand ? .9 : 1;
        c.lineWidth = (hand ? 3.5 : 2)*u; c.setLineDash(hand ? [] : [7*u,6*u]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      });
      if (e.sel >= 0 && B.moves[e.sel]) { const g = pos(B.moves[e.sel].hold); c.beginPath(); c.arc(g.x, g.y, g.r + 6*u, 0, 7); c.strokeStyle = ACC; c.lineWidth = 5*u; c.stroke(); }
      const stack = {}; c.font = `600 ${12*u}px "IBM Plex Mono",monospace`; c.textBaseline = 'middle'; c.textAlign = 'left';
      B.moves.forEach((m, i) => {
        const g = pos(m.hold), k = stack[m.hold] = (stack[m.hold] || 0) + 1, hand = HANDS.has(m.limb), lab = `${i+1} ${m.limb}`;
        const w = c.measureText(lab).width + 12*u, h = 20*u;
        let px = g.x + g.r + 5*u, py = g.y - g.r*.6 + (k-1)*(h + 3*u);
        if (px + w > W - 2) px = g.x - g.r - 5*u - w;
        py = Math.min(Math.max(py, 2), H - h - 2);
        rr(c, px, py, w, h, 5*u);
        c.fillStyle = i === e.sel ? '#fff' : hand ? ACC : 'rgba(16,19,22,.88)'; c.fill();
        if (!hand && i !== e.sel) { c.strokeStyle = '#fff'; c.lineWidth = 1.2*u; c.stroke(); }
        c.fillStyle = i === e.sel ? '#16130f' : '#fff'; c.fillText(lab, px + 6*u, py + h/2 + .5*u);
      });
    }
  };

  e.toBlob = (cv, q = .88) => new Promise(r => cv.toBlob(r, 'image/jpeg', q));
  e.snapshot = async (maxSide = 720, withBeta = true) => {
    const a = document.createElement('canvas'); e.render(a, withBeta);
    const k = Math.min(1, maxSide / Math.max(a.width, a.height));
    const t = document.createElement('canvas'); t.width = Math.round(a.width*k); t.height = Math.round(a.height*k);
    t.getContext('2d').drawImage(a, 0, 0, t.width, t.height);
    return t;
  };
  return e;
}

/* ---------- example wall ---------- */
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function mix(hex,to,amt){const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const T=to==='w'?255:0;r=Math.round(r+(T-r)*amt);g=Math.round(g+(T-g)*amt);b=Math.round(b+(T-b)*amt);return`rgb(${r},${g},${b})`}
function blob(c,x,y,r,col,rand){
  const pts=[],N=11;for(let i=0;i<N;i++){const a=i/N*Math.PI*2;const rr=r*(0.72+rand()*0.5);pts.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr*0.85])}
  const path=()=>{c.beginPath();pts.forEach((p,i)=>{const q=pts[(i+1)%N];const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;i?c.quadraticCurveTo(p[0],p[1],mx,my):c.moveTo(mx,my)});c.closePath()};
  c.save();c.translate(r*.12,r*.16);path();c.fillStyle='rgba(30,26,20,.32)';c.fill();c.restore();
  path();c.fillStyle=mix(col,'k',.22);c.fill();
  c.save();c.translate(-r*.08,-r*.1);c.scale(.86,.86);c.translate(x*.163,y*.163);path();c.fillStyle=col;c.fill();c.restore();
  c.beginPath();c.ellipse(x-r*.25,y-r*.3,r*.28,r*.16,-.5,0,7);c.fillStyle=mix(col,'w',.28);c.fill();
}
export function makeSampleWall(){
  const W=720,H=960,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#aaa498');g.addColorStop(1,'#b8b1a5');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(60,55,48,.35)';x.lineWidth=2;[240,480].forEach(v=>{x.beginPath();x.moveTo(v,0);x.lineTo(v,H);x.stroke()});[320,640].forEach(v=>{x.beginPath();x.moveTo(0,v);x.lineTo(W,v);x.stroke()});
  x.fillStyle='#57524a';for(let yy=24;yy<H;yy+=40)for(let xx=20+((yy/40)%2)*20;xx<W;xx+=40){x.beginPath();x.arc(xx,yy,2.2,0,7);x.fill()}
  const R=rng(7);const other=['#d8322f','#2367c9','#2e9e4a','#7a3fb5','#e35d9c','#ee7a1d','#1c1c1c'];
  for(let i=0;i<34;i++){const px=40+R()*640,py=40+R()*880;blob(x,px,py,10+R()*20,other[i%other.length],R)}
  [[.38,.915,14],[.62,.885,13],[.45,.76,26],[.585,.73,20],[.30,.60,22],[.66,.50,21],[.48,.40,13],[.72,.27,20],[.50,.12,34]].forEach(([u,v,r])=>blob(x,u*W,v*H,r,'#f2c21b',R));
  return c;
}
export const EXAMPLE_BETA = {
  example: true, grade: 'V3',
  read: 'A steady vertical problem that climbs left then right. The only hard part is the small crimp at hold 7.',
  moves: [
    {hold:3,limb:'LH',cue:'Left hand on the big start jug'},{hold:4,limb:'RH',cue:'Right hand on the second start hold'},
    {hold:1,limb:'LF',cue:'Left foot on the low foothold, toe straight on'},{hold:2,limb:'RF',cue:'Right foot on the far foothold'},
    {hold:5,limb:'LH',cue:'Reach left, drop your left hip in to the wall'},{hold:4,limb:'RF',cue:'High-step right foot onto hold 4'},
    {hold:6,limb:'RH',cue:'Rock over the right foot and reach'},{hold:5,limb:'LF',cue:'Bring the left foot up onto 5'},
    {hold:7,limb:'LH',cue:'Crimp it, thumb over the top'},{hold:8,limb:'RH',cue:'Flag left leg out so you do not swing'},
    {hold:9,limb:'BH',cue:'Match the top jug and hold two seconds'}
  ],
  cruxes: [{hold:7,fix:'Get your right foot high on 6 first so the crimp is a short lock-off, not a long pull.'}],
  if_struggling: ['Climb the first four moves twice before trying the top, so the start feels automatic.','Keep arms straight between moves and push with your legs.','If you barn-door on 8, flag your left leg further across.'],
  grade_note: 'To make it feel easier, match on hold 5 before the crimp. For V4 training, skip the high-step and dyno from 5 to 6.'
};
