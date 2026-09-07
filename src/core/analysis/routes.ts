import ts from 'typescript';

import { accessPath, isExported, literalText, nameOf, walk } from './ast.js';
import { locationOf } from './parser.js';
import { HTTP_METHODS, type ApiRoute, type HttpMethod, type SourceLocation } from './types.js';

const METHODS = new Set<string>(HTTP_METHODS);

/** Objects whose `.get(...)` really is a route rather than a lookup. */
const ROUTERS = new Set(['app', 'router', 'server', 'api', 'fastify', 'route', 'instance']);

/** File names Next.js treats as an App Router endpoint. */
const ROUTE_HANDLER_FILE = /(?:^|\/)route\.[cm]?[jt]sx?$/i;

/** Directory that makes a file a Pages Router endpoint. */
const PAGES_API_DIRECTORY = /(?:^|\/)pages\/api\//i;

function toMethod(name: string): HttpMethod | null {
  const upper = name.toUpperCase();
  return METHODS.has(upper) ? (upper as HttpMethod) : null;
}

/**
 * Reads an Express-style route registration.
 *
 * The receiver has to look like a router: `app.get('/users', ...)` is a route,
 * while `cache.get('/users')` is a map lookup that happens to share the shape,
 * and nothing short of type information tells them apart.
 */
function routerCall(source: ts.SourceFile, node: ts.CallExpression): ApiRoute | null {
  if (node.arguments.length < 2 || !ts.isPropertyAccessExpression(node.expression)) {
    return null;
  }

  const method = toMethod(node.expression.name.text);
  const path = literalText(node.arguments[0]);
  if (method === null || path?.startsWith('/') !== true) {
    return null;
  }

  const receiver = accessPath(node.expression.expression);
  if (receiver === null) {
    return null;
  }

  const root = (receiver.split('.').pop() ?? receiver).toLowerCase();
  if (!ROUTERS.has(root)) {
    return null;
  }

  return { method, path, source: 'router-call', location: locationOf(source, node) };
}

/**
 * Turns the path of a Next.js App Router file into the URL it answers.
 *
 * Everything above the `app` directory is dropped, the `route` file name is
 * removed, and route groups such as `(marketing)` are stripped, since they
 * organise files without appearing in the URL.
 */
export function routeHandlerPath(path: string): string {
  const segments = path.split('/');
  const appIndex = segments.lastIndexOf('app');
  const start = appIndex === -1 ? 0 : appIndex + 1;
  const kept = segments
    .slice(start, -1)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));

  return `/${kept.join('/')}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
}

/** Turns the path of a Next.js Pages Router file into the URL it answers. */
export function pagesApiPath(path: string): string {
  const match = PAGES_API_DIRECTORY.exec(path);
  if (match === null) {
    return `/${path}`;
  }

  const rest = path
    .slice(match.index + match[0].length)
    .replace(/\.[cm]?[jt]sx?$/i, '')
    .replace(/(?:^|\/)index$/, '');

  return `/api${rest === '' ? '' : `/${rest}`}`;
}

/** Reads the exported HTTP method handlers of an App Router `route` file. */
function routeHandlers(source: ts.SourceFile, path: string): readonly ApiRoute[] {
  const routes: ApiRoute[] = [];
  const url = routeHandlerPath(path);

  // Next.js requires the handler to be named for the method in upper case, so
  // a lower-case `get` is an ordinary export rather than an endpoint.
  const record = (name: string | null, location: SourceLocation): void => {
    const method = name === null ? null : toMethod(name);
    // `toMethod` upper-cases, so a name it did not change was already upper
    // case; anything else is an ordinary export that happens to share a word.
    if (method !== null && method === name) {
      routes.push({ method, path: url, source: 'route-handler', location });
    }
  };

  for (const statement of source.statements) {
    if (!isExported(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      record(nameOf(statement), locationOf(source, statement));
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          record(declaration.name.text, locationOf(source, declaration));
        }
      }
    }
  }

  return routes;
}

/** True when the file has a default export, however it is written. */
function hasDefaultExport(source: ts.SourceFile): boolean {
  return source.statements.some(
    (statement) =>
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )),
  );
}

/**
 * Collects the HTTP endpoints a file declares.
 *
 * Three shapes are recognised without any type information: Express-style
 * router calls, Next.js App Router handlers, and Next.js Pages Router
 * endpoints. Anything assembled at runtime is out of reach and is left alone.
 */
export function collectRoutes(source: ts.SourceFile, path: string): readonly ApiRoute[] {
  if (ROUTE_HANDLER_FILE.test(path)) {
    return routeHandlers(source, path);
  }

  if (PAGES_API_DIRECTORY.test(path) && hasDefaultExport(source)) {
    return [
      {
        method: 'ALL',
        path: pagesApiPath(path),
        source: 'pages-api',
        location: { line: 1, column: 1 },
      },
    ];
  }

  const routes: ApiRoute[] = [];
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) {
      return;
    }
    const route = routerCall(source, node);
    if (route !== null) {
      routes.push(route);
    }
  });

  return routes;
}
