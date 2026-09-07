import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type GitHead } from '../core/git/types.js';
import { type AffectedFile, type ChangedFile, type ImpactAnalysis } from '../core/impact/types.js';
import { type ImpactReport } from '../core/report.js';
import { createPalette } from '../utils/color.js';
import { formatImpactJson, formatImpactText } from './impact.js';
import { formatImpactReport } from './index.js';

const ESC = String.fromCharCode(27);

const plain = createPalette(false);
const colourful = createPalette(true);

const HEAD: GitHead = {
  branch: 'main',
  commit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shortCommit: 'a1b2c3d',
  detached: false,
  unborn: false,
};

function changed(path: string, symbols: readonly string[] = []): ChangedFile {
  return {
    path,
    kind: 'modified',
    analysed: true,
    precision: 'exact',
    symbols: symbols.map((name) => ({ name, kind: 'function', container: null, lines: [1] })),
  };
}

function affected(path: string, distance: number, detail: string): AffectedFile {
  return {
    path,
    distance,
    reasons: [
      {
        via: 'src/checkout.ts',
        relation: 'imports-file',
        symbol: null,
        specifier: './checkout.js',
        typeOnly: false,
        detail,
      },
    ],
  };
}

function report(overrides: Partial<ImpactAnalysis> = {}): ImpactReport {
  const impact: ImpactAnalysis = {
    root: '/workspace/demo',
    depth: 3,
    truncated: false,
    head: HEAD,
    changed: [],
    affected: [],
    tests: [],
    components: [],
    routes: [],
    notes: [],
    summary: {
      changedFiles: 0,
      changedAnalysedFiles: 0,
      changedSymbols: 0,
      directlyAffected: 0,
      indirectlyAffected: 0,
      affectedTests: 0,
      affectedComponents: 0,
      affectedRoutes: 0,
    },
    ...overrides,
  };

  return { tool: { name: 'verify', version: '1.2.3' }, target: '/workspace/demo', impact };
}

describe('formatImpactText', () => {
  it('opens with where HEAD is', () => {
    assert.match(formatImpactText(report(), plain), /^On branch main at a1b2c3d$/m);
  });

  it('answers a clean working tree in one line', () => {
    assert.equal(
      formatImpactText(report(), plain),
      ['On branch main at a1b2c3d', '', '✔ No changes to analyse.'].join('\n'),
    );
  });

  it('lays the blocks out in the documented order', () => {
    const output = formatImpactText(
      report({
        changed: [changed('src/checkout.ts', ['checkout'])],
        affected: [
          affected('src/cart.ts', 1, 'src/cart.ts imports src/checkout.ts, which changed'),
          affected(
            'src/api/checkout.ts',
            1,
            'src/api/checkout.ts imports src/checkout.ts, which changed',
          ),
          affected(
            'src/pages/checkout.tsx',
            2,
            'src/pages/checkout.tsx imports src/cart.ts, which is affected',
          ),
        ],
        tests: [{ path: 'tests/checkout.test.ts', distance: 1, tests: [] }],
      }),
      plain,
    );

    assert.ok(
      output.includes(
        [
          'Changed:',
          '  src/checkout.ts',
          '',
          'Changed symbols:',
          '  checkout  function in src/checkout.ts',
          '',
          'Directly affected:',
          '  src/cart.ts',
          '  src/api/checkout.ts',
          '',
          'Indirectly affected:',
          '  src/pages/checkout.tsx',
          '',
          'Affected tests:',
          '  tests/checkout.test.ts',
          '',
          'Reasons:',
          '  src/cart.ts imports src/checkout.ts, which changed',
          '  src/api/checkout.ts imports src/checkout.ts, which changed',
          '  src/pages/checkout.tsx imports src/cart.ts, which is affected',
        ].join('\n'),
      ),
      output,
    );
  });

  it('leaves out blocks with nothing in them', () => {
    const output = formatImpactText(report({ changed: [changed('a.ts')] }), plain);

    assert.doesNotMatch(output, /Changed symbols:/);
    assert.doesNotMatch(output, /Directly affected:/);
    assert.doesNotMatch(output, /Affected tests:/);
    assert.doesNotMatch(output, /Reasons:/);
  });

  it('says plainly when nothing depends on the change', () => {
    assert.match(
      formatImpactText(report({ changed: [changed('a.ts')] }), plain),
      /✔ Nothing else depends on what changed\./,
    );
  });

  it('names a declaration together with the class around it', () => {
    const output = formatImpactText(
      report({
        changed: [
          {
            path: 'src/cart.ts',
            kind: 'modified',
            analysed: true,
            precision: 'exact',
            symbols: [{ name: 'pay', kind: 'method', container: 'CartService', lines: [7] }],
          },
        ],
      }),
      plain,
    );

    assert.match(output, /^ {2}CartService\.pay {2}method in src\/cart\.ts$/m);
  });

  it('counts the tests a test file declares', () => {
    const output = formatImpactText(
      report({
        changed: [changed('a.ts')],
        tests: [{ path: 'a.test.ts', distance: 1, tests: ['one', 'two'] }],
      }),
      plain,
    );

    assert.match(output, /^ {2}a\.test\.ts \(2 tests\)$/m);
  });

  it('lists components and routes with where they live', () => {
    const output = formatImpactText(
      report({
        changed: [changed('a.ts')],
        components: [{ path: 'src/Button.tsx', name: 'Button', distance: 0 }],
        routes: [
          { path: 'src/api.ts', method: 'POST', route: '/checkout', distance: 1 },
          { path: 'src/api.ts', method: 'GET', route: '/health', distance: 1 },
        ],
      }),
      plain,
    );

    assert.match(output, /^Affected components:\n {2}Button {2}src\/Button\.tsx$/m);
    assert.match(output, /^ {2}POST {2}\/checkout {2}src\/api\.ts$/m);
    assert.match(output, /^ {2}GET {3}\/health {4}src\/api\.ts$/m);
  });

  it('collapses a reason that was reached more than once', () => {
    const detail = 'b.ts imports a.ts, which changed';
    const output = formatImpactText(
      report({
        changed: [changed('a.ts')],
        affected: [affected('b.ts', 1, detail), affected('c.ts', 1, detail)],
      }),
      plain,
    );

    assert.equal(output.split(detail).length - 1, 1);
  });

  it('prints the notes that apply to the run', () => {
    const output = formatImpactText(
      report({ changed: [changed('a.ts')], notes: ['The search stopped at depth 1.'] }),
      plain,
    );

    assert.match(output, /^Notes:\n {2}The search stopped at depth 1\.$/m);
  });

  it('colours the output when the palette is enabled', () => {
    assert.ok(formatImpactText(report({ changed: [changed('a.ts')] }), colourful).includes(ESC));
  });

  it('emits no escape sequences when the palette is disabled', () => {
    assert.ok(!formatImpactText(report({ changed: [changed('a.ts')] }), plain).includes(ESC));
  });
});

describe('formatImpactJson', () => {
  it('serialises the whole report', () => {
    const source = report({ changed: [changed('a.ts', ['a'])] });
    const parsed: unknown = JSON.parse(formatImpactJson(source));

    assert.deepEqual(parsed, JSON.parse(JSON.stringify(source)));
  });

  it('pretty-prints the payload', () => {
    assert.match(formatImpactJson(report()), /^\{\n {2}"tool": \{/);
  });
});

describe('formatImpactReport', () => {
  it('dispatches to the text reporter', () => {
    assert.match(
      formatImpactReport(report(), { format: 'text', palette: plain }),
      /No changes to analyse\./,
    );
  });

  it('dispatches to the JSON reporter', () => {
    assert.equal(
      formatImpactReport(report(), { format: 'json', palette: plain }),
      formatImpactJson(report()),
    );
  });
});
