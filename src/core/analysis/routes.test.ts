import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSource } from './parser.js';
import { collectRoutes, pagesApiPath, routeHandlerPath } from './routes.js';
import { type ApiRoute } from './types.js';

function routesOf(text: string, path = 'src/server.ts'): readonly ApiRoute[] {
  return collectRoutes(parseSource(path, text), path);
}

function described(routes: readonly ApiRoute[]): readonly string[] {
  return routes.map((route) => `${route.method} ${route.path} (${route.source})`);
}

describe('collectRoutes on router calls', () => {
  it('finds nothing in a file without routes', () => {
    assert.deepEqual(routesOf('export const a = 1;'), []);
  });

  it('reads Express-style registrations', () => {
    assert.deepEqual(
      described(
        routesOf(
          [
            "app.get('/users', handler);",
            "router.post('/users/:id', handler);",
            "server.delete('/users/:id', handler);",
            "fastify.put('/users', handler);",
          ].join('\n'),
        ),
      ),
      [
        'GET /users (router-call)',
        'POST /users/:id (router-call)',
        'DELETE /users/:id (router-call)',
        'PUT /users (router-call)',
      ],
    );
  });

  it('reads a route on a nested router reference', () => {
    assert.deepEqual(described(routesOf("api.router.get('/ping', handler);")), [
      'GET /ping (router-call)',
    ]);
  });

  it('leaves lookups that share the shape alone', () => {
    assert.deepEqual(routesOf("cache.get('/users', fallback);\nmap.delete('/users', x);"), []);
  });

  it('needs a literal path that looks like one', () => {
    assert.deepEqual(routesOf('app.get(path, handler);'), []);
    assert.deepEqual(routesOf("app.get('users', handler);"), []);
  });

  it('needs a handler as well as a path', () => {
    assert.deepEqual(routesOf("app.get('/users');"), []);
  });

  it('records where each route is registered', () => {
    assert.deepEqual(routesOf("\napp.get('/users', handler);")[0]?.location, {
      line: 2,
      column: 1,
    });
  });

  it('reads routes from CommonJS JavaScript', () => {
    assert.deepEqual(
      described(routesOf("const app = require('express')();\napp.get('/ok', h);", 'src/a.js')),
      ['GET /ok (router-call)'],
    );
  });
});

describe('routeHandlerPath', () => {
  it('drops everything above the app directory', () => {
    assert.equal(routeHandlerPath('src/app/users/route.ts'), '/users');
    assert.equal(routeHandlerPath('app/route.ts'), '/');
  });

  it('keeps dynamic segments', () => {
    assert.equal(routeHandlerPath('app/api/users/[id]/route.ts'), '/api/users/[id]');
  });

  it('strips route groups', () => {
    assert.equal(routeHandlerPath('app/(marketing)/about/route.ts'), '/about');
  });
});

describe('collectRoutes on Next.js route handlers', () => {
  it('reads each exported HTTP method', () => {
    assert.deepEqual(
      described(
        routesOf(
          ['export async function GET() {}', 'export const POST = async () => {};'].join('\n'),
          'app/users/route.ts',
        ),
      ),
      ['GET /users (route-handler)', 'POST /users (route-handler)'],
    );
  });

  it('ignores exports that are not method handlers', () => {
    assert.deepEqual(
      routesOf('export function helper() {}\nexport const get = 1;', 'app/users/route.ts'),
      [],
    );
  });

  it('ignores handlers that are not exported', () => {
    assert.deepEqual(routesOf('function GET() {}', 'app/users/route.ts'), []);
  });
});

describe('pagesApiPath', () => {
  it('builds the URL from the file path', () => {
    assert.equal(pagesApiPath('pages/api/users.ts'), '/api/users');
    assert.equal(pagesApiPath('src/pages/api/users/[id].ts'), '/api/users/[id]');
    assert.equal(pagesApiPath('pages/api/index.ts'), '/api');
  });
});

describe('collectRoutes on Next.js pages endpoints', () => {
  it('reads a default-exported handler', () => {
    assert.deepEqual(
      described(routesOf('export default function handler() {}', 'pages/api/ping.ts')),
      ['ALL /api/ping (pages-api)'],
    );
  });

  it('needs a default export', () => {
    assert.deepEqual(routesOf('export function handler() {}', 'pages/api/ping.ts'), []);
  });
});
