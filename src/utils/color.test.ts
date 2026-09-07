import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPalette, shouldUseColor } from './color.js';

const ESC = String.fromCharCode(27);

describe('shouldUseColor', () => {
  it('follows the terminal when nothing overrides it', () => {
    assert.equal(shouldUseColor({ noColorFlag: false, env: {}, isTTY: true }), true);
    assert.equal(shouldUseColor({ noColorFlag: false, env: {}, isTTY: false }), false);
  });

  it('honours the --no-color flag above everything else', () => {
    assert.equal(
      shouldUseColor({ noColorFlag: true, env: { FORCE_COLOR: '1' }, isTTY: true }),
      false,
    );
  });

  it('honours a non-empty NO_COLOR variable', () => {
    assert.equal(
      shouldUseColor({ noColorFlag: false, env: { NO_COLOR: '1' }, isTTY: true }),
      false,
    );
    assert.equal(shouldUseColor({ noColorFlag: false, env: { NO_COLOR: '' }, isTTY: true }), true);
  });

  it('lets FORCE_COLOR enable colour off a terminal', () => {
    assert.equal(
      shouldUseColor({ noColorFlag: false, env: { FORCE_COLOR: '1' }, isTTY: false }),
      true,
    );
    assert.equal(
      shouldUseColor({ noColorFlag: false, env: { FORCE_COLOR: '0' }, isTTY: false }),
      false,
    );
  });

  it('skips colour on dumb terminals', () => {
    assert.equal(shouldUseColor({ noColorFlag: false, env: { TERM: 'dumb' }, isTTY: true }), false);
  });
});

describe('createPalette', () => {
  it('returns the text unchanged when colour is disabled', () => {
    const palette = createPalette(false);

    assert.equal(palette.bold('hello'), 'hello');
    assert.equal(palette.red('hello'), 'hello');
  });

  it('wraps the text in ANSI escapes when colour is enabled', () => {
    const palette = createPalette(true);

    assert.equal(palette.green('ok'), `${ESC}[32mok${ESC}[39m`);
    assert.ok(palette.dim('x').includes(ESC));
  });
});
