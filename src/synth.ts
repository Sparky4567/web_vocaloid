import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Note } from './music';
import { SAMPLE_RATE, analyzeRegions, decodePCM, planTiming, express, joinPhrase, transitionOverlaps } from './prosody';

async function run(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const timeout = setTimeout(() => p.kill(), 20000);
  try { const [code, error] = await Promise.all([p.exited, new Response(p.stderr).text()]); if (code !== 0) throw new Error(`${args[0]} failed: ${error.slice(-300)}`); }
  finally { clearTimeout(timeout); }
}
export async function synthesize(notes: Note[], bpm: number, voice: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'chorus-'));
  try {
    const chunks: Float32Array[] = [];
    let beatCursor = 0;
    const lengths = notes.map(note => {
      const start = Math.round(beatCursor * 60 / bpm * SAMPLE_RATE);
      beatCursor += note.beats;
      return Math.round(beatCursor * 60 / bpm * SAMPLE_RATE) - start;
    });
    const overlaps = transitionOverlaps(lengths);
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]!;
      const source = join(dir, 'word.wav'), raw = join(dir, 'word.pcm'), output = join(dir, 'sung.pcm');
      await run(['espeak', '-v', voice === 'nova' ? 'en-us+f3' : voice === 'alto' ? 'en-us+m3' : 'en-us', '-s', '165', '-p', '50', '-z', '-m', '-w', source, '--', `<prosody range="0%">${note.word.replaceAll('’', "'")}</prosody>`]);
      await run(['ffmpeg', '-v', 'error', '-y', '-i', source, '-af', 'silenceremove=start_periods=1:start_duration=0.005:start_threshold=-48dB:start_silence=0.008,areverse,silenceremove=start_periods=1:start_duration=0.005:start_threshold=-48dB:start_silence=0.008,areverse', '-ar', '22050', '-ac', '1', '-f', 's16le', raw]);
      const pcm = Buffer.from(await Bun.file(raw).arrayBuffer());
      const sourceSamples = pcm.length / 2;
      // Blend beyond the scored end, without moving the next word off its beat.
      const length = lengths[i]!;
      const targetSamples = length + overlaps[i]!;
      const regions = planTiming(analyzeRegions(decodePCM(pcm)), targetSamples);
      if (!regions.length) throw new Error('The voice engine produced an empty word.');
      const hz = 440 * 2 ** ((note.midi - 69) / 12);
      const crossfade = Math.round(SAMPLE_RATE * .005);
      const graph: string[] = [];
      graph.push(`[0:a]asplit=${regions.length}${regions.map((_,j)=>`[in${j}]`).join('')}`);
      for (let j=0; j<regions.length; j++) {
        const region = regions[j]!;
        const samples = region.samples + (j < regions.length-1 ? crossfade : 0);
        const tempo = (region.end-region.start)/samples;
        // Supply neighboring audio to the stretcher, then crop it away. Starting a
        // spectral processor on a hard-cut glottal cycle produces a metallic chirp.
        const context = Math.round(SAMPLE_RATE * .06);
        const from = Math.max(0, region.start - context);
        const to = Math.min(sourceSamples, region.end + context);
        const padBefore = context - (region.start - from);
        const padAfter = context - (to - region.end);
        const crop = Math.round(context / tempo);
        const ratio = hz/region.hz;
        // Noise consonants do not need a spectral pitch shifter. Use a time-domain
        // stretcher instead, avoiding repeated phase-vocoder attacks on s/t/k sounds.
        const processors: string[] = [];
        if (region.voiced) {
          processors.push(`rubberband=tempo=${tempo}:pitch=${ratio}:formant=preserved:pitchq=quality:transients=smooth:detector=soft:smoothing=on`);
        } else {
          let remaining = tempo;
          while (remaining < .5) { processors.push('atempo=0.5'); remaining /= .5; }
          while (remaining > 2) { processors.push('atempo=2'); remaining /= 2; }
          if (Math.abs(remaining-1) > .00001) processors.push(`atempo=${remaining}`);
        }
        const filters = [
          `atrim=start_sample=${from}:end_sample=${to}`, 'asetpts=PTS-STARTPTS',
          `adelay=${padBefore}S:all=1`, `apad=pad_len=${padAfter}`, ...processors,
          `atrim=start_sample=${crop}:end_sample=${crop+samples}`, 'asetpts=PTS-STARTPTS',
          `apad=whole_len=${samples}`, `atrim=end_sample=${samples}`,
        ];
        graph.push(`[in${j}]${filters.join(',')}[part${j}]`);
      }
      let last = 'part0';
      for (let j=1; j<regions.length; j++) {
        graph.push(`[${last}][part${j}]acrossfade=ns=${crossfade}:c1=qsin:c2=qsin[join${j}]`);
        last = `join${j}`;
      }
      await run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', raw, '-filter_complex', graph.join(';'), '-map', `[${last}]`, '-f', 's16le', output]);
      const sung = decodePCM(Buffer.from(await Bun.file(output).arrayBuffer()));
      const fitted = new Float32Array(targetSamples);
      fitted.set(sung.subarray(0,targetSamples));
      chunks.push(express(fitted, regions, note.midi, notes[i-1]?.midi, notes.length > 1 ? i/(notes.length-1) : .5, i === notes.length-1));
    }
    const audio = joinPhrase(chunks, lengths, overlaps);
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + audio.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(22050, 24); header.writeUInt32LE(44100, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(audio.length, 40);
    return Buffer.concat([header, audio]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
