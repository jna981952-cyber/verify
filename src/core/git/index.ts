/**
 * Git change detection.
 *
 * The modules underneath split the work by concern — running git, finding the
 * repository, reading HEAD, parsing status, parsing diffs — and this barrel is
 * what the rest of the tool imports.
 */
export {
  collectChanges,
  requireChanges,
  summarise,
  type CollectChangesOptions,
} from './changes.js';
export {
  parseDiff,
  parseHunks,
  parseNumstat,
  readDiff,
  splitPatch,
  type DiffFile,
} from './diff.js';
export { readHead, SHORT_COMMIT_LENGTH } from './head.js';
export { findRepository, type GitRepository } from './repository.js';
export {
  createGitRunner,
  expectSuccess,
  GitCommandError,
  GitUnavailableError,
  isGitUnavailableError,
  type GitResult,
  type GitRunner,
  type GitRunOptions,
} from './runner.js';
export { parseStatus, readStatus, type StatusEntry } from './status.js';
export {
  CHANGE_KINDS,
  CHANGE_SCOPES,
  type ChangeCounts,
  type ChangeKind,
  type ChangeScope,
  type ChangeSet,
  type ChangeSummary,
  type DiffHunk,
  type DiffStats,
  type FileChange,
  type GitHead,
} from './types.js';
