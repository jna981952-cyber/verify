import ts from 'typescript';

import { accessPath, isDynamicImport, isRequireCall, literalText, nameOf, walk } from './ast.js';
import { locationOf } from './parser.js';
import {
  type ImportBinding,
  type ImportKind,
  type ModuleExport,
  type ModuleImport,
} from './types.js';

/** Names a declaration can bind, flattened out of destructuring patterns. */
function boundNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  const names: string[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      names.push(...boundNames(element.name));
    }
  }
  return names;
}

/**
 * True for `import type ...`.
 *
 * TypeScript 6 replaced the old boolean with a phase modifier, which also
 * carries `import defer`; only the type phase is a type-only import.
 */
function isTypeOnlyClause(clause: ts.ImportClause): boolean {
  return clause.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

function importBindings(clause: ts.ImportClause): readonly ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const statementTypeOnly = isTypeOnlyClause(clause);

  if (clause.name !== undefined) {
    bindings.push({ imported: 'default', local: clause.name.text, typeOnly: statementTypeOnly });
  }

  const { namedBindings } = clause;
  if (namedBindings === undefined) {
    return bindings;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    bindings.push({ imported: '*', local: namedBindings.name.text, typeOnly: statementTypeOnly });
    return bindings;
  }

  for (const element of namedBindings.elements) {
    bindings.push({
      imported: (element.propertyName ?? element.name).text,
      local: element.name.text,
      typeOnly: statementTypeOnly || element.isTypeOnly,
    });
  }

  return bindings;
}

/**
 * Collects every module a file pulls in.
 *
 * Static imports, `import x = require(...)`, dynamic `import()` and CommonJS
 * `require()` are all reported; re-exports are not, because they are exports
 * that happen to name a source and are reported as such.
 */
export function collectImports(source: ts.SourceFile): readonly ModuleImport[] {
  const imports: ModuleImport[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = literalText(statement.moduleSpecifier);
      if (specifier === null) {
        continue;
      }
      const clause = statement.importClause;
      imports.push({
        specifier,
        kind: 'static',
        bindings: clause === undefined ? [] : importBindings(clause),
        typeOnly: clause !== undefined && isTypeOnlyClause(clause),
        location: locationOf(source, statement),
      });
      continue;
    }

    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const specifier = literalText(statement.moduleReference.expression);
      if (specifier !== null) {
        imports.push({
          specifier,
          kind: 'require',
          bindings: [{ imported: '*', local: statement.name.text, typeOnly: false }],
          typeOnly: statement.isTypeOnly,
          location: locationOf(source, statement),
        });
      }
    }
  }

  const record = (call: ts.CallExpression, kind: ImportKind): void => {
    const specifier = literalText(call.arguments[0]);
    if (specifier === null) {
      return;
    }
    imports.push({
      specifier,
      kind,
      bindings: requireBindings(call),
      typeOnly: false,
      location: locationOf(source, call),
    });
  };

  walk(source, (node) => {
    if (isDynamicImport(node)) {
      record(node, 'dynamic');
    } else if (isRequireCall(node)) {
      record(node, 'require');
    }
  });

  return imports;
}

/** Reads the names a `const { a } = require('x')` declaration binds. */
function requireBindings(call: ts.CallExpression): readonly ImportBinding[] {
  const { parent } = call;
  if (!ts.isVariableDeclaration(parent)) {
    return [];
  }

  if (ts.isIdentifier(parent.name)) {
    return [{ imported: '*', local: parent.name.text, typeOnly: false }];
  }

  return boundNames(parent.name).map((local) => ({ imported: local, local, typeOnly: false }));
}

/** Names declared by a statement that carries an `export` modifier. */
function declaredExportNames(statement: ts.Statement): readonly string[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      boundNames(declaration.name),
    );
  }

  const name = nameOf(statement);
  return name === null ? [] : [name];
}

function namedExports(
  source: ts.SourceFile,
  statement: ts.ExportDeclaration,
): readonly ModuleExport[] {
  const from = literalText(statement.moduleSpecifier);
  const location = locationOf(source, statement);
  const { exportClause } = statement;

  if (exportClause === undefined) {
    return [{ name: '*', local: null, source: from, typeOnly: statement.isTypeOnly, location }];
  }

  if (ts.isNamespaceExport(exportClause)) {
    return [
      {
        name: exportClause.name.text,
        local: '*',
        source: from,
        typeOnly: statement.isTypeOnly,
        location,
      },
    ];
  }

  return exportClause.elements.map((element) => ({
    name: element.name.text,
    local: (element.propertyName ?? element.name).text,
    source: from,
    typeOnly: statement.isTypeOnly || element.isTypeOnly,
    location,
  }));
}

/** Reads a CommonJS `module.exports = x` or `exports.name = x` assignment. */
function commonJsExport(source: ts.SourceFile, node: ts.Node): ModuleExport | null {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
    return null;
  }

  const target = accessPath(node.left);
  if (target === null) {
    return null;
  }

  const local = ts.isIdentifier(node.right) ? node.right.text : null;
  const location = locationOf(source, node);

  if (target === 'module.exports') {
    return { name: 'default', local, source: null, typeOnly: false, location };
  }

  const property = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/.exec(target);
  return property === null
    ? null
    : { name: property[1] ?? '', local, source: null, typeOnly: false, location };
}

/**
 * Collects every name a file makes available to other modules.
 *
 * Covers `export` modifiers, `export { ... }` with and without a source,
 * `export *`, default and `export =` assignments, and the CommonJS forms, so
 * plain JavaScript is reported as fully as TypeScript.
 */
export function collectExports(source: ts.SourceFile): readonly ModuleExport[] {
  const exports: ModuleExport[] = [];

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      exports.push(...namedExports(source, statement));
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      exports.push({
        name: statement.isExportEquals === true ? 'export=' : 'default',
        local: ts.isIdentifier(statement.expression) ? statement.expression.text : null,
        source: null,
        typeOnly: false,
        location: locationOf(source, statement),
      });
      continue;
    }

    if (!ts.canHaveModifiers(statement) || !isExportModifierPresent(statement)) {
      continue;
    }

    const location = locationOf(source, statement);
    if (isDefaultModifierPresent(statement)) {
      exports.push({
        name: 'default',
        local: nameOf(statement),
        source: null,
        typeOnly: false,
        location,
      });
      continue;
    }

    for (const name of declaredExportNames(statement)) {
      exports.push({ name, local: name, source: null, typeOnly: false, location });
    }
  }

  walk(source, (node) => {
    const found = commonJsExport(source, node);
    if (found !== null) {
      exports.push(found);
    }
  });

  return exports;
}

function isExportModifierPresent(statement: ts.HasModifiers): boolean {
  return (ts.getModifiers(statement) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function isDefaultModifierPresent(statement: ts.HasModifiers): boolean {
  return (ts.getModifiers(statement) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
}
