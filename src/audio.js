// Quiet, procedural sound: wind in the trees, the scrape of the rake, and
// now and then a distant temple bell. Nothing is downloaded.

(function (RJ) {
'use strict';

class Soundscape {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.rakeLevel = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);

    const noiseBuffer = (seconds, brown) => {
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      // Crossfade the loop seam.
      const f = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[len - f + i] * (1 - t); }
      return buf;
    };
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // Wind: low brown noise, with a slowly wandering level.
    const wind = loop(noiseBuffer(6, true));
    const windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 520;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.12;
    wind.connect(windLP).connect(this.windGain).connect(this.master);

    // Leaves: airy high band, following the wind.
    const leaves = loop(noiseBuffer(5, false));
    const leavesBP = ctx.createBiquadFilter(); leavesBP.type = 'bandpass'; leavesBP.frequency.value = 3800; leavesBP.Q.value = 0.6;
    this.leafGain = ctx.createGain(); this.leafGain.gain.value = 0.01;
    leaves.connect(leavesBP).connect(this.leafGain).connect(this.master);

    // Rake: gravel scrape, gain driven by rake speed.
    const rake = loop(noiseBuffer(3, false));
    const rakeBP = ctx.createBiquadFilter(); rakeBP.type = 'bandpass'; rakeBP.frequency.value = 2200; rakeBP.Q.value = 0.9;
    const rakeHP = ctx.createBiquadFilter(); rakeHP.type = 'highpass'; rakeHP.frequency.value = 700;
    this.rakeGain = ctx.createGain(); this.rakeGain.gain.value = 0;
    // A slight crackle: amplitude-modulate with fast noise.
    rake.connect(rakeBP).connect(rakeHP).connect(this.rakeGain).connect(this.master);

    this.gust = 0;
    this.nextBell = ctx.currentTime + 40 + Math.random() * 60;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.4);
  }

  bell() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.0;
    out.connect(this.master);
    // A large bronze bell: inharmonic partials with long, beating decays.
    const f0 = 82 + Math.random() * 6;
    const partials = [[0.5, 0.5, 14], [1, 1, 11], [2.02, 0.45, 8], [2.74, 0.35, 6], [3.98, 0.18, 4], [5.4, 0.1, 3]];
    for (const [ratio, amp, decay] of partials) {
      for (const detune of [-0.6, 0.6]) {
        const o = ctx.createOscillator();
        o.frequency.value = f0 * ratio + detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp * 0.5, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.1);
      }
    }
    // Distant: muffled and quiet.
    out.gain.setValueAtTime(0.05, t);
  }

  update(dt, rakeSpeed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Gusts wander.
    this.gust += (Math.random() - 0.5) * dt * 0.6;
    this.gust *= 1 - dt * 0.08;
    const g = 0.5 + 0.5 * Math.sin(t * 0.07) * 0.6 + this.gust;
    const w = Math.max(0.04, Math.min(0.22, 0.1 + 0.08 * g));
    this.windGain.gain.setTargetAtTime(w, t, 1.5);
    this.leafGain.gain.setTargetAtTime(Math.max(0, (w - 0.08) * 0.12), t, 1.5);

    const target = Math.min(0.32, rakeSpeed * 0.45);
    this.rakeLevel += (target - this.rakeLevel) * Math.min(1, dt * 14);
    this.rakeGain.gain.setTargetAtTime(this.rakeLevel, t, 0.03);

    if (t > this.nextBell) {
      this.bell();
      this.nextBell = t + 150 + Math.random() * 180;
    }
  }
}

Object.assign(RJ, { Soundscape });
})(globalThis.RJ = globalThis.RJ || {});
