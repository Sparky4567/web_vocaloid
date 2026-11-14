import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function run(args: string[]) {
  const child = Bun.spawn(args, {cwd: root, stdout: 'inherit', stderr: 'inherit', env: {...process.env, UV_CACHE_DIR: join(root,'models/runtime-cache'), PYTHONDONTWRITEBYTECODE: '1'}});
  if (await child.exited !== 0) throw new Error(`Setup could not finish: ${args.slice(0,3).join(' ')}. If network access is blocked here, run bun run model:setup in your normal terminal.`);
}
try {
  if (!await Bun.file(join(root,'models/liee-MM2.8/voicebank.zip')).exists()) throw new Error('Download the voicebank first with bun run model:download.');
  if (!Bun.which('uv')) throw new Error('Install uv, then rerun bun run model:setup.');
  if (!await Bun.file(join(root,'.venv/bin/python')).exists()) await run(['uv','venv','--python','3.12','.venv']);
  await run(['.venv/bin/python','-c','import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required; rename .venv and rerun setup to create Python 3.12."']);
  await run(['.venv/bin/python','scripts/neural_runtime.py','prepare']);
  await run(['uv','pip','install','--python','.venv/bin/python','-r','scripts/neural-requirements.txt']);
  await run([process.execPath,'scripts/check-model.ts']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
