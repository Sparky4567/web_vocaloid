import { neuralStatus, synthesizeNeural } from '../src/neural';
import { fileURLToPath } from 'node:url';
try {
  const status=await neuralStatus();
  if(!status.ok) throw new Error(status.reason);
  console.log('Rendering a short LIEE smoke test on CPU…');
  const audio=await synthesizeNeural([{word:'Hello',midi:60,beats:1},{word:'world',midi:64,beats:2}],120);
  if(audio.readUInt32LE(24)!==44100) throw new Error('Unexpected neural sample rate.');
  let energy=0;
  for(let i=44;i+1<audio.length;i+=2) energy+=audio.readInt16LE(i)**2;
  if(energy/((audio.length-44)/2)<100) throw new Error('Neural smoke test produced silent audio.');
  const output=fileURLToPath(new URL('../models/liee-MM2.8/smoke-test.wav',import.meta.url));
  await Bun.write(output,audio);
  await Bun.write(fileURLToPath(new URL('../models/liee-MM2.8/runtime.json',import.meta.url)),JSON.stringify({verifiedAt:new Date().toISOString(),sampleRate:44100,sample:'smoke-test.wav'},null,2)+'\n');
  console.log(`LIEE neural rendering passed. Sample: ${output}`);
} catch(error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; }
