import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLogger, createMemoryLogger, type WritableLike } from './logger.js';

function createStream(): WritableLike & { chunks: string[] } {
  const chunks: string[] = [];
  return {
    chunks,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  };
}

describe('createLogger', () => {
  it('writes newline-terminated messages to the matching stream', () => {
    const stdout = createStream();
    const stderr = createStream();
    const logger = createLogger({ stdout, stderr });

    logger.out('hello');
    logger.err('oops');
    logger.out();

    assert.deepEqual(stdout.chunks, ['hello\n', '\n']);
    assert.deepEqual(stderr.chunks, ['oops\n']);
  });
});

describe('createMemoryLogger', () => {
  it('accumulates output per stream', () => {
    const logger = createMemoryLogger();

    logger.out('one');
    logger.out('two');
    logger.err('bad');

    assert.equal(logger.stdout, 'one\ntwo\n');
    assert.equal(logger.stderr, 'bad\n');
  });
});
