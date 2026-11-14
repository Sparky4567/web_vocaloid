import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Note } from './music';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = join(root, 'scripts/neural_runtime.py');
async function python() {
  const local = join(root,'.venv/bin/python');
  return process.env.CHORUS_PYTHON || (await Bun.file(local).exists() ? local : 'python3');
}
export type NeuralStatus = {ok: boolean; name?: string; sampleRate?: number; reason?: string};
export async function neuralStatus(): Promise<NeuralStatus> {
  try {
    const child = Bun.spawn([await python(), runtime, 'check'], {cwd:root, stdout:'pipe', stderr:'pipe', env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    const timer = setTimeout(()=>child.kill(),10000);
    try {
      const [output, error, code] = await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
      if (code !== 0) return {ok:false,reason:error.trim() || 'Run bun run model:setup to prepare LIEE.'};
      return JSON.parse(output) as NeuralStatus;
    } finally { clearTimeout(timer); }
  } catch { return {ok:false,reason:'Run bun run model:setup to prepare LIEE.'}; }
}
export async function synthesizeNeural(notes: Note[], bpm: number): Promise<Buffer> {
  const folder=await mkdtemp(join(tmpdir(),'chorus-neural-'));
  try {
    const score=join(folder,'score.json'), wav=join(folder,'phrase.wav');
    await Bun.write(score,JSON.stringify({notes,bpm}));
    const child=Bun.spawn([await python(),runtime,'render','--input',score,'--output',wav],{cwd:root,stdout:'pipe',stderr:'pipe',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true; child.kill();},240000);
    try {
      const [code, error] = await Promise.all([child.exited,new Response(child.stderr).text(),new Response(child.stdout).text()]);
      if (timedOut) throw new Error('LIEE rendering exceeded four minutes. Try a shorter phrase.');
      if (code !== 0) throw new Error(error.trim().split('\n').at(-1) || 'LIEE rendering failed.');
      const audio=Buffer.from(await Bun.file(wav).arrayBuffer());
      if (audio.length<44 || audio.toString('ascii',0,4)!=='RIFF' || audio.toString('ascii',8,12)!=='WAVE') throw new Error('LIEE did not produce a valid WAV.');
      return audio;
    } finally { clearTimeout(timer); }
  } finally { await rm(folder,{recursive:true,force:true}); }
}
