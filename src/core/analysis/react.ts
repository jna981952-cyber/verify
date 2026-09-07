import ts from 'typescript';

import { accessPath, walk } from './ast.js';

/** Wrappers that return a component when handed one. */
const COMPONENT_FACTORIES = new Set(['memo', 'forwardRef', 'React.memo', 'React.forwardRef']);

/** Base classes that make a class a React component. */
const COMPONENT_BASES = new Set([
  'Component',
  'PureComponent',
  'React.Component',
  'React.PureComponent',
]);

/**
 * True for a name written the way React requires of a component.
 *
 * JSX treats a lower-case tag as an HTML element, so a component's name has to
 * start with a capital; that convention is what makes the detection reliable
 * without resolving types.
 */
export function isComponentName(name: string): boolean {
  const first = name.charAt(0);
  return first !== '' && first === first.toUpperCase() && first !== first.toLowerCase();
}

/** True when JSX appears anywhere beneath the node. */
export function containsJsx(node: ts.Node): boolean {
  let found = false;

  walk(node, (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
    }
  });

  return found;
}

/**
 * Looks through `memo(...)` and `forwardRef(...)` to the function they wrap.
 *
 * Returns the expression unchanged when it is not one of those calls, so
 * callers can pass anything through.
 */
export function unwrapComponentFactory(expression: ts.Expression): ts.Expression {
  if (!ts.isCallExpression(expression) || expression.arguments.length === 0) {
    return expression;
  }

  const callee = accessPath(expression.expression);
  if (callee === null || !COMPONENT_FACTORIES.has(callee)) {
    return expression;
  }

  const [first] = expression.arguments;
  return first === undefined ? expression : unwrapComponentFactory(first);
}

/** True when the class extends one of React's component base classes. */
export function isReactComponentClass(node: ts.ClassLikeDeclaration): boolean {
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
      continue;
    }
    for (const type of clause.types) {
      const base = accessPath(type.expression);
      if (base !== null && COMPONENT_BASES.has(base)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * True when a named function looks like a React component.
 *
 * Both halves are required: a capitalised name alone is a factory or a class
 * as often as a component, and JSX alone appears in plenty of helpers.
 */
export function isComponentFunction(name: string | null, node: ts.Node): boolean {
  return name !== null && isComponentName(name) && containsJsx(node);
}
