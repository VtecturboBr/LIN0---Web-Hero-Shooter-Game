import { build } from 'esbuild';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = { map: 'shoto', lino: 'lino', combat: 'combat', loadouts: 'loadouts', gameplay: 'gameplay', runtime: 'runtime' };
const selection = process.argv[2] ?? 'all';
if (selection !== 'all' && !(selection in suites)) {
  console.error(`Suíte desconhecida: ${selection}. Use all, ${Object.keys(suites).join(', ')}.`);
  process.exit(1);
}
const selected = selection === 'all' ? Object.values(suites) : [suites[selection]];
const temp = await mkdtemp(join(tmpdir(), 'lino-tests-'));
const outputs = [];
try {
  for (const name of selected) {
    const outfile = join(temp, `${name}.test.mjs`);
    outputs.push(outfile);
    await build({ entryPoints: [resolve(root, `tests/unit/${name}.test.ts`)], bundle: true, platform: 'node', format: 'esm', outfile });
  }
  const result = spawnSync(process.execPath, ['--test', ...outputs], { stdio: 'inherit', cwd: root });
  process.exitCode = result.status ?? 1;
} finally {
  for (const output of outputs) await unlink(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await rmdir(temp);
}
