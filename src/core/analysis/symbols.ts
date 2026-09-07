import ts from 'typescript';

import { isDefaultExported, isExported, nameOf } from './ast.js';
import { locationOf } from './parser.js';
import {
  containsJsx,
  isComponentFunction,
  isReactComponentClass,
  unwrapComponentFactory,
} from './react.js';
import { type CodeSymbol, type SourceLocation, type SymbolKind } from './types.js';

/** Name reported for a declaration exported without one. */
const ANONYMOUS_DEFAULT = 'default';

interface Context {
  readonly source: ts.SourceFile;
  readonly symbols: CodeSymbol[];
  /** Enclosing class or namespace, `null` at the top level. */
  readonly container: string | null;
}

function add(
  context: Context,
  name: string,
  kind: SymbolKind,
  exported: boolean,
  location: SourceLocation,
): void {
  context.symbols.push({ name, kind, exported, container: context.container, location });
}

/** Names bound by a declaration, flattened out of destructuring patterns. */
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

/** True for the expressions that make a variable a function rather than a value. */
function isFunctionExpression(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function collectClassMembers(context: Context, node: ts.ClassLikeDeclaration, owner: string): void {
  const nested: Context = { ...context, container: owner };

  for (const member of node.members) {
    const location = locationOf(context.source, member);

    if (ts.isConstructorDeclaration(member)) {
      add(nested, 'constructor', 'method', false, location);
      continue;
    }

    const name = nameOf(member);
    if (name === null) {
      continue;
    }

    if (
      ts.isMethodDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      add(nested, name, 'method', false, location);
      continue;
    }

    // A property holding an arrow function is a method written differently.
    if (
      ts.isPropertyDeclaration(member) &&
      member.initializer !== undefined &&
      isFunctionExpression(member.initializer)
    ) {
      add(nested, name, 'method', false, location);
    }
  }
}

function collectClass(
  context: Context,
  node: ts.ClassLikeDeclaration,
  name: string,
  exported: boolean,
  location: SourceLocation,
): void {
  add(context, name, isReactComponentClass(node) ? 'component' : 'class', exported, location);
  collectClassMembers(context, node, name);
}

function collectVariable(
  context: Context,
  declaration: ts.VariableDeclaration,
  exported: boolean,
): void {
  const location = locationOf(context.source, declaration);
  const names = boundNames(declaration.name);
  const initializer = declaration.initializer;
  const [name] = names;

  if (initializer === undefined || name === undefined || names.length > 1) {
    for (const bound of names) {
      add(context, bound, 'variable', exported, location);
    }
    return;
  }

  const value = unwrapComponentFactory(initializer);

  if (ts.isClassExpression(value)) {
    collectClass(context, value, name, exported, location);
    return;
  }

  if (isFunctionExpression(value)) {
    add(
      context,
      name,
      isComponentFunction(name, value) ? 'component' : 'function',
      exported,
      location,
    );
    return;
  }

  add(context, name, 'variable', exported, location);
}

function collectStatement(context: Context, statement: ts.Statement): void {
  const location = locationOf(context.source, statement);
  const exported = isExported(statement);
  const declaredName = nameOf(statement);

  if (ts.isFunctionDeclaration(statement)) {
    const name = declaredName ?? (isDefaultExported(statement) ? ANONYMOUS_DEFAULT : null);
    if (name !== null) {
      const kind = isComponentFunction(name, statement) ? 'component' : 'function';
      add(context, name, kind, exported, location);
    }
    return;
  }

  if (ts.isClassDeclaration(statement)) {
    const name = declaredName ?? (isDefaultExported(statement) ? ANONYMOUS_DEFAULT : null);
    if (name !== null) {
      collectClass(context, statement, name, exported, location);
    }
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectVariable(context, declaration, exported);
    }
    return;
  }

  if (ts.isInterfaceDeclaration(statement) && declaredName !== null) {
    add(context, declaredName, 'interface', exported, location);
    return;
  }

  if (ts.isTypeAliasDeclaration(statement) && declaredName !== null) {
    add(context, declaredName, 'type', exported, location);
    return;
  }

  if (ts.isEnumDeclaration(statement) && declaredName !== null) {
    add(context, declaredName, 'enum', exported, location);
    return;
  }

  // `export default <function or class expression>` declares something worth
  // reporting even though it has no name of its own.
  if (ts.isExportAssignment(statement)) {
    const value = unwrapComponentFactory(statement.expression);
    if (ts.isClassExpression(value)) {
      collectClass(context, value, ANONYMOUS_DEFAULT, true, location);
    } else if (isFunctionExpression(value)) {
      // A default export has no name to judge, so JSX alone decides.
      add(
        context,
        ANONYMOUS_DEFAULT,
        containsJsx(value) ? 'component' : 'function',
        true,
        location,
      );
    }
    return;
  }

  if (ts.isModuleDeclaration(statement) && declaredName !== null) {
    const body = statement.body;
    if (body !== undefined && ts.isModuleBlock(body)) {
      const nested: Context = { ...context, container: declaredName };
      for (const inner of body.statements) {
        collectStatement(nested, inner);
      }
    }
  }
}

/**
 * Collects the declarations a file makes.
 *
 * Module-level declarations, class members and the contents of namespaces are
 * reported. Declarations nested inside function bodies are not: they are local
 * detail rather than part of what the file offers.
 */
export function collectSymbols(source: ts.SourceFile): readonly CodeSymbol[] {
  const context: Context = { source, symbols: [], container: null };

  for (const statement of source.statements) {
    collectStatement(context, statement);
  }

  return context.symbols;
}
