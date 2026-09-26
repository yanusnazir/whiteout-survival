// WHITEOUT procedural audio: soothing, cold, lonely.
// Nothing loops loudly. Wind moves in gusts with long lulls; the fire is built from
// individual crackles; distant life is rare. Silence is part of the soundscape.

export interface AmbientParams {
  dt: number;
  storm: number;       // 0..1
  snowing: boolean;
  night: boolean;
  day: number;
  fireProx: number;    // 0..1 (1 = standing at the fire)
  fireIntensity: number; // 0..1
  firePan: number;     // -1..1
  inside?: number;     // 0 outside, 1 inside the shelter, 2 sleeping inside
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  amb!: GainNode;
  reverbIn!: GainNode;
  muted = false;
  paused = false;
  started = false;

  // buffers
  private brown!: AudioBuffer;
  private pink!: AudioBuffer;
  private white!: AudioBuffer;
  private crunch: AudioBuffer[] = [];
  private crackles: AudioBuffer[] = [];
  private pops: AudioBuffer[] = [];

  // wind
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windPan!: StereoPannerNode;
  private howlGain!: GainNode;
  private howlFilter!: BiquadFilterNode;
  private gustT = 2;
  private panT = 0;
  // snowfall
  private snowGain!: GainNode;
  // fire
  private fireBus!: GainNode;
  private fireFilter!: BiquadFilterNode;
  private firePanner!: StereoPannerNode;
  private fireBed!: GainNode;
  private fireHiss!: GainNode;
  private crackleAcc = 0;
  private lastFireProx = 0;
  // distant events
  private nextEvent = 14;
  // 1 = day, ~0.8 = night (ambience a little quieter & more isolated)
  private nightMix = 1;
  // shelter muffling
  private ambFilter!: BiquadFilterNode;
  private lastInside = -1;
  private insideGain = 1;
  private shelterT = 6;

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      const ctx = this.ctx;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      // ambience runs through a lowpass so walls can muffle the outside world
      this.ambFilter = ctx.createBiquadFilter();
      this.ambFilter.type = "lowpass"; this.ambFilter.frequency.value = 20000; this.ambFilter.Q.value = 0.5;
      this.amb = ctx.createGain(); this.amb.gain.value = 1;
      this.amb.connect(this.ambFilter).connect(this.master);

      this.makeBuffers();

      // long, dark reverb for distance
      const conv = ctx.createConvolver();
      conv.buffer = this.makeImpulse(4.2, 2.2);
      const wetLp = ctx.createBiquadFilter(); wetLp.type = "lowpass"; wetLp.frequency.value = 2600;
      this.reverbIn = ctx.createGain(); this.reverbIn.gain.value = 1;
      this.reverbIn.connect(conv).connect(wetLp).connect(this.amb);

      this.startWind();
      this.startSnowfall();
      this.startFire();
      this.started = true;
    } catch {
      this.ctx = null;
    }
  }

  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }
  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    this.applyMaster();
  }
  private applyMaster() {
    if (!this.ctx) return;
    const v = this.muted ? 0 : this.paused ? 0.3 : 1;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  // ---------- buffers ----------
  private makeBuffers() {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = sr * 9; // long buffers so loops are not recognisable
    this.white = ctx.createBuffer(1, sr * 2, sr);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;

    this.brown = ctx.createBuffer(1, len, sr);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    this.pink = ctx.createBuffer(1, len, sr);
    const p = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const wh = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + wh * 0.0555179; b1 = 0.99332 * b1 + wh * 0.0750759;
      b2 = 0.969 * b2 + wh * 0.153852; b3 = 0.8665 * b3 + wh * 0.3104856;
      b4 = 0.55 * b4 + wh * 0.5329522; b5 = -0.7616 * b5 - wh * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wh * 0.5362) * 0.11;
      b6 = wh * 0.115926;
    }

    // snow crunch: muffled granular compression
    for (let v = 0; v < 8; v++) {
      const n = Math.floor(sr * 0.24);
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let lp = 0;
      const dens = rand(0.015, 0.04);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.018) * Math.exp(-t * rand(13, 16));
        const grain = Math.random() < dens ? rand(0.6, 1) : 0.18;
        const x = (Math.random() * 2 - 1) * grain;
        lp += (x - lp) * 0.45; // soften
        d[i] = lp * env;
      }
      this.crunch.push(buf);
    }
    // fire crackles: tiny dry ticks
    for (let v = 0; v < 10; v++) {
      const n = Math.floor(sr * rand(0.012, 0.05));
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const k = rand(120, 320);
      let prev = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const x = Math.random() * 2 - 1;
        d[i] = (x - prev) * Math.exp(-t * k); // differentiated -> crisp
        prev = x;
      }
      this.crackles.push(buf);
    }
    // small wood pops: a click with a short woody resonance
    for (let v = 0; v < 5; v++) {
      const n = Math.floor(sr * 0.08);
      const buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const f = rand(700, 1500);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = ((Math.random() * 2 - 1) * Math.exp(-t * 400) + Math.sin(2 * Math.PI * f * t) * 0.5 * Math.exp(-t * 70)) * 0.9;
      }
      this.pops.push(buf);
    }
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * 0.6;
    }
    return buf;
  }

  private loop(buf: AudioBuffer) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = 0; s.loopEnd = buf.duration;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  // ---------- wind ----------
  private startWind() {
    const ctx = this.ctx!;
    const src = this.loop(this.brown);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "lowpass"; this.windFilter.frequency.value = 320; this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windPan = ctx.createStereoPanner();
    src.connect(this.windFilter).connect(this.windGain).connect(this.windPan).connect(this.amb);

    // hollow tonal whistle, only audible in strong gusts / storms
    const src2 = this.loop(this.pink);
    this.howlFilter = ctx.createBiquadFilter();
    this.howlFilter.type = "bandpass"; this.howlFilter.frequency.value = 520; this.howlFilter.Q.value = 9;
    this.howlGain = ctx.createGain(); this.howlGain.gain.value = 0;
    src2.connect(this.howlFilter).connect(this.howlGain).connect(this.windPan);
    this.windGain.gain.setTargetAtTime(0.015, ctx.currentTime, 3);
  }

  private startSnowfall() {
    const ctx = this.ctx!;
    const src = this.loop(this.pink);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 9500;
    this.snowGain = ctx.createGain(); this.snowGain.gain.value = 0;
    src.connect(hp).connect(lp).connect(this.snowGain).connect(this.amb);
  }

  // ---------- fire ----------
  private startFire() {
    const ctx = this.ctx!;
    this.fireBus = ctx.createGain(); this.fireBus.gain.value = 0;
    this.fireFilter = ctx.createBiquadFilter(); this.fireFilter.type = "lowpass"; this.fireFilter.frequency.value = 3000;
    this.firePanner = ctx.createStereoPanner();
    this.fireBus.connect(this.fireFilter).connect(this.firePanner).connect(this.sfx);
    // small reverb send so a distant fire sits in the landscape
    const send = ctx.createGain(); send.gain.value = 0.12;
    this.firePanner.connect(send).connect(this.reverbIn);

    // soft low burning bed
    const bed = this.loop(this.brown);
    const bedLp = ctx.createBiquadFilter(); bedLp.type = "lowpass"; bedLp.frequency.value = 170;
    this.fireBed = ctx.createGain(); this.fireBed.gain.value = 0;
    bed.connect(bedLp).connect(this.fireBed).connect(this.fireBus);
    // faint ember hiss
    const hiss = this.loop(this.pink);
    const hissBp = ctx.createBiquadFilter(); hissBp.type = "bandpass"; hissBp.frequency.value = 2800; hissBp.Q.value = 0.6;
    this.fireHiss = ctx.createGain(); this.fireHiss.gain.value = 0;
    hiss.connect(hissBp).connect(this.fireHiss).connect(this.fireBus);
  }

  private crackle(big: boolean) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = big ? this.pops[(Math.random() * this.pops.length) | 0] : this.crackles[(Math.random() * this.crackles.length) | 0];
    s.playbackRate.value = rand(0.7, 1.5);
    const g = ctx.createGain();
    g.gain.value = big ? rand(0.18, 0.32) : rand(0.03, 0.14);
    s.connect(g).connect(this.fireBus);
    s.start();
  }

  // ---------- per-frame update ----------
  update(p: AmbientParams) {
    if (!this.ctx || this.paused) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // --- night: the world goes quieter and more isolated (fire keeps its own volume) ---
    const inside = p.inside || 0;
    if (inside !== this.lastInside) {
      // walls muffle the wind; sleeping sinks deeper into near-silence
      this.lastInside = inside;
      this.ambFilter.frequency.setTargetAtTime(inside === 0 ? 20000 : inside === 1 ? 650 : 420, now, 0.3);
      this.insideGain = inside === 0 ? 1 : inside === 1 ? 0.6 : 0.4;
      this.amb.gain.setTargetAtTime(this.nightMix * this.insideGain, now, 0.35);
      if (inside > 0) this.shelterT = rand(4, 9);
    }
    const nightTarget = p.night ? 0.8 : 1;
    if (Math.abs(nightTarget - this.nightMix) > 0.001) {
      this.nightMix += (nightTarget - this.nightMix) * Math.min(1, p.dt * 0.25);
      this.amb.gain.setTargetAtTime(this.nightMix * this.insideGain, now, 0.5);
    }
    // subtle shelter sounds: a creaking pole, a hide shifting in the wind
    if (inside > 0) {
      this.shelterT -= p.dt;
      if (this.shelterT <= 0) {
        if (Math.random() < 0.55) this.creak(); else this.rustle(p.storm);
        this.shelterT = rand(9, 22) * (inside === 2 ? 1.4 : 1);
      }
    }

    // --- wind gusts: long lulls of near silence, then gentle swells ---
    this.gustT -= p.dt;
    if (this.gustT <= 0) {
      const lull = Math.random() < (p.night ? 0.55 : 0.45) - p.storm * 0.35;
      const base = (lull ? rand(0.002, 0.007) : rand(0.012, 0.03)) * (p.night ? 0.8 : 1);
      const level = base + p.storm * rand(0.07, 0.14);
      const tau = lull ? rand(2.5, 4.5) : rand(1.5, 3.2);
      this.windGain.gain.setTargetAtTime(level, now, tau);
      this.windFilter.frequency.setTargetAtTime(240 + level * 4200 + p.storm * 500, now, tau);
      this.howlGain.gain.setTargetAtTime(p.storm > 0.4 && !lull ? level * 0.5 : 0, now, tau);
      this.howlFilter.frequency.setTargetAtTime(rand(420, 760), now, tau);
      this.gustT = lull ? rand(7, 16) : rand(4, 9);
    }
    this.panT -= p.dt;
    if (this.panT <= 0) { this.windPan.pan.setTargetAtTime(rand(-0.6, 0.6), now, 5); this.panT = rand(6, 12); }

    // --- snowfall: barely there ---
    const snowTarget = p.snowing ? 0.0018 + p.storm * 0.005 : 0;
    this.snowGain.gain.setTargetAtTime(snowTarget * rand(0.8, 1.2), now, 3);

    // --- fire: clearer & brighter close up, darker & quieter far away ---
    const prox = p.fireProx;
    // from inside the shelter the fire is soft and a little distant
    const insideMul = inside === 0 ? 1 : inside === 1 ? 0.62 : 0.4;
    const vol = Math.pow(prox, 1.7) * (0.55 + p.fireIntensity * 0.45) * insideMul;
    const fireCut = inside === 0 ? 20000 : inside === 1 ? 1700 : 1100;
    if (Math.abs(prox - this.lastFireProx) > 0.002 || prox === 0 || inside !== 0) {
      this.fireBus.gain.setTargetAtTime(vol, now, 0.2);
      this.fireFilter.frequency.setTargetAtTime(Math.min(fireCut, 700 + prox * prox * 7500), now, 0.25);
      this.firePanner.pan.setTargetAtTime(p.firePan * (1 - prox * 0.6), now, 0.15);
      this.fireBed.gain.setTargetAtTime(0.1 * p.fireIntensity, now, 0.5);
      this.fireHiss.gain.setTargetAtTime(0.006 * p.fireIntensity, now, 0.5);
      this.lastFireProx = prox;
    }
    if (vol > 0.004) {
      // irregular clusters of tiny crackles, rare pops
      const rate = (3 + p.fireIntensity * 9) * (0.6 + Math.random() * 0.8);
      this.crackleAcc += p.dt * rate;
      while (this.crackleAcc >= 1) {
        this.crackleAcc -= 1;
        if (Math.random() < 0.8) this.crackle(false);
      }
      if (Math.random() < p.dt * 0.25 * p.fireIntensity) this.crackle(true);
    } else this.crackleAcc = 0;

    // --- rare distant events (long silences in between) ---
    this.nextEvent -= p.dt;
    if (this.nextEvent <= 0) {
      this.distantEvent(p);
      this.nextEvent = rand(16, 48) * (p.storm > 0.6 ? 1.6 : 1) * (p.night ? 1.3 : 1);
    }
  }

  private distantEvent(p: AmbientParams) {
    const r = Math.random();
    if (p.storm > 0.6) { if (r < 0.5) this.branchCrack(); return; }
    if (p.night) {
      if (r < 0.35) this.owl();
      else if (r < 0.55 && p.day >= 2) this.distantHowl(0.008);
      else if (r < 0.8) this.branchCrack();
      else this.snowSlump(0.03);
    } else {
      if (r < 0.3) this.raven();
      else if (r < 0.6) this.snowSlump(0.035);
      else if (r < 0.85) this.branchCrack();
      // else: silence
    }
  }

  // a lashed pole settling under snow weight
  private creak() {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    const f0 = rand(95, 140);
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rand(0.8, 0.92), t + 0.45);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rand(500, 800); bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.12);
    g.gain.linearRampToValueAtTime(0.008, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.55);
    o.connect(bp).connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.6);
  }
  // hide or boughs shifting as a gust brushes the shelter
  private rustle(storm: number) {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.pink;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rand(900, 1500); bp.Q.value = 0.9;
    const g = ctx.createGain();
    const v = 0.012 + storm * 0.012;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.15);
    g.gain.linearRampToValueAtTime(v * 0.4, t + 0.3);
    g.gain.linearRampToValueAtTime(v * 0.8, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0003, t + 0.9);
    s.connect(bp).connect(g).connect(this.sfx); s.start(t, Math.random() * 5); s.stop(t + 1);
  }

  // a distant dry branch snapping in the cold
  private branchCrack() {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rand(900, 1800); bp.Q.value = 1.2;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rand(0.03, 0.05), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.9, 0.9);
    const dry = ctx.createGain(); dry.gain.value = 0.35;
    s.connect(bp).connect(lp).connect(g).connect(pan);
    pan.connect(dry).connect(this.amb);
    pan.connect(this.reverbIn);
    s.start(t, Math.random()); s.stop(t + 0.12);
    if (Math.random() < 0.5) setTimeout(() => this.snowSlump(0.025), rand(250, 600));
  }

  // snow sliding off a branch onto the snow
  private snowSlump(vol: number) {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = rand(250, 450);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0005, t + rand(0.6, 1.1));
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.8, 0.8);
    s.connect(lp).connect(g).connect(pan).connect(this.amb);
    pan.connect(this.reverbIn);
    s.start(t, Math.random() * 5); s.stop(t + 1.3);
  }

  private owl() {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.9, 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const out = ctx.createGain(); out.gain.value = 0.25;
    lp.connect(pan); pan.connect(out).connect(this.amb); pan.connect(this.reverbIn);
    const f0 = rand(340, 420);
    const hoots = Math.random() < 0.5 ? [0, 0.55] : [0, 0.4, 0.75, 1.5];
    const t0 = ctx.currentTime + 0.05;
    hoots.forEach((off, i) => {
      const t = t0 + off;
      const o = ctx.createOscillator(); o.type = "sine";
      const f = f0 * (i === hoots.length - 1 ? 0.94 : 1);
      o.frequency.setValueAtTime(f * 1.03, t); o.frequency.exponentialRampToValueAtTime(f * 0.96, t + 0.32);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.36);
      o.connect(g).connect(lp); o.start(t); o.stop(t + 0.4);
    });
  }

  private raven() {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.9, 0.9);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 2.5;
    const out = ctx.createGain(); out.gain.value = 0.3;
    bp.connect(pan); pan.connect(out).connect(this.amb); pan.connect(this.reverbIn);
    const n = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + 0.05 + i * rand(0.35, 0.5);
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(rand(520, 620), t); o.frequency.exponentialRampToValueAtTime(rand(380, 440), t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.26);
      o.connect(g).connect(bp); o.start(t); o.stop(t + 0.3);
    }
  }

  private distantHowl(vol: number) {
    const ctx = this.ctx!; const t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(340, t);
    o.frequency.linearRampToValueAtTime(560, t + 1.1);
    o.frequency.linearRampToValueAtTime(530, t + 2.6);
    o.frequency.linearRampToValueAtTime(380, t + 3.6);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
    const lfoG = ctx.createGain(); lfoG.gain.value = 5;
    lfo.connect(lfoG).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.8);
    g.gain.setValueAtTime(vol, t + 2.6); g.gain.exponentialRampToValueAtTime(0.0003, t + 3.8);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
    const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.9, 0.9);
    const dry = ctx.createGain(); dry.gain.value = 0.3;
    o.connect(g).connect(lp).connect(pan);
    pan.connect(dry).connect(this.amb); pan.connect(this.reverbIn);
    o.start(t); lfo.start(t); o.stop(t + 4); lfo.stop(t + 4);
  }

  // ---------- one-shot SFX (kept soft and natural) ----------
  private noiseHit(opts: { dur: number; vol: number; type: BiquadFilterType; freq: number; q?: number; attack?: number; rate?: number; buf?: AudioBuffer }) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = opts.buf || this.white;
    if (opts.rate) s.playbackRate.value = opts.rate;
    const f = ctx.createBiquadFilter(); f.type = opts.type; f.frequency.value = opts.freq; f.Q.value = opts.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.vol, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0005, t + opts.dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + opts.dur + 0.05);
  }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx; const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  // muffled snow step. Running is brighter, firmer and shorter.
  footstep(running = false) {
    if (!this.ctx || this.muted || !this.crunch.length) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.crunch[(Math.random() * this.crunch.length) | 0];
    s.playbackRate.value = running ? rand(1.1, 1.3) : rand(0.8, 1.0);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.value = running ? rand(2400, 3000) : rand(1300, 1700);
    const g = ctx.createGain(); g.gain.value = (running ? rand(0.2, 0.26) : rand(0.1, 0.14)) * (0.88 + this.nightMix * 0.12);
    s.connect(lp).connect(g).connect(this.sfx);
    s.start(t);
    // soft body weight thump
    this.tone(running ? 85 : 70, 0.07, running ? 0.05 : 0.025, "sine", 50);
  }

  // wood-on-wood friction of the fire drill
  drill() { this.noiseHit({ dur: 0.16, vol: 0.05, type: "bandpass", freq: rand(700, 1000), q: 3, attack: 0.04, buf: this.pink }); }
  chop() {
    this.tone(170, 0.13, 0.22, "sine", 85);
    this.noiseHit({ dur: 0.06, vol: 0.12, type: "bandpass", freq: 1800, q: 1.4 });
    this.noiseHit({ dur: 0.25, vol: 0.03, type: "lowpass", freq: 500, buf: this.brown });
  }
  pickup() {
    this.noiseHit({ dur: 0.14, vol: 0.06, type: "lowpass", freq: 1600, attack: 0.02 });
    this.tone(640, 0.12, 0.025, "sine", 760);
  }
  craft() {
    this.tone(210, 0.08, 0.12, "sine", 150);
    this.tone(260, 0.08, 0.1, "sine", 190, 0.12);
    this.noiseHit({ dur: 0.18, vol: 0.04, type: "bandpass", freq: 1200 });
  }
  eat() { this.noiseHit({ dur: 0.12, vol: 0.07, type: "lowpass", freq: 900 }); this.noiseHit({ dur: 0.12, vol: 0.05, type: "lowpass", freq: 800 }); }
  drink() { this.tone(380, 0.18, 0.05, "sine", 260); this.tone(330, 0.16, 0.04, "sine", 240, 0.18); }
  hurt() { this.tone(140, 0.18, 0.08, "triangle", 90); }
  hunt() { this.noiseHit({ dur: 0.12, vol: 0.14, type: "lowpass", freq: 700 }); this.tone(110, 0.15, 0.12, "sine", 60); }
  throwWhoosh() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.5;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.32);
    s.connect(f).connect(g).connect(this.sfx); s.start(t); s.stop(t + 0.35);
  }
  fireLit() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.pink;
    const f = ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t); g.gain.linearRampToValueAtTime(0.12, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
    s.connect(f).connect(g).connect(this.sfx); s.start(t, Math.random() * 4); s.stop(t + 1.5);
  }
  fishBite() { this.noiseHit({ dur: 0.2, vol: 0.08, type: "bandpass", freq: 1400 }); this.tone(900, 0.06, 0.03); }
  wolf() { if (this.ctx) this.distantHowl(0.012); }
  gameOver() { this.tone(196, 1.8, 0.07, "sine", 130); }
  levelUp() { this.tone(523, 0.9, 0.035); this.tone(784, 1.2, 0.025, "sine", undefined, 0.25); }
  complete() { this.tone(587, 0.5, 0.04); this.tone(880, 0.9, 0.03, "sine", undefined, 0.18); }

  // compatibility no-ops (older call sites)
  setWind(_i: number) {}
  setFire(_p: number) {}
}

export const audio = new AudioEngine();
