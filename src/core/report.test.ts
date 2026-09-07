import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TOOL_NAME, VERSION } from '../version.js';
import { type ProjectInfo } from './project.js';
import { createReport } from './report.js';
import { type Target } from './target.js';

describe('createReport', () => {
  it('stamps the report with the tool identity and target', () => {
    const target: Target = { path: '/workspace/demo', input: '.', label: 'demo' };
    const project: ProjectInfo = {
      root: '/workspace/demo',
      name: 'demo',
      manifest: null,
      packageManager: null,
      lockfile: null,
      versionControl: null,
      typescript: false,
    };

    assert.deepEqual(createReport(target, project), {
      tool: { name: TOOL_NAME, version: VERSION },
      target: '/workspace/demo',
      project,
    });
  });
});
