import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type Report } from '../core/report.js';
import { createPalette } from '../utils/color.js';
import { formatJsonReport, formatReport, formatTextReport } from './index.js';

const ESC = String.fromCharCode(27);

const report: Report = {
  tool: { name: 'verify', version: '1.2.3' },
  target: '/workspace/demo',
  project: {
    root: '/workspace/demo',
    name: 'demo',
    manifest: { name: 'demo', version: '4.5.6', description: null },
    packageManager: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    versionControl: 'git',
    typescript: true,
  },
};

const bareReport: Report = {
  tool: { name: 'verify', version: '1.2.3' },
  target: '/workspace/bare',
  project: {
    root: '/workspace/bare',
    name: 'bare',
    manifest: null,
    packageManager: null,
    lockfile: null,
    versionControl: null,
    typescript: false,
  },
};

describe('formatTextReport', () => {
  const plain = createPalette(false);

  it('lists every detected fact', () => {
    const output = formatTextReport(report, plain);

    assert.match(output, /verify 1\.2\.3/);
    assert.match(output, /Target\s+\/workspace\/demo/);
    assert.match(output, /Project\s+demo@4\.5\.6/);
    assert.match(output, /Package manager\s+pnpm \(pnpm-lock\.yaml\)/);
    assert.match(output, /Version control\s+git/);
    assert.match(output, /TypeScript\s+tsconfig\.json/);
  });

  it('marks undetected facts explicitly', () => {
    const output = formatTextReport(bareReport, plain);

    assert.match(output, /Project\s+bare\n/);
    assert.match(output, /Package manager\s+not detected/);
    assert.match(output, /Version control\s+not detected/);
    assert.match(output, /TypeScript\s+not detected/);
  });

  it('emits no escape sequences with a plain palette', () => {
    assert.ok(!formatTextReport(report, plain).includes(ESC));
  });

  it('emits escape sequences with a colour palette', () => {
    assert.ok(formatTextReport(report, createPalette(true)).includes(ESC));
  });
});

describe('formatJsonReport', () => {
  it('round-trips the report', () => {
    assert.deepEqual(JSON.parse(formatJsonReport(report)), report);
  });

  it('pretty-prints for readability', () => {
    assert.match(formatJsonReport(report), /\n {2}"tool": \{/);
  });
});

describe('formatReport', () => {
  const palette = createPalette(false);

  it('dispatches to the text reporter', () => {
    assert.equal(
      formatReport(report, { format: 'text', palette }),
      formatTextReport(report, palette),
    );
  });

  it('dispatches to the JSON reporter', () => {
    assert.equal(formatReport(report, { format: 'json', palette }), formatJsonReport(report));
  });
});
