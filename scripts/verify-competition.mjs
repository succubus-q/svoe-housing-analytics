import assert from 'node:assert/strict';
import console from 'node:console';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'docs/competition');
const required = [
  'README',
  'project-summary',
  'architecture',
  'data-flow',
  'api-integration',
  'analytics',
  'testing',
  'limitations',
  'presentation-outline',
  'presentation-content',
  'defense-script',
  'defense-questions',
  'screenshots',
  'submission-checklist',
];
for (const name of required) {
  assert.ok((await stat(path.join(directory, `${name}.md`))).size > 100, name);
}
let links = 0;
const files = (await readdir(directory)).filter((file) => file.endsWith('.md'));
files.push('../../README.md');
for (const file of files) {
  const filename = path.resolve(directory, file);
  const content = await readFile(filename, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(filename), decodeURIComponent(target));
    assert.ok(await stat(resolved).catch(() => null), `${file}: broken link ${target}`);
    links++;
  }
}
const slides = await readFile(path.join(directory, 'presentation-content.md'), 'utf8');
assert.equal([...slides.matchAll(/^## Слайд \d+\./gm)].length, 9);
const questions = await readFile(path.join(directory, 'defense-questions.md'), 'utf8');
assert.ok([...questions.matchAll(/^## \d+\./gm)].length >= 25);
const architecture = await readFile(path.join(directory, 'architecture.md'), 'utf8');
const flow = await readFile(path.join(directory, 'data-flow.md'), 'utf8');
for (const [file, source] of [
  ['architecture', architecture],
  ['concurrent-sync', architecture],
  ['data-flow', flow],
]) {
  const mermaid = (
    await readFile(path.join(root, `assets/competition/diagrams/${file}.mmd`), 'utf8')
  ).trim();
  assert.ok(source.includes(mermaid), `Mermaid source and document differ: ${file}`);
}
for (const name of ['architecture', 'data-flow', 'synchronization', 'concurrent-sync']) {
  assert.ok((await stat(path.join(root, `assets/competition/diagrams/${name}.mmd`))).size > 100);
}
console.log(
  `Competition documents OK: ${required.length} required files, 9 slides, >=25 answers, ${links} local links, 4 Mermaid sources.`,
);
console.log(
  'Mermaid source consistency checked. Rendering, screenshot capture and binary presentation export are not covered.',
);
