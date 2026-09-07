import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extensionOf, isDeclarationPath, isSourcePath, languageOf, parseSource } from './parser.js';

describe('extensionOf', () => {
  it('reads the extension in lower case', () => {
    assert.equal(extensionOf('src/Cart.TS'), '.ts');
  });

  it('returns an empty string when there is no extension', () => {
    assert.equal(extensionOf('Makefile'), '');
  });
});

describe('isSourcePath', () => {
  it('accepts every JavaScript and TypeScript extension', () => {
    for (const path of ['a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.ts', 'a.tsx', 'a.mts', 'a.cts']) {
      assert.ok(isSourcePath(path), `${path} should be a source path`);
    }
  });

  it('rejects anything else', () => {
    for (const path of ['a.json', 'a.md', 'a.css', 'a.py', 'README']) {
      assert.ok(!isSourcePath(path), `${path} should not be a source path`);
    }
  });
});

describe('languageOf', () => {
  it('separates JavaScript from TypeScript', () => {
    assert.equal(languageOf('a.jsx'), 'javascript');
    assert.equal(languageOf('a.cjs'), 'javascript');
    assert.equal(languageOf('a.tsx'), 'typescript');
    assert.equal(languageOf('a.mts'), 'typescript');
  });

  it('returns null for a file it cannot read', () => {
    assert.equal(languageOf('a.json'), null);
  });
});

describe('isDeclarationPath', () => {
  it('recognises declaration files', () => {
    assert.ok(isDeclarationPath('types/index.d.ts'));
    assert.ok(isDeclarationPath('types/index.d.mts'));
    assert.ok(!isDeclarationPath('types/index.ts'));
  });
});

describe('parseSource', () => {
  it('parses JSX in a plain .js file', () => {
    const source = parseSource('a.js', 'const App = () => <div />;');

    assert.equal(source.statements.length, 1);
  });

  it('parses TypeScript syntax', () => {
    const source = parseSource('a.ts', 'export interface A { readonly b: number }');

    assert.equal(source.statements.length, 1);
  });

  it('recovers from broken syntax instead of throwing', () => {
    assert.doesNotThrow(() => parseSource('a.ts', 'function ((( <<< not valid'));
  });

  it('accepts an empty file', () => {
    assert.equal(parseSource('a.ts', '').statements.length, 0);
  });
});
