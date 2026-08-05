// =============================================================
//  cosmic-voyage · 程序化音频引擎（零外部资源，纯 Web Audio 合成）
//  设计原则（科学 + 审美）：
//   · 真空不传声 —— 开放太空里默认近乎无声，只有你自己飞船系统的低频引擎嗡鸣；
//   · 有大气的天体（地球/火星/气态巨行星）才听得到风声，这正是真实录音的逻辑
//     （毅力号录过火星风、朱诺号把木星极光射电转成了可听声）；
//   · 音效与音乐全部用振荡器/噪声实时合成，无需加载任何音频文件。
// =============================================================

export const Sound = (() => {
  let ctx = null;
  let master, ambGain, sfxGain, musicGain;
  let noiseBuf = null;
  let enabled = true;
  let musicReady = false;
  let curAmb = null;          // { gain, nodes:[], id, stop() }
  let warp = null;            // 连续引擎嗡鸣 { osc, filt, gain }
  let lastEnv = null;

  // ---------- 基础 ----------
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0.0; master.connect(ctx.destination);
    ambGain = ctx.createGain(); ambGain.gain.value = 0.85; ambGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
    // 2 秒白噪声缓冲，循环复用
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    buildWarp();
    return true;
  }
  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }
  function noiseSrc() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  // ---------- 连续引擎嗡鸣（随速度变调） ----------
  function buildWarp() {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 38;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 260; filt.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(filt); sub.connect(filt); filt.connect(g); g.connect(sfxGain);
    o.start(); sub.start();
    warp = { o, sub, filt, g };
  }
  function setWarp(level) { // 0..1
    if (!ctx || !warp) return;
    const t = ctx.currentTime;
    const lv = Math.max(0, Math.min(1, level));
    warp.g.gain.setTargetAtTime(lv * 0.13, t, 0.12);
    warp.o.frequency.setTargetAtTime(48 + lv * 130, t, 0.12);
    warp.sub.frequency.setTargetAtTime(32 + lv * 40, t, 0.12);
    warp.filt.frequency.setTargetAtTime(240 + lv * 1000, t, 0.12);
  }

  // ---------- 环境氛围床（可交叉淡入淡出） ----------
  function stopAmb() {
    if (!curAmb) return;
    const a = curAmb; curAmb = null;
    const t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    if (a.stop) setTimeout(a.stop, 1000);
    setTimeout(() => { try { a.nodes.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect && n.disconnect(); } catch (e) {} }); } catch (e) {} }, 1100);
  }
  function setEnvironment(name) {
    if (!ensure()) return;
    if (name === lastEnv && curAmb) return;
    lastEnv = name;
    stopAmb();
    const builders = { space: envSpace, earth: envEarth, mars: envMars, airless: envAirless, gas: envGas, exo: envExo };
    const b = (builders[name] || envSpace)();
    curAmb = b;
  }

  // 太空：真空近乎无声，只留一丝极弱、缓慢飘移的“存在感”泛音（艺术处理）
  function envSpace() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    [42, 84, 168].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = i === 0 ? 0.5 : 0.18;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.12 * (i === 0 ? 1 : 0.4);
      lfo.connect(lg); lg.connect(og.gain); lfo.start();
      o.connect(og); og.connect(gain); o.start();
      nodes.push(o, lfo);
    });
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
    return { gain, nodes, id: 'space' };
  }

  // 地球：风（带通噪声 + 阵风 LFO）+ 偶发鸟鸣 + 远方水声
  function envEarth() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.value = 0.12;
    const gust = ctx.createOscillator(); gust.type = 'sine'; gust.frequency.value = 0.12;
    const gustG = ctx.createGain(); gustG.gain.value = 0.07;
    gust.connect(gustG); gustG.connect(ng.gain); gust.start();
    n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(gain); n.start();
    nodes.push(n, gust);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    // 鸟鸣调度器
    let alive = true;
    const chirp = () => {
      if (!alive || curAmb?.id !== 'earth') return;
      const t = ctx.currentTime;
      const base = 1800 + Math.random() * 1600;
      for (let k = 0; k < 2 + (Math.random() * 2 | 0); k++) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * (1 + k * 0.18);
        const g = ctx.createGain(); const st = t + k * 0.09;
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.05, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
        o.connect(g); g.connect(gain); o.start(st); o.stop(st + 0.14);
      }
      setTimeout(chirp, 1800 + Math.random() * 4000);
    };
    setTimeout(chirp, 1500);
    return { gain, nodes, id: 'earth', stop: () => { alive = false; } };
  }

  // 火星：稀薄大气的真实风声（NASA 毅力号录制过），比地球更稀疏、高频更尖
  function envMars() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 820; bp.Q.value = 1.1;
    const ng = ctx.createGain(); ng.gain.value = 0.07;
    const gust = ctx.createOscillator(); gust.type = 'sine'; gust.frequency.value = 0.08;
    const gustG = ctx.createGain(); gustG.gain.value = 0.05;
    gust.connect(gustG); gustG.connect(ng.gain); gust.start();
    n.connect(bp); bp.connect(ng); ng.connect(gain); n.start();
    nodes.push(n, gust);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    return { gain, nodes, id: 'mars' };
  }

  // 无大气（月球/水星/冥王星/谷神星/冰卫星）：外部几乎无声，只留极弱静电底噪，脚步/喷气靠自身
  function envAirless() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
    const ng = ctx.createGain(); ng.gain.value = 0.012;
    n.connect(hp); hp.connect(ng); ng.connect(gain); n.start();
    nodes.push(n);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    return { gain, nodes, id: 'airless' };
  }

  // 气态/冰巨行星云顶：强劲风（带通 + 缓慢调制）+ 低频隆隆
  function envGas() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const ng = ctx.createGain(); ng.gain.value = 0.16;
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = 0.07;
    const modG = ctx.createGain(); modG.gain.value = 0.09; mod.connect(modG); modG.connect(ng.gain); mod.start();
    n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(gain); n.start();
    nodes.push(n, mod);
    const rum = ctx.createOscillator(); rum.type = 'sine'; rum.frequency.value = 34;
    const rg = ctx.createGain(); rg.gain.value = 0.14; rum.connect(rg); rg.connect(gain); rum.start();
    nodes.push(rum);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    return { gain, nodes, id: 'gas' };
  }

  // 系外行星：诡谲的失谐音垫 + 偶发金属泛音
  function envExo() {
    const gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(ambGain);
    const nodes = [];
    [110, 110.6, 165].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const og = ctx.createGain(); og.gain.value = 0.22;
      const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 0.13;
      const tg = ctx.createGain(); tg.gain.value = 0.12; trem.connect(tg); tg.connect(og.gain); trem.start();
      o.connect(lp); lp.connect(og); og.connect(gain); o.start();
      nodes.push(o, trem);
    });
    gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2);
    return { gain, nodes, id: 'exo' };
  }

  // ---------- 音乐总线淡入淡出 ----------
  function fadeMusic(target, ramp = 1.2) {
    if (!ctx) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(target, ctx.currentTime, ramp / 3);
  }

  // 通用合成积木
  function pad(t, freqs, dur, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.4);
    g.gain.setValueAtTime(peak, t + dur - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    g.connect(f); f.connect(musicGain);
    for (const fr of freqs) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
      const og = ctx.createGain(); og.gain.value = 0.16;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur);
    }
  }
  function lead(t, fr, dur, vol = 0.16) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, vol = 0.5) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.3);
  }
  // 抵达某颗可登陆星：明亮短促的到达动机（大三和弦琶音 + 一记底鼓）
  function cueArrival() {
    if (!ensure() || !enabled || !musicReady) return;
    fadeMusic(1.3, 0.8);
    const t = ctx.currentTime + 0.05;
    pad(t, [261.63, 329.63, 392.0], 1.6, 0.32);
    pad(t + 1.5, [392.0, 493.88, 587.33], 1.8, 0.32);
    const arp = [523.25, 659.25, 783.99, 1046.5];
    arp.forEach((fr, i) => lead(t + i * 0.32, fr, 0.5));
    kick(t);
    setTimeout(() => fadeMusic(0, 1.4), 3400);
  }
  // 地球登场：更恢弘的 I–V–vi–IV（C–G–Am–F）铺陈 + 上行琶音 + 四次底鼓 —— 我的“审美招牌”
  function cueEarth() {
    if (!ensure() || !enabled || !musicReady) return;
    fadeMusic(1.5, 1.0);
    const t = ctx.currentTime + 0.06;
    const C = [130.81, 164.81, 196.0, 246.94, 293.66];   // Cmaj9
    const G = [196.0, 246.94, 293.66, 392.0];
    const Am = [220.0, 261.63, 329.63, 440.0];
    const F = [174.61, 220.0, 261.63, 349.23];
    pad(t, C, 2.1, 0.42); pad(t + 2.1, G, 2.1, 0.42);
    pad(t + 4.2, Am, 2.1, 0.42); pad(t + 6.3, F, 2.6, 0.42);
    const arp = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 659.25, 783.99, 1046.5, 1318.5];
    arp.forEach((fr, i) => lead(t + i * 0.62, fr, 0.55, i > 7 ? 0.2 : 0.16));
    for (let i = 0; i < 5; i++) kick(t + i * 2.1, i === 4 ? 0.6 : 0.45);
    setTimeout(() => fadeMusic(0, 1.8), 9200);
  }
  // 重大时刻（首登/全地标解锁）：在地球动机上叠加高八度闪亮尾奏
  function cueEpic() {
    if (!ensure() || !enabled || !musicReady) return;
    fadeMusic(1.6, 0.9);
    const t = ctx.currentTime + 0.06;
    const C = [130.81, 164.81, 196.0, 246.94, 293.66, 392.0];
    const G = [196.0, 246.94, 293.66, 392.0, 493.88];
    const Am = [220.0, 261.63, 329.63, 440.0];
    const F = [174.61, 220.0, 261.63, 349.23, 440.0];
    pad(t, C, 2.2, 0.46); pad(t + 2.2, G, 2.2, 0.46);
    pad(t + 4.4, Am, 2.2, 0.46); pad(t + 6.6, F, 3.0, 0.46);
    const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98, 1046.5, 1318.5, 1567.98, 2093.0];
    arp.forEach((fr, i) => lead(t + i * 0.6, fr, 0.6, 0.18));
    for (let i = 0; i < 5; i++) kick(t + i * 2.2, 0.5);
    // 闪亮尾奏（高频铃）
    [1567.98, 2093.0, 2637.0].forEach((fr, i) => lead(t + 8.6 + i * 0.18, fr, 1.2, 0.12));
    setTimeout(() => fadeMusic(0, 2.0), 10400);
  }

  // ---------- 一次性音效 ----------
  function gearShift(g) {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 120 + g * 34;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 4;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.09, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.frequency.exponentialRampToValueAtTime(250 + g * 60, t + 0.2);
    o.connect(f); f.connect(g2); g2.connect(sfxGain); o.start(t); o.stop(t + 0.25);
  }
  function land(airless) {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    // 低频撞击
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(airless ? 95 : 72, t); o.frequency.exponentialRampToValueAtTime(airless ? 42 : 34, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 1.0);
    // 撞击扬尘/金属感
    const n = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = airless ? 2600 : 560;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(airless ? 0.22 : 0.4, t + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (airless ? 0.22 : 0.6));
    n.connect(f); f.connect(ng); ng.connect(sfxGain); n.start(t); n.stop(t + 0.7);
    if (airless) { // 无大气：更“铿”的金属余响
      const m = ctx.createOscillator(); m.type = 'triangle'; m.frequency.value = 320;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(0.12, t); mg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      m.connect(mg); mg.connect(sfxGain); m.start(t); m.stop(t + 0.4);
    }
  }
  function jump() {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(680, t + 0.14);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.2);
  }
  function footstep() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(f); f.connect(g); g.connect(sfxGain); n.start(t); n.stop(t + 0.1);
  }
  function photo() {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    [0, 0.09].forEach(off => {
      const n = noiseSrc();
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.18, t + off + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.04);
      n.connect(f); f.connect(g); g.connect(sfxGain); n.start(t + off); n.stop(t + off + 0.05);
    });
  }
  // 成就解锁：悦耳的大三和弦铃声（C–E–G–C）
  function achievement() {
    resume(); if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((fr, i) => bell(fr, t + i * 0.085, 0.55, 0.16, sfxGain));
  }
  // 地标光柱点亮：柔和的上行微光
  function poi() {
    resume(); if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    [784.0, 1046.5].forEach((fr, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const g = ctx.createGain(); const st = t + i * 0.07;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.09, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + 0.5);
      o.connect(g); g.connect(sfxGain); o.start(st); o.stop(st + 0.55);
    });
  }
  // 进入大气层：白噪声“等离子体嘶鸣”涌起（真实再入加热的听觉隐喻）
  function entryHiss() {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    const n = noiseSrc();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.6); f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    n.connect(f); f.connect(g); g.connect(sfxGain); n.start(t); n.stop(t + 1.2);
  }
  function ui() {
    resume(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.08);
  }
  function bell(fr, t, dur, vol, bus) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = fr * 2.01;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.05;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus || sfxGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  // ---------- 总开关 ----------
  function setEnabled(b) {
    enabled = b; ensure();
    if (master) master.gain.setTargetAtTime(b ? 0.9 : 0.0, ctx.currentTime, 0.05);
  }
  function toggle() {
    const b = !enabled;
    setEnabled(b);
    if (b && !musicReady) musicReady = true; // 首次开启即允许音乐
    return b;
  }
  function armMusic() { musicReady = true; }

  return {
    resume, ensure, setEnvironment, setWarp,
    gearShift, land, jump, footstep, photo, achievement, poi, entryHiss, ui,
    cueArrival, cueEarth, cueEpic,
    setEnabled, toggle, isEnabled: () => enabled, armMusic,
  };
})();
