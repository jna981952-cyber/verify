import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summariseAnalysis } from '../core/analysis/analyze.js';
import { analyzeSource } from '../core/analysis/file.js';
import { buildGraph } from '../core/analysis/graph.js';
import { type CodebaseAnalysis, type SkippedFile } from '../core/analysis/types.js';
import { type AnalysisReport } from '../core/report.js';
import { createPalette } from '../utils/color.js';
import { formatAnalysisJson, formatAnalysisText } from './analysis.js';
import { formatAnalysisReport } from './index.js';

const ESC = String.fromCharCode(27);

const plain = createPalette(false);
const colourful = createPalette(true);

/** Builds a report from source text, so the fixtures stay readable. */
function report(
  sources: Readonly<Record<string, string>>,
  skipped: readonly SkippedFile[] = [],
): AnalysisReport {
  const files = Object.entries(sources).map(([path, text]) =>
    analyzeSource(path, text, text.length),
  );
  const graph = buildGraph(files);
  const analysis: CodebaseAnalysis = {
    root: '/workspace/demo',
    files,
    skipped,
    graph,
    summary: summariseAnalysis(files, skipped, graph),
  };

  return { tool: { name: 'verify', version: '1.2.3' }, target: '/workspace/demo', analysis };
}

describe('formatAnalysisText', () => {
  it('opens with the file count and the directory', () => {
    const output = formatAnalysisText(report({ 'a.ts': 'export const a = 1;\n' }), plain);

    assert.match(output, /^Analysed 1 file under \/workspace\/demo$/m);
    assert.match(output, /^ {2}1 line of source$/m);
  });

  it('counts declarations by kind, in singular and plural', () => {
    const output = formatAnalysisText(
      report({
        'a.ts': [
          'export function one() {}',
          'export function two() {}',
          'export class C { go() {} }',
          'export interface I { x: number }',
          '',
        ].join('\n'),
      }),
      plain,
    );

    assert.match(output, /^Symbols:$/m);
    assert.match(output, /^ {2}2 functions$/m);
    assert.match(output, /^ {2}1 class$/m);
    assert.match(output, /^ {2}1 method$/m);
    assert.match(output, /^ {2}1 interface$/m);
  });

  it('leaves out kinds with nothing to count', () => {
    const output = formatAnalysisText(report({ 'a.ts': 'export const a = 1;\n' }), plain);

    assert.match(output, /^ {2}1 variable$/m);
    assert.doesNotMatch(output, /enum/);
    assert.doesNotMatch(output, /React component/);
  });

  it('summarises how the modules relate', () => {
    const output = formatAnalysisText(
      report({
        'a.ts': "import { b } from './b.js';\nimport 'express';\nexport const a = b;\n",
        'b.ts': 'export const b = 1;\n',
      }),
      plain,
    );

    assert.match(output, /^ {2}2 imports \(1 local, 1 external\)$/m);
    assert.match(output, /^ {2}2 exports$/m);
    assert.match(output, /^ {2}2 dependency edges, 1 symbol edge$/m);
  });

  it('names unresolved imports only when there are some', () => {
    const resolved = formatAnalysisText(
      report({ 'a.ts': "import './b.js';\n", 'b.ts': 'export const b = 1;\n' }),
      plain,
    );
    const unresolved = formatAnalysisText(report({ 'a.ts': "import './gone.js';\n" }), plain);

    assert.doesNotMatch(resolved, /unresolved/);
    assert.match(unresolved, /^ {2}1 import \(0 local, 0 external, 1 unresolved\)$/m);
  });

  it('reports tests only when there are some', () => {
    const withTests = formatAnalysisText(
      report({ 'a.test.ts': "it('works', () => {});\n" }),
      plain,
    );
    const withoutTests = formatAnalysisText(report({ 'a.ts': 'export const a = 1;\n' }), plain);

    assert.match(withTests, /^ {2}1 test file, 1 test$/m);
    assert.doesNotMatch(withoutTests, /^Tests:$/m);
  });

  it('lists API routes with where they were found', () => {
    const output = formatAnalysisText(
      report({
        'server.js': "app.get('/health', h);\napp.post('/users/:id', h);\n",
      }),
      plain,
    );

    assert.match(output, /^API routes:$/m);
    assert.match(output, /^ {2}GET {3}\/health {5}server\.js:1$/m);
    assert.match(output, /^ {2}POST {2}\/users\/:id {2}server\.js:2$/m);
  });

  it('names the files it could not read', () => {
    const output = formatAnalysisText(
      report({ 'a.ts': '' }, [{ path: 'big.js', reason: 'file is larger than 2048 KiB' }]),
      plain,
    );

    assert.match(output, /^Skipped:$/m);
    assert.match(output, /^ {2}big\.js {2}\(file is larger than 2048 KiB\)$/m);
  });

  it('answers a directory with no source in one line', () => {
    const output = formatAnalysisText(report({}), plain);

    assert.equal(
      output,
      ['/workspace/demo', '', '✔ No JavaScript or TypeScript files found.'].join('\n'),
    );
  });

  it('colours the output when the palette is enabled', () => {
    assert.ok(formatAnalysisText(report({ 'a.ts': 'const a = 1;\n' }), colourful).includes(ESC));
  });

  it('emits no escape sequences when the palette is disabled', () => {
    assert.ok(!formatAnalysisText(report({ 'a.ts': 'const a = 1;\n' }), plain).includes(ESC));
  });
});

describe('formatAnalysisJson', () => {
  it('serialises the whole report', () => {
    const source = report({ 'a.ts': 'export const a = 1;\n' });
    const parsed: unknown = JSON.parse(formatAnalysisJson(source));

    assert.deepEqual(parsed, JSON.parse(JSON.stringify(source)));
  });

  it('pretty-prints the payload', () => {
    assert.match(formatAnalysisJson(report({})), /^\{\n {2}"tool": \{/);
  });
});

describe('formatAnalysisReport', () => {
  it('dispatches to the text reporter', () => {
    const output = formatAnalysisReport(report({}), { format: 'text', palette: plain });

    assert.match(output, /No JavaScript or TypeScript files found\./);
  });

  it('dispatches to the JSON reporter', () => {
    const output = formatAnalysisReport(report({}), { format: 'json', palette: plain });

    assert.equal(output, formatAnalysisJson(report({})));
  });
});
