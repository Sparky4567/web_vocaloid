import { expect, test } from 'bun:test';
import { SAMPLE_RATE, analyzeRegions, planTiming, express, joinPhrase, interpolateSample, transitionOverlaps, type Region } from './prosody';
import { synthesize } from './synth';

function tone(hz: number, seconds: number) {
  return Float32Array.from({length: Math.round(seconds*SAMPLE_RATE)}, (_,i)=> .3*Math.sin(2*Math.PI*hz*i/SAMPLE_RATE));
}
function crossingPitch(audio: Float32Array, from: number, to: number) {
  let crossings = 0;
  for (let i=Math.round(from*SAMPLE_RATE)+1; i<Math.round(to*SAMPLE_RATE); i++) if (audio[i-1]!<0 && audio[i]!>=0) crossings++;
  return crossings/(to-from);
}

test('Pitch analysis recognizes low and high vowels without octave errors', () => {
  for (const hz of [110,220,330,440]) {
    const regions = analyzeRegions(tone(hz,.4));
    expect(regions.some(r=>r.voiced)).toBe(true);
    expect(Math.abs(regions.find(r=>r.voiced)!.hz-hz)/hz).toBeLessThan(.025);
  }
  expect(analyzeRegions(new Float32Array(5000)).every(r=>!r.voiced)).toBe(true);
});

test('Long notes extend the vowel while preserving consonant timing', () => {
  const regions: Region[] = [
    {start:0,end:2205,voiced:false,hz:0},
    {start:2205,end:6615,voiced:true,hz:220},
    {start:6615,end:8820,voiced:false,hz:0},
  ];
  const long = planTiming(regions,22050);
  expect(long.map(r=>r.samples)).toEqual([2205,17640,2205]);
  for (const length of [3675,5000,22051]) {
    const plan=planTiming(regions,length);
    expect(plan.reduce((s,r)=>s+r.samples,0)).toBe(length);
    expect(plan.every(r=>r.samples>0)).toBe(true);
  }
  expect(planTiming([{start:0,end:2000,voiced:false,hz:0}],1000)[0]!.samples).toBe(1000);
});

test('Expression keeps pitch centered, adds delayed movement, and releases cleanly', () => {
  const source=tone(220,1.2);
  const regions=planTiming([{start:0,end:source.length,voiced:true,hz:220}],source.length);
  const expressed=express(source,regions,57,undefined,.5,true);
  expect(expressed.length).toBe(source.length);
  expect(crossingPitch(expressed,.25,1.05)).toBeCloseTo(220,0);
  expect(Math.abs(expressed[expressed.length-1]!)).toBeLessThan(.001);
  let change=0; for(let i=5000;i<15000;i++) change+=Math.abs(expressed[i]!-source[i]!);
  expect(change/10000).toBeGreaterThan(.01);
  const unvoiced = express(source,planTiming([{start:0,end:source.length,voiced:false,hz:0}],source.length),57,undefined,.5,false);
  expect(unvoiced[6000]).toBeCloseTo(source[6000]!,5);
});

test('Legato joins retain exact length, keep boundary energy, and prevent clipping', () => {
  const length=11025, overlap=265;
  const joined=joinPhrase([tone(220,(length+overlap)/SAMPLE_RATE),tone(330,length/SAMPLE_RATE)],[length,length],overlap);
  expect(joined.length).toBe(length*4);
  let peak=0, energy=0;
  for(let i=length-100;i<length+overlap;i++) energy+=(joined.readInt16LE(i*2)/32768)**2;
  for(let i=0;i<joined.length;i+=2) peak=Math.max(peak,Math.abs(joined.readInt16LE(i)));
  expect(energy/365).toBeGreaterThan(.01);
  expect(peak).toBeLessThanOrEqual(Math.ceil(.92*32767));
});

test('All voices render fast consonants, contractions, and long words on the beat', async () => {
  for (const voice of ['nova','alto','classic']) {
    const notes=[{word:'stars',midi:voice==='alto'?48:72,beats:.5},{word:'we’re',midi:67,beats:.5},{word:'together',midi:60,beats:2}];
    const wav=await synthesize(notes,180,voice);
    expect(wav.length-44).toBe(22050*2);
    let energy=0; for(let i=44;i<wav.length;i+=2) energy+=wav.readInt16LE(i)**2;
    expect(energy/(wav.length/2)).toBeGreaterThan(10000);
  }
},30000);


test('Fractional pitch delays preserve bright harmonics instead of adding moving coloration', () => {
  const hz = 6000, audio = tone(hz,.1);
  for (const delay of [.15,.5,.85]) {
    let error=0, count=0;
    for(let i=16;i<audio.length-16;i++) {
      const expected=.3*Math.sin(2*Math.PI*hz*(i+delay)/SAMPLE_RATE);
      error+=(interpolateSample(audio,i+delay)-expected)**2;
      count++;
    }
    expect(Math.sqrt(error/count)).toBeLessThan(.005);
  }
});

test('Later words enter without a repeated pitch scoop', () => {
  const source=tone(220,.35);
  const regions=planTiming([{start:0,end:source.length,voiced:true,hz:220}],source.length);
  // Under 380 ms there is no vibrato; after the attack this should be unchanged.
  const next=express(source,regions,69,48,.5,false);
  let error=0;
  for(let i=250;i<2000;i++) error+=Math.abs(next[i]!-source[i]!);
  expect(error/1750).toBeLessThan(.00001);
});


test('Legato transitions adapt to fast notes without consuming articulation', () => {
  const lengths=[22050,3675,22050,22050];
  const overlaps=transitionOverlaps(lengths);
  expect(overlaps).toEqual([735,735,1543,0]);
  const chunks=lengths.map((length,i)=>tone(220,(length+overlaps[i]!)/SAMPLE_RATE));
  const pcm=joinPhrase(chunks,lengths,overlaps);
  expect(pcm.length).toBe(lengths.reduce((a,b)=>a+b,0)*2);
  // Constant tones retain their energy through each full transition, not just its midpoint.
  let cursor=0;
  for(let i=0;i<lengths.length-1;i++) {
    cursor+=lengths[i]!;
    let energy=0;
    for(let j=cursor;j<cursor+overlaps[i]!;j++) energy+=(pcm.readInt16LE(j*2)/32768)**2;
    expect(energy/overlaps[i]!).toBeGreaterThan(.02);
  }
});
