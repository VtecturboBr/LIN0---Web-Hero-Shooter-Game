import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const artifacts = resolve(root, 'artifacts/browser');

/** All browser captures go to the ignored artifacts folder, never the project root. */
export function writeArtifact(filename, data) {
  const output = resolve(artifacts, filename.replace(/^artifacts\//, ''));
  const relativePath = relative(artifacts, output);
  if (isAbsolute(relativePath) || relativePath.startsWith('..')) throw new Error('Artifact path outside artifacts/browser');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, data);
}
