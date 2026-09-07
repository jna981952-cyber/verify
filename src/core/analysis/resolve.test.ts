import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isBuiltinSpecifier,
  isRelativeSpecifier,
  resolutionCandidates,
  resolveSpecifier,
} from './resolve.js';

describe('isRelativeSpecifier', () => {
  it('accepts paths and rejects packages', () => {
    assert.ok(isRelativeSpecifier('./cart.js'));
    assert.ok(isRelativeSpecifier('../cart.js'));
    assert.ok(isRelativeSpecifier('.'));
    assert.ok(!isRelativeSpecifier('express'));
    assert.ok(!isRelativeSpecifier('@scope/pkg'));
  });
});

describe('isBuiltinSpecifier', () => {
  it('recognises built-ins with and without the prefix', () => {
    assert.ok(isBuiltinSpecifier('node:fs/promises'));
    assert.ok(isBuiltinSpecifier('path'));
    assert.ok(!isBuiltinSpecifier('express'));
  });
});

describe('resolutionCandidates', () => {
  it('tries the written path before anything else', () => {
    assert.equal(resolutionCandidates('src/a.ts', './b.ts')[0], 'src/b.ts');
  });

  it('offers the TypeScript counterpart of a .js specifier', () => {
    const candidates = resolutionCandidates('src/a.ts', './b.js');

    assert.ok(candidates.indexOf('src/b.ts') > candidates.indexOf('src/b.js'));
    assert.ok(candidates.includes('src/b.tsx'));
  });

  it('offers index files last', () => {
    const candidates = resolutionCandidates('src/a.ts', './folder');

    assert.ok(candidates.includes('src/folder/index.ts'));
    assert.ok(candidates.indexOf('src/folder/index.ts') > candidates.indexOf('src/folder.ts'));
  });
});

describe('resolveSpecifier', () => {
  const files = new Set([
    'src/a.ts',
    'src/b.ts',
    'src/c.js',
    'src/folder/index.tsx',
    'src/deep/nested/d.ts',
  ]);

  it('resolves an extensionless specifier', () => {
    assert.equal(resolveSpecifier('src/a.ts', './b', files), 'src/b.ts');
  });

  it('resolves a .js specifier to its TypeScript source', () => {
    assert.equal(resolveSpecifier('src/a.ts', './b.js', files), 'src/b.ts');
  });

  it('prefers an exact match over a substituted extension', () => {
    assert.equal(resolveSpecifier('src/a.ts', './c.js', files), 'src/c.js');
  });

  it('resolves a directory to its index file', () => {
    assert.equal(resolveSpecifier('src/a.ts', './folder', files), 'src/folder/index.tsx');
  });

  it('walks up through parent directories', () => {
    assert.equal(resolveSpecifier('src/deep/nested/d.ts', '../../b.js', files), 'src/b.ts');
  });

  it('returns null for a package', () => {
    assert.equal(resolveSpecifier('src/a.ts', 'express', files), null);
  });

  it('returns null for a path outside the analysed files', () => {
    assert.equal(resolveSpecifier('src/a.ts', './missing.js', files), null);
  });
});
