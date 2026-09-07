import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExitCode, UsageError, VerifyError, isVerifyError, toErrorMessage } from './errors.js';

describe('VerifyError', () => {
  it('defaults to the internal exit code', () => {
    const error = new VerifyError('boom');

    assert.equal(error.exitCode, ExitCode.Internal);
    assert.equal(error.name, 'VerifyError');
    assert.ok(isVerifyError(error));
  });

  it('keeps the cause when one is supplied', () => {
    const cause = new Error('root cause');
    const error = new VerifyError('boom', ExitCode.Failure, { cause });

    assert.equal(error.exitCode, ExitCode.Failure);
    assert.equal(error.cause, cause);
  });
});

describe('UsageError', () => {
  it('always reports the usage exit code', () => {
    const error = new UsageError('bad flag');

    assert.equal(error.exitCode, ExitCode.Usage);
    assert.equal(error.name, 'UsageError');
    assert.ok(error instanceof VerifyError);
  });
});

describe('isVerifyError', () => {
  it('rejects unrelated values', () => {
    assert.equal(isVerifyError(new Error('plain')), false);
    assert.equal(isVerifyError('nope'), false);
    assert.equal(isVerifyError(null), false);
  });
});

describe('toErrorMessage', () => {
  it('unwraps errors, strings and anything else', () => {
    assert.equal(toErrorMessage(new Error('from error')), 'from error');
    assert.equal(toErrorMessage('from string'), 'from string');
    assert.equal(toErrorMessage(404), '404');
  });
});
