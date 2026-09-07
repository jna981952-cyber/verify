import ts from 'typescript';

/** Calls `visit` for every node beneath `node`, including `node` itself. */
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

/**
 * Returns the text of a literal string, or `null` for anything else.
 *
 * Template literals count only when they have no substitutions: a specifier or
 * a route path built at runtime is not something the analyser can report.
 */
export function literalText(node: ts.Node | undefined): string | null {
  if (node === undefined) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * Returns the written name of a declaration, or `null` when there is none.
 *
 * A computed name is `null`, and so is the empty one TypeScript's parser
 * synthesises while recovering from broken syntax — reporting that as a
 * declaration would turn a typo into an entry in the inventory.
 */
export function nameOf(node: ts.Node): string | null {
  const name = (node as { name?: ts.Node }).name;
  if (name === undefined) {
    return null;
  }

  const text =
    ts.isIdentifier(name) || ts.isPrivateIdentifier(name) ? name.text : literalText(name);
  return text === '' ? null : text;
}

/** True when the declaration carries the given modifier. */
export function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
    : false;
}

/** True when the declaration is written with `export`. */
export function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

/** True when the declaration is written with `export default`. */
export function isDefaultExported(node: ts.Node): boolean {
  return isExported(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

/**
 * Flattens a property access chain into dotted text.
 *
 * `router.get` and `app.route.get` become `router.get` and `app.route.get`;
 * anything containing a computed or non-identifier step returns `null`.
 */
export function accessPath(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    return 'this';
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
    const target = accessPath(node.expression);
    return target === null ? null : `${target}.${node.name.text}`;
  }
  return null;
}

/** True when the expression is a `require(...)` call with a literal specifier. */
export function isRequireCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments.length > 0
  );
}

/** True when the expression is a dynamic `import(...)`. */
export function isDynamicImport(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0
  );
}
