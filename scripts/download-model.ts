import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Pinned to the author's release, including its GitHub-published SHA-256.
export const MODEL = {
  name: "LIEE : Immortal Idol 'Lilia' — JubiLIEE 2025 1.1",
  author: 'julieraptor',
  release: 'https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/releases/tag/MM2.8',
  url: 'https://github.com/julieraptor/DIFFSINGER-LIEE-Immortal-Idol/releases/download/MM2.8/Diffsinger.LIEE.Immortal.Idol.MM.2.8.JubiLIEE.2025.1.1.zip',
  sha256: 'd9fd90e61186f6397c148e3817832bd547d1f13b2ba7ba3d812efe020328fa12',
  terms: 'https://docs.google.com/document/d/1t13WKc7VA2Q3G_MppznbAwhl3vLIL2MNPyjVN3kWDDg/edit',
};
export const modelDirectory = fileURLToPath(new URL('../models/liee-MM2.8/', import.meta.url));
export async function checksum(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function verifyArchive(path: string, expected = MODEL.sha256): Promise<void> {
  if (await checksum(path) !== expected) throw new Error(`Checksum mismatch for ${path}. The file was not installed. Remove the incomplete file and retry.`);
}
export async function downloadModel(directory = modelDirectory): Promise<void> {
  if (!Bun.which('curl')) throw new Error('curl is required to download the model.');
  await mkdir(directory, {recursive: true});
  const archive = join(directory, 'voicebank.zip');
  const partial = `${archive}.partial`;
  console.log(`Model: ${MODEL.name}\nAuthor: ${MODEL.author}\nRelease: ${MODEL.release}\nTerms of use: ${MODEL.terms}`);
  console.log('LIEE is not MIT-licensed. Read VOICE_MODEL_RIGHTS.md and the current creator terms before use. Credit published vocals as LIEE. Hosting requires prior permission; model monetization, training, and generative AI uses are restricted.');
  console.log('This downloads the singing voicebank only; it does not install a rendering engine.');
  if (await Bun.file(archive).exists()) {
    await verifyArchive(archive);
    console.log(`Verified existing download: ${archive}`);
    return;
  }
  console.log('Downloading approximately 581 MB. Interrupted downloads can be resumed by running this command again.');
  // Stream to disk rather than keeping this large archive in RAM. Arguments are
  // passed directly to curl; neither a shell nor downloaded executable is run.
  const process = Bun.spawn(['curl', '--fail', '--location', '--show-error', '--proto', '=https', '--proto-redir', '=https',
    '--connect-timeout', '15', '--max-time', '3600', '--continue-at', '-', '--output', partial, MODEL.url],
    {stdout: 'inherit', stderr: 'inherit'});
  const code = await process.exited;
  if (code !== 0) throw new Error(`Download failed (curl exit ${code}). Check DNS/network access to github.com and its release-asset hosts, then rerun bun run model:download. No model has been installed.`);
  await verifyArchive(partial);
  await rename(partial, archive);
  await Bun.write(join(directory, 'download.json'), JSON.stringify({...MODEL, archive: 'voicebank.zip', bytes: (await stat(archive)).size, verifiedAt: new Date().toISOString(), renderingReady: false}, null, 2)+'\n');
  console.log(`Verified download: ${archive}\nNext: run bun run model:setup to install the local runtime and test neural rendering.`);
}
if (import.meta.main) {
  try { await downloadModel(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
