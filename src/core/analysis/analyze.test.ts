import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createFixture, type Fixture } from '../../test-helpers/fixtures.js';
import { UsageError } from '../../utils/errors.js';
import { analyzeCodebase } from './analyze.js';
import { type CodebaseAnalysis, type FileAnalysis } from './types.js';

/** Content with a NUL byte in it: data that happens to carry a source extension. */
const NOT_TEXT = 'PK\u0000binary';

function file(analysis: CodebaseAnalysis, path: string): FileAnalysis {
  const found = analysis.files.find((candidate) => candidate.path === path);
  assert.ok(found !== undefined, `expected ${path} to have been analysed`);
  return found;
}

describe('analyzeCodebase', () => {
  const fixtures: Fixture[] = [];

  after(async () => {
    await Promise.all(fixtures.map((fixture) => fixture.cleanup()));
  });

  async function tree(files: Readonly<Record<string, string>> = {}): Promise<string> {
    const created = await createFixture(files);
    fixtures.push(created);
    return created.path;
  }

  it('reports an empty analysis for a directory with no source', async () => {
    const analysis = await analyzeCodebase(await tree({ 'README.md': '# hi' }));

    assert.deepEqual(analysis.files, []);
    assert.deepEqual(analysis.skipped, []);
    assert.equal(analysis.summary.files, 0);
    assert.equal(analysis.summary.symbols.total, 0);
  });

  it('analyses a TypeScript project across nested directories', async () => {
    const root = await tree({
      'src/money.ts':
        'export type Money = number;\nexport function format(m: Money) { return String(m); }\n',
      'src/cart/index.ts': [
        "import { format, type Money } from '../money.js';",
        'export interface Item { readonly price: Money }',
        'export class Cart {',
        '  add(item: Item) { return format(item.price); }',
        '}',
        '',
      ].join('\n'),
    });

    const analysis = await analyzeCodebase(root);

    assert.equal(analysis.root, root);
    assert.deepEqual(
      analysis.files.map((entry) => entry.path),
      ['src/cart/index.ts', 'src/money.ts'],
    );
    assert.deepEqual(analysis.graph.dependencies['src/cart/index.ts'], ['src/money.ts']);
    assert.deepEqual(analysis.graph.symbolEdges.map((edge) => edge.exported).sort(), [
      'Money',
      'format',
    ]);
    assert.equal(analysis.summary.symbols.interface, 1);
    assert.equal(analysis.summary.symbols.class, 1);
    assert.equal(analysis.summary.symbols.method, 1);
  });

  it('analyses CommonJS JavaScript', async () => {
    const root = await tree({
      'lib/math.js': 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n',
      'lib/main.js': "const math = require('./math.js');\nmodule.exports = math.add;\n",
    });

    const analysis = await analyzeCodebase(root);

    assert.equal(file(analysis, 'lib/math.js').language, 'javascript');
    assert.deepEqual(analysis.graph.dependencies['lib/main.js'], ['lib/math.js']);
    assert.equal(analysis.summary.localImports, 1);
  });

  it('marks declarations exported through a separate export statement', async () => {
    const root = await tree({ 'a.ts': 'function total() { return 0; }\nexport { total };\n' });

    const analysis = await analyzeCodebase(root);

    assert.equal(file(analysis, 'a.ts').symbols[0]?.exported, true);
  });

  it('finds React components and their tests', async () => {
    const root = await tree({
      'src/Button.tsx': 'export const Button = () => <button />;\n',
      'src/Button.test.tsx': [
        "import { Button } from './Button.js';",
        "describe('Button', () => {",
        "  it('renders', () => { Button(); });",
        '});',
        '',
      ].join('\n'),
    });

    const analysis = await analyzeCodebase(root);

    assert.equal(analysis.summary.symbols.component, 1);
    assert.equal(analysis.summary.testFiles, 1);
    assert.equal(analysis.summary.tests, 2);
    assert.equal(file(analysis, 'src/Button.test.tsx').testFile, true);
    assert.equal(file(analysis, 'src/Button.tsx').testFile, false);
  });

  it('finds API routes across the frameworks it knows', async () => {
    const root = await tree({
      'src/server.js':
        "const app = require('express')();\napp.get('/health', (req, res) => res.end());\n",
      'app/users/route.ts': 'export async function GET() { return new Response(); }\n',
      'pages/api/ping.ts': 'export default function handler() {}\n',
    });

    const analysis = await analyzeCodebase(root);
    const routes = analysis.files.flatMap((entry) =>
      entry.routes.map((route) => `${route.method} ${route.path}`),
    );

    assert.deepEqual(routes.sort(), ['ALL /api/ping', 'GET /health', 'GET /users']);
    assert.equal(analysis.summary.routes, 3);
  });

  it('reports what it can read from malformed source and carries on', async () => {
    const root = await tree({
      'ok.ts': 'export const fine = 1;\n',
      'broken.ts': 'export function works() {}\nfunction ((( not valid\n',
    });

    const analysis = await analyzeCodebase(root);

    assert.equal(analysis.files.length, 2);
    assert.deepEqual(analysis.skipped, []);
    assert.deepEqual(
      file(analysis, 'broken.ts').symbols.map((symbol) => symbol.name),
      ['works'],
    );
  });

  it('handles empty files', async () => {
    const analysis = await analyzeCodebase(await tree({ 'empty.ts': '', 'blank.js': '\n\n' }));

    assert.equal(analysis.files.length, 2);
    assert.equal(file(analysis, 'empty.ts').lines, 0);
    assert.equal(file(analysis, 'blank.js').lines, 2);
    assert.equal(analysis.summary.symbols.total, 0);
  });

  it('skips a file that is not text', async () => {
    const root = await tree({ 'ok.ts': 'export const a = 1;\n', 'blob.js': NOT_TEXT });

    const analysis = await analyzeCodebase(root);

    assert.deepEqual(
      analysis.files.map((entry) => entry.path),
      ['ok.ts'],
    );
    assert.deepEqual(analysis.skipped, [{ path: 'blob.js', reason: 'file is not text' }]);
    assert.equal(analysis.summary.skipped, 1);
  });

  it('counts imports by where they resolve to', async () => {
    const root = await tree({
      'a.ts': "import './b.js';\nimport 'express';\nimport 'node:fs';\nimport './gone.js';\n",
      'b.ts': 'export const b = 1;\n',
    });

    const analysis = await analyzeCodebase(root);

    assert.equal(analysis.summary.imports, 4);
    assert.equal(analysis.summary.localImports, 1);
    assert.equal(analysis.summary.externalImports, 2);
    assert.equal(analysis.summary.unresolvedImports, 1);
  });

  it('rejects a path that does not exist', async () => {
    await assert.rejects(analyzeCodebase('/definitely/not/here'), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /Cannot read directory/);
      return true;
    });
  });

  it('rejects a path that is a file', async () => {
    const root = await tree({ 'a.ts': '' });

    await assert.rejects(analyzeCodebase(`${root}/a.ts`), (error: unknown) => {
      assert.ok(error instanceof UsageError);
      assert.match(error.message, /Not a directory/);
      return true;
    });
  });

  it('produces the same result twice for the same tree', async () => {
    const root = await tree({
      'src/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    });

    assert.deepEqual(await analyzeCodebase(root), await analyzeCodebase(root));
  });
});
