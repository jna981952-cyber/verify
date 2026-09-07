import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The handful of `package.json` fields the CLI reads.
 *
 * Only fields that are actually used are modelled; a manifest with anything
 * else in it (the normal case) is still valid.
 */
export interface Manifest {
  readonly name: string | null;
  readonly version: string | null;
  readonly description: string | null;
}

function readStringField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Converts arbitrary parsed JSON into a {@link Manifest}, ignoring bad shapes. */
export function toManifest(parsed: unknown): Manifest | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const source = parsed as Record<string, unknown>;
  return {
    name: readStringField(source, 'name'),
    version: readStringField(source, 'version'),
    description: readStringField(source, 'description'),
  };
}

/**
 * Reads `<directory>/package.json`.
 *
 * A missing or malformed manifest is not an error: plenty of directories worth
 * inspecting are not npm packages, so the caller simply gets `null`.
 */
export async function readManifest(directory: string): Promise<Manifest | null> {
  let contents: string;

  try {
    contents = await readFile(join(directory, 'package.json'), 'utf8');
  } catch {
    return null;
  }

  try {
    return toManifest(JSON.parse(contents));
  } catch {
    return null;
  }
}
