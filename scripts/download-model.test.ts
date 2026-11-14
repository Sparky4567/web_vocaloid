import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checksum, verifyArchive } from './download-model';

test('Model download verification accepts exact bytes and rejects damaged downloads', async () => {
  const directory=await mkdtemp(join(tmpdir(),'chorus-download-'));
  try {
    const path=join(directory,'fixture');
    await Bun.write(path,'abc');
    const expected='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    expect(await checksum(path)).toBe(expected);
    await verifyArchive(path,expected);
    await Bun.write(path,'truncated');
    await expect(verifyArchive(path,expected)).rejects.toThrow('Checksum mismatch');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
