import { expect, test } from 'bun:test';
import { compose, noteName, words } from './music';
import { synthesize } from './synth';
test('English contractions stay together; punctuation is excluded', () => {
  expect(words("We're singing, don't you know? ✦")).toEqual(["We're", 'singing', "don't", 'you', 'know']);
  expect(compose('', 'daydream', 60)).toEqual([]);
});
test('Melodies follow key, pattern and phrase ending', () => {
  const notes = compose('We sing together', 'bittersweet', 62);
  expect(notes.map(n => n.midi)).toEqual([62,65,69]);
  expect(notes.map(n => n.beats)).toEqual([1.5,1.5,3]);
  expect(noteName(60)).toBe('C4');
});
test('Local synthesis produces timed, non-silent PCM WAV from a two-note phrase', async () => {
  const wav = await synthesize([{word:'Hello', midi:60, beats:1}, {word:'world', midi:67, beats:2}], 120, 'nova');
  expect(wav.toString('ascii',0,4)).toBe('RIFF');
  expect(wav.toString('ascii',8,12)).toBe('WAVE');
  expect(wav.readUInt32LE(24)).toBe(22050);
  expect(wav.readUInt32LE(40)).toBe(wav.length-44);
  expect((wav.length-44)/44100).toBeCloseTo(1.5, 2);
  let energy=0; for(let i=44;i<wav.length;i+=2) energy+=wav.readInt16LE(i)**2;
  expect(energy/(wav.length/2)).toBeGreaterThan(10000);
  await Bun.write('/tmp/chorus-test.wav', wav);
}, 30000);

test('Render endpoint rejects invalid payloads before starting synthesis', async () => {
  const {renderRequest} = await import('./api');
  const post = (value: unknown) => renderRequest(new Request('http://localhost/api/render', {method:'POST', body: JSON.stringify(value)}));
  for (const value of [null, {}, {notes:[], bpm:120, voice:'nova'}, {notes:[{word:'--help', midi:60, beats:1}], bpm:120, voice:'nova'}, {notes:[{word:'hello', midi:60, beats:1}], bpm:0, voice:'nova'}]) {
    expect((await post(value)).status).toBe(400);
  }
  expect((await renderRequest(new Request('http://localhost/api/render', {method:'POST', body:'{'}))).status).toBe(400);
  expect((await post({text:'x'.repeat(25000)})).status).toBe(413);
});

test('Render endpoint returns downloadable WAV for valid lyrics', async () => {
  const {renderRequest} = await import('./api');
  const response = await renderRequest(new Request('http://localhost/api/render', {method:'POST', body:JSON.stringify({notes:compose('Sing with me', 'daydream', 60), bpm:120, voice:'classic'})}));
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('audio/wav');
  const audio=Buffer.from(await response.arrayBuffer());
  expect(audio.toString('ascii',0,4)).toBe('RIFF');
  expect(audio.length).toBeGreaterThan(44100);
}, 30000);
