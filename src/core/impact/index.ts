/**
 * Impact analysis.
 *
 * Combines the Git change set with the codebase analysis and walks the
 * dependency graph backwards from what changed, recording why each selection
 * was made. This barrel is what the rest of the tool imports.
 */
export { describeChange, symbolsCovering, touchedLines } from './changed.js';
export { analyzeImpact, DEFAULT_IMPACT_DEPTH, rebasePath, type ImpactOptions } from './impact.js';
export {
  buildIncoming,
  traverseImpact,
  type TraverseInput,
  type TraverseResult,
} from './traverse.js';
export {
  IMPACT_RELATIONS,
  SYMBOL_PRECISIONS,
  type AffectedComponent,
  type AffectedFile,
  type AffectedRoute,
  type AffectedTest,
  type ChangedFile,
  type ChangedSymbol,
  type ImpactAnalysis,
  type ImpactReason,
  type ImpactRelation,
  type ImpactSummary,
  type SymbolPrecision,
} from './types.js';
