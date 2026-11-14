/** Server-side PCM analysis and expression; no browser audio dependencies. */
export const SAMPLE_RATE = 22050;
const FRAME = 882; // 40 ms captures at least three periods of a low singing voice.
const HOP = 220;
export type Region = { start: number; end: number; voiced: boolean; hz: number };
export type TimedRegion = Region & { samples: number };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function decodePCM(pcm: Buffer): Float32Array {
  return Float32Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
}

function pitchAt(audio: Float32Array, start: number): { hz: number; confidence: number; rms: number } {
  const size = Math.min(FRAME, audio.length - start);
  let mean = 0, energy = 0;
  for (let i = 0; i < size; i++) mean += audio[start + i]!;
  mean /= size;
  for (let i = 0; i < size; i++) energy += (audio[start + i]! - mean) ** 2;
  const rms = Math.sqrt(energy / size);
  if (rms < .008 || size < 600) return { hz: 0, confidence: 0, rms };
  const correlations: number[] = [];
  // Search 75–500 Hz, with normalized correlation to resist amplitude changes.
  for (let lag = 44; lag <= 294; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i < size - 294; i++) {
      const a = audio[start + i]! - mean, b = audio[start + i + lag]! - mean;
      xy += a * b; xx += a * a; yy += b * b;
    }
    correlations[lag] = xy / Math.sqrt(xx * yy + 1e-15);
  }
  const best = Math.max(...correlations.slice(44));
  // Prefer the first strong local peak: later integer multiples cause octave errors.
  let lagBest = 0;
  for (let lag = 45; lag < 294; lag++) {
    const c = correlations[lag]!;
    if (c >= best * .96 && c >= correlations[lag - 1]! && c >= correlations[lag + 1]!) { lagBest = lag; break; }
  }
  return { hz: lagBest ? SAMPLE_RATE / lagBest : 0, confidence: best, rms };
}

export function analyzeRegions(audio: Float32Array): Region[] {
  if (!audio.length) return [];
  const frames = Array.from({ length: Math.max(1, Math.ceil(audio.length / HOP)) }, (_, i) => {
    const center = i * HOP;
    const measured = pitchAt(audio, clamp(center - FRAME / 2, 0, Math.max(0, audio.length - FRAME)));
    return { ...measured, voiced: measured.confidence > .72 && measured.hz > 0 };
  });
  // Avoid fragmenting a vowel around a single irregular glottal cycle.
  for (let i = 1; i < frames.length - 1; i++) {
    if (frames[i - 1]!.voiced && frames[i + 1]!.voiced && frames[i]!.rms > .008) frames[i]!.voiced = true;
  }
  const regions: Region[] = [];
  let first = 0;
  for (let i = 1; i <= frames.length; i++) {
    if (i < frames.length && frames[i]!.voiced === frames[first]!.voiced) continue;
    const pitches = frames.slice(first, i).map(f => f.hz).filter(Boolean).sort((a,b) => a-b);
    regions.push({ start: first * HOP, end: Math.min(audio.length, i * HOP), voiced: frames[first]!.voiced, hz: pitches[Math.floor(pitches.length / 2)] ?? 150 });
    first = i;
  }
  // Tiny slices are unsuitable for an independent time stretcher; fold into neighbors.
  for (let i = 0; i < regions.length && regions.length > 1;) {
    if (regions[i]!.end - regions[i]!.start >= SAMPLE_RATE * .035) { i++; continue; }
    if (i > 0) { regions[i - 1]!.end = regions[i]!.end; regions.splice(i, 1); }
    else { regions[1]!.start = 0; regions.shift(); }
  }
  return regions;
}

/** Preserve articulation; put additional singing time into periodic vowel-like sounds. */
export function planTiming(regions: Region[], targetSamples: number): TimedRegion[] {
  if (!regions.length) return [];
  const source = regions.reduce((sum,r) => sum + r.end-r.start, 0);
  const consonants = regions.filter(r => !r.voiced).reduce((sum,r) => sum + r.end-r.start, 0);
  const voiced = source - consonants;
  const consonantBudget = voiced ? Math.min(consonants, targetSamples * consonants / source, targetSamples * .45) : targetSamples;
  const vowelBudget = targetSamples - consonantBudget;
  let used = 0;
  return regions.map((r, i) => {
    const budget = r.voiced ? vowelBudget : consonantBudget;
    const weight = (r.end-r.start) / Math.max(1, r.voiced ? voiced : consonants);
    const samples = i === regions.length - 1 ? targetSamples - used : Math.round(budget * weight);
    used += samples;
    return { ...r, samples };
  });
}

// A moving linear interpolator dulls upper harmonics by a varying amount as its
// fractional delay changes, producing a buzzy/metallic onset on bright voices.
// A normalized windowed-sinc delay preserves their level during pitch expression.
const INTERPOLATION_RADIUS = 8;
const INTERPOLATION_PHASES = 1024;
const sinc = (x: number) => Math.abs(x) < 1e-10 ? 1 : Math.sin(Math.PI*x)/(Math.PI*x);
const delayKernels = Array.from({length: INTERPOLATION_PHASES}, (_, phase) => {
  const fraction = phase/INTERPOLATION_PHASES;
  const kernel = Float64Array.from({length: INTERPOLATION_RADIUS*2}, (_, tap) => {
    const x = tap-(INTERPOLATION_RADIUS-1)-fraction;
    return sinc(x)*sinc(x/INTERPOLATION_RADIUS);
  });
  const sum = kernel.reduce((a,b)=>a+b,0);
  return kernel.map(value=>value/sum);
});
export function interpolateSample(audio: Float32Array, position: number): number {
  if (!audio.length) return 0;
  const safe = clamp(position,0,audio.length-1);
  const left = Math.floor(safe), fraction = safe-left;
  const phase = Math.min(INTERPOLATION_PHASES-1, Math.round(fraction*INTERPOLATION_PHASES));
  if (!phase) return audio[left]!;
  const kernel = delayKernels[phase]!;
  let result = 0;
  for (let tap=0; tap<kernel.length; tap++) {
    const index = clamp(left+tap-(INTERPOLATION_RADIUS-1),0,audio.length-1);
    result += audio[index]!*kernel[tap]!;
  }
  return result;
}

/** One phrase entrance, delayed vibrato, and a small phrase-level dynamic arc. */
export function express(audio: Float32Array, regions: TimedRegion[], midi: number, previousMidi: number | undefined, phrasePosition: number, final: boolean): Float32Array {
  const out = new Float32Array(audio.length);
  const duration = audio.length / SAMPLE_RATE;
  const voiced = new Float32Array(audio.length);
  let offset = 0;
  for (const region of regions) {
    if (region.voiced) {
      const ramp = Math.min(220, region.samples / 3);
      for (let j=0; j<region.samples && offset+j<voiced.length; j++) voiced[offset+j] = Math.min(1, j/ramp, (region.samples-1-j)/ramp);
    }
    offset += region.samples;
  }
  const onset = Math.max(0, voiced.findIndex(v => v > .5)) / SAMPLE_RATE;
  let displacement = 0;
  // Repeating a scoop on every word creates an audible pitch chirp. Only the
  // phrase's first entrance gets a small scoop; subsequent words enter on pitch.
  const scoop = previousMidi === undefined ? -18 : 0;
  for (let i=0; i<audio.length; i++) {
    const t = i/SAMPLE_RATE, age = Math.max(0,t-onset);
    const vibrato = duration > .38 ? 19 * clamp((age-.18)/.22,0,1) * Math.sin(2*Math.PI*5.2*age) : 0;
    const cents = (scoop * Math.exp(-age/.035) + vibrato) * voiced[i]!;
    displacement += 2 ** (cents/1200) - 1;
    const position = clamp(i+displacement,0,audio.length-1);
    const sample = interpolateSample(audio, position);
    const arc = .94 + .06*Math.sin(Math.PI*phrasePosition);
    const attack = Math.min(1, i/(SAMPLE_RATE*.004));
    const release = final ? Math.min(1,(audio.length-1-i)/(SAMPLE_RATE*.065)) : 1;
    out[i] = sample * arc * attack * release;
  }
  return out;
}

/** Long notes can blend for 70 ms; fast notes keep enough room for articulation. */
export function transitionOverlaps(lengths: readonly number[]): number[] {
  return lengths.map((length, i) => i === lengths.length-1 ? 0 : Math.max(0, Math.floor(Math.min(
    SAMPLE_RATE * .07, length * .2, lengths[i+1]! * .2,
  ))));
}

/** Smooth equal-power joins preserve beat positions and avoid a separate attack per word. */
export function joinPhrase(chunks: Float32Array[], lengths: number[], overlaps: number | readonly number[]): Buffer {
  const mix = new Float32Array(lengths.reduce((a,b)=>a+b,0));
  let offset = 0;
  for (let n=0; n<chunks.length; n++) {
    const chunk = chunks[n]!;
    const incoming = n > 0 ? typeof overlaps === 'number' ? overlaps : overlaps[n-1]! : 0;
    const outgoing = n < chunks.length-1 ? typeof overlaps === 'number' ? overlaps : overlaps[n]! : 0;
    const phase = (sample: number, span: number) => {
      const t = clamp(sample/Math.max(1,span-1),0,1);
      return (t*t*(3-2*t))*Math.PI/2;
    };
    for (let i=0; i<chunk.length && offset+i<mix.length; i++) {
      let gain = 1;
      if (incoming && i<incoming) gain *= Math.sin(phase(i,incoming));
      if (outgoing && i>=lengths[n]!) gain *= Math.cos(phase(i-lengths[n]!,outgoing));
      mix[offset+i] = mix[offset+i]! + chunk[i]!*gain;
    }
    offset += lengths[n]!;
  }
  let peak = 0;
  for (const sample of mix) peak = Math.max(peak, Math.abs(sample));
  const gain = peak ? Math.min(2, .92/peak) : 1;
  const pcm = Buffer.alloc(mix.length*2);
  for (let i=0; i<mix.length; i++) pcm.writeInt16LE(Math.round(clamp(mix[i]!*gain,-1,1)*32767),i*2);
  return pcm;
}
