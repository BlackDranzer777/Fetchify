// src/lib/fuseFeatures.js
function clamp(x, a=0, b=1) { return Math.max(a, Math.min(b, x)); }
function gaussian(x, mu=120, sigma=30) {
  const z = (x - mu) / sigma;
  return Math.exp(-z*z);
}
function tempoScoreFromBpm(bpm) {
  if (!bpm) return 0.5;
  const candidates = [bpm, bpm*2, bpm/2];
  return Math.max(...candidates.map(v => gaussian(v)));
}
function beatStability(beats) {
  if (!Array.isArray(beats) || beats.length < 5) return 0.5;
  const ibis = [];
  for (let i=1;i<beats.length;i++) ibis.push(beats[i]-beats[i-1]);
  const mean = ibis.reduce((a,b)=>a+b,0)/ibis.length;
  const sd = Math.sqrt(ibis.reduce((a,b)=>a+(b-mean)*(b-mean),0)/ibis.length);
  const cv = sd / (mean || 1e-9);
  return clamp(1 - cv); // lower variability -> more stable
}

export function fuseFeatures(abHigh, abLow) {
  const H = abHigh?.highlevel || {};
  const LL = abLow || {};

  // High-level positive class probs
  const pDance = H.danceability?.all?.danceable ?? null;
  const pEnergetic = H.energy?.all?.energetic ?? null;
  const pHappy = H.mood_happy?.all?.happy ?? null;
  const pSad = H.mood_sad?.all?.sad ?? null;

  // Low-level
  const bpm = LL?.rhythm?.bpm ?? null;
  const beats = LL?.rhythm?.beats_position ?? null;
  const onsetRate = LL?.rhythm?.onset_rate ?? null;
  const avgLoud = LL?.lowlevel?.average_loudness ?? null;
  const flux = LL?.lowlevel?.spectral_flux?.mean ?? null;
  const centroid = LL?.lowlevel?.spectral_centroid?.mean ?? null;
  const keyScale = LL?.tonal?.key_scale || LL?.tonal?.chords_scale || null;

  // Normalizations
  const tempoScore = tempoScoreFromBpm(bpm);
  const stability = beatStability(beats);
  const onsetScore = onsetRate == null ? 0.5 : clamp((onsetRate - 1) / 6);

  const loud = avgLoud == null ? 0.5 : clamp((avgLoud - (-30)) / 25);        // -30..-5 -> 0..1
  const fluxScore = flux == null ? 0.5 : clamp(flux / 0.1);                   // ~0..0.1 -> 0..1
  const bright = centroid == null ? 0.5 : clamp((centroid - 1000) / 3000);    // 1k..4k -> 0..1

  // Danceability
  const danceBase = pDance ?? 0.5;
  const dance = clamp(0.55*danceBase + 0.25*tempoScore + 0.15*stability + 0.05*onsetScore);

  // Energy
  const energyBase = pEnergetic ?? 0.5;
  const energy = clamp(0.6*energyBase + 0.2*loud + 0.15*fluxScore + 0.05*bright);

  // Valence
  const modeBoost = keyScale === "major" ? 0.08 : keyScale === "minor" ? -0.05 : 0;
  const tempoLift = 0.05 * tempoScore;
  const loudnessLift = 0.05 * (loud - 0.5);
  const valenceBase = (pHappy ?? 0.5)*0.75 + (1 - (pSad ?? 0.5))*0.25;
  const valence = clamp(valenceBase + modeBoost + tempoLift + loudnessLift);

  return {
    tempo: bpm ?? null,
    danceability: dance,
    energy,
    valence,
    debug: {
      pDance, pEnergetic, pHappy, pSad,
      tempoScore, stability, onsetScore, loud, fluxScore, bright, modeBoost
    }
  };
}
