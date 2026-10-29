import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createDatabase } from '../config/database.js';
import { runWithUserContext, currentUserContext } from '../config/userContext.js';
import { createUserContextMiddleware, decodePrincipal } from '../middleware/userContext.js';

const env = {
  DB_USER_CONTEXT_MODE: 'per-user', DB_NAME: 'app', DB_USER: 'dspa_backend_reader', DB_PASSWORD: 'reader-secret',
  DSPA_IDENTITY_DB_USER: 'identity', DSPA_IDENTITY_DB_PASSWORD: 'identity-secret',
  DSPA_CONTEXT_DB_USER: 'control', DSPA_CONTEXT_DB_PASSWORD: 'control-secret',
  DSPA_WEBAPP_GATEWAY_TOKEN: 'private-gateway-token', DB_QUERY_TIMEOUT_MS: '1000', DB_CONNECTION_LIMIT: '1',
};
const principal = subject => `oidc:https%3A%2F%2Fissuer.example:${subject}`;
const user = (userId, signal) => ({ userId, serverUuid: 'server-a', principal: principal(userId === 11 ? 'alice' : 'bob'), signal });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

function harness(overrides = {}) {
  const events = [], bindings = new Map(), pools = {}, connections = [];
  let nextId = 1;
  const hooks = { ...overrides };
  function createPool(options) {
    const role = options.user === 'dspa_backend_reader' ? 'data' : options.user;
    let current, busy = false;
    const waiting = [];
    const pool = {
      options,
      async getConnection() {
        if (busy) await new Promise(resolve => waiting.push(resolve));
        busy = true;
        if (!current || current.destroyed) {
          const id = nextId++;
          current = {
            id, role, destroyed: false,
            async query(sql, parameters = []) {
              events.push({ role, id, sql, parameters });
              if (this.destroyed) throw new Error('closed');
              if (sql.includes('PS_CURRENT_THREAD_ID')) return [[{
                server_uuid: 'server-a', connection_id: id, thread_id: hooks.noThread ? null : id + 100,
              }]];
              if (sql.includes('@@server_uuid')) return [[{ server_uuid: hooks.otherServer === role ? 'server-b' : 'server-a' }]];
              if (sql.includes('ensure_user')) return [[[{ user_id: parameters[1] === 'alice' ? 11 : 22 }], {}]];
              if (sql.includes('bind_context')) {
                if (hooks.failBind) throw new Error('bind failed');
                bindings.set(parameters[0], parameters[2]);
                return [[]];
              }
              if (sql.includes('clear_context')) {
                if (hooks.failClear) throw new Error('clear failed');
                bindings.delete(parameters[0]);
                return [[]];
              }
              if (sql === 'SELECT 1') return [[{ 1: 1 }]];
              assert.equal(role, 'data');
              assert.ok(bindings.has(id), 'private query must have a bound owner');
              if (hooks.applicationQuery) return hooks.applicationQuery(this, bindings.get(id), sql);
              return [[{ owner: bindings.get(id), connection: id }]];
            },
            release() {
              assert.ok(!this.destroyed, 'destroyed connections cannot return to the pool');
              if (role === 'data') assert.ok(!bindings.has(id), 'release requires cleared ownership');
              events.push({ role, id, release: true });
              busy = false;
              waiting.shift()?.();
            },
            destroy() {
              if (this.destroyed) return;
              this.destroyed = true;
              events.push({ role, id, destroyed: true });
              busy = false;
              waiting.shift()?.();
            },
          };
          connections.push(current);
        }
        return current;
      },
      async end() {},
    };
    pools[role] = pool;
    return pool;
  }
  const db = createDatabase({ env: { ...env, ...overrides.env }, createPool });
  return { db, pools, events, bindings, connections, hooks };
}

test('per-user configuration fails before creating a pool with unsafe or incomplete accounts', () => {
  for (const changes of [{ DB_NAME: 'dynaprotdbv2' }, { DB_USER: 'root' }, { DSPA_CONTEXT_DB_PASSWORD: '' },
    { DSPA_CONTEXT_DB_USER: 'identity' }, { DB_USER_CONTEXT_MODE: 'oops' }, { DB_QUERY_TIMEOUT_MS: 'NaN' }]) {
    assert.throws(() => createDatabase({ env: { ...env, ...changes }, createPool() { assert.fail('must validate before connecting'); } }));
  }
});

test('shared mode preserves direct promise-pool access and provides explicit health check', async () => {
  const seen = [];
  const pool = { async query(...args) { seen.push(args); return [[]]; } };
  const db = createDatabase({ env: {}, createPool: () => pool });
  assert.equal(db, pool);
  await db.query('SELECT shared_data', [1]);
  await db.healthCheck();
  assert.deepEqual(seen, [['SELECT shared_data', [1]], ['SELECT 1']]);
});

test('missing authenticated context rejects before acquiring any database connection', async () => {
  const { db, events } = harness();
  await assert.rejects(db.query('SELECT private_data'), /Authenticated database context/);
  assert.equal(events.length, 0);
  await db.healthCheck();
  assert.deepEqual(events.filter(event => event.sql).map(event => event.sql), ['SELECT 1']);
});

test('A/B/A pooled reuse binds every query and clears before each release', async () => {
  const { db, events, bindings } = harness();
  const results = [];
  for (const owner of [11, 22, 11]) {
    results.push(await runWithUserContext(user(owner), () => db.query('SELECT private_data')));
  }
  assert.deepEqual(results.map(result => result[0][0].owner), [11, 22, 11]);
  assert.equal(new Set(results.map(result => result[0][0].connection)).size, 1);
  assert.equal(events.filter(event => event.sql?.includes('bind_context')).length, 3);
  assert.deepEqual(events.filter(event => event.sql?.includes('bind_context'))
    .map(event => event.parameters[3]), [28_800, 28_800, 28_800]);
  assert.equal(events.filter(event => event.sql?.includes('clear_context')).length, 3);
  assert.equal(bindings.size, 0);
});

test('concurrent owners retain separate async context while one waits for a pooled connection', async () => {
  const started = deferred(), release = deferred();
  const { db, bindings } = harness({ applicationQuery: async (_connection, owner) => {
    if (owner === 11) { started.resolve(); await release.promise; }
    return [[{ owner }]];
  } });
  const a = runWithUserContext(user(11), () => db.query('SELECT private_data'));
  await started.promise;
  const b = runWithUserContext(user(22), () => db.query('SELECT private_data'));
  release.resolve();
  const results = await Promise.all([a, b]);
  assert.deepEqual(results.map(result => result[0][0].owner), [11, 22]);
  assert.equal(bindings.size, 0);
  assert.equal(currentUserContext(), undefined);
});

test('connection and performance-schema mismatches fail closed before application queries', async () => {
  for (const failure of [{ otherServer: 'control' }, { noThread: true }]) {
    const { db, events } = harness(failure);
    await assert.rejects(runWithUserContext(user(11), () => db.query('SELECT private_data')), /same instrumented/);
    assert.ok(!events.some(event => event.sql === 'SELECT private_data'));
    assert.ok(events.some(event => event.role === 'data' && event.destroyed));
  }
});

test('binding failure cannot run a private query or reuse the data session', async () => {
  const { db, events } = harness({ failBind: true });
  await assert.rejects(runWithUserContext(user(11), () => db.query('SELECT private_data')), /bind failed/);
  assert.ok(!events.some(event => event.sql === 'SELECT private_data'));
  assert.ok(events.some(event => event.role === 'data' && event.destroyed));
});

test('cleanup failure discards the connection even after a successful query', async () => {
  const { db, events, hooks } = harness({ failClear: true });
  await assert.rejects(runWithUserContext(user(11), () => db.query('SELECT private_data')), /cleanup failed/);
  const oldId = events.find(event => event.role === 'data').id;
  hooks.failClear = false;
  const [[result]] = await runWithUserContext(user(22), () => db.query('SELECT private_data'));
  assert.equal(result.owner, 22);
  assert.notEqual(result.connection, oldId);
  assert.ok(!events.some(event => event.id === oldId && event.release));
});

test('application query failure clears ownership and destroys the failed session', async () => {
  const { db, bindings, events } = harness({ applicationQuery: async () => { throw new Error('query failed'); } });
  await assert.rejects(runWithUserContext(user(11), () => db.query('SELECT private_data')), /query failed/);
  assert.equal(bindings.size, 0);
  assert.ok(events.some(event => event.role === 'data' && event.destroyed));
});

test('query timeout destroys the active connection and clears its owner', async () => {
  const { db, bindings, events } = harness({ env: { DB_QUERY_TIMEOUT_MS: '20' }, applicationQuery: () => new Promise(() => {}) });
  await assert.rejects(runWithUserContext(user(11), () => db.query('SELECT private_data')), { code: 'QUERY_TIMEOUT' });
  assert.equal(bindings.size, 0);
  assert.ok(events.some(event => event.role === 'data' && event.destroyed));
  assert.equal(events.find(event => event.sql?.includes('bind_context')).parameters[3], 28_800);
});

test('request abort destroys an active query and allows another owner to continue', async () => {
  const started = deferred(), controller = new AbortController();
  const { db, bindings, hooks } = harness({ applicationQuery: () => { started.resolve(); return new Promise(() => {}); } });
  const request = runWithUserContext(user(11, controller.signal), () => db.query('SELECT private_data'));
  await started.promise;
  controller.abort();
  await assert.rejects(request, { code: 'ABORT_ERR' });
  assert.equal(bindings.size, 0);
  delete hooks.applicationQuery;
  const [[result]] = await runWithUserContext(user(22), () => db.query('SELECT private_data'));
  assert.equal(result.owner, 22);
});

test('aborted pooled acquisition destroys its eventual lease without running SQL', async () => {
  const started = deferred(), release = deferred(), controller = new AbortController();
  const { db, events } = harness({ applicationQuery: async () => { started.resolve(); await release.promise; return [[]]; } });
  const a = runWithUserContext(user(11), () => db.query('SELECT private_data'));
  await started.promise;
  const b = runWithUserContext(user(22, controller.signal), () => db.query('SELECT other_private_data'));
  controller.abort();
  await assert.rejects(b, { code: 'ABORT_ERR' });
  release.resolve();
  await a;
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!events.some(event => event.sql === 'SELECT other_private_data'));
  assert.ok(events.some(event => event.role === 'data' && event.destroyed));
});

test('identity resolution verifies server identity and uses only ensure_user parameters', async () => {
  const { db, events } = harness();
  assert.deepEqual(await db.resolveUser('https://issuer.example', 'alice'), { userId: 11, serverUuid: 'server-a' });
  assert.deepEqual(events.find(event => event.sql?.includes('ensure_user')).parameters, ['https://issuer.example', 'alice']);
  const mismatch = harness({ otherServer: 'identity' });
  await assert.rejects(mismatch.db.resolveUser('https://issuer.example', 'alice'), /must match/);
  assert.ok(!mismatch.events.some(event => event.sql?.includes('ensure_user')));
});

function requestResponse(headers = [
  'X-DSPA-Webapp-Token', env.DSPA_WEBAPP_GATEWAY_TOKEN, 'X-User-ID', principal('alice'),
]) {
  const request = Object.assign(new EventEmitter(), { rawHeaders: headers, body: { userId: 999 }, query: { userId: 999 } });
  const response = Object.assign(new EventEmitter(), {
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.emit('finish'); },
  });
  return { request, response };
}

test('middleware rejects missing, forged, duplicate and non-OIDC identity before resolving users', async () => {
  const database = { mode: 'per-user', resolveUser: () => assert.fail('must authenticate first') };
  const middleware = createUserContextMiddleware({ database, env });
  for (const headers of [[], ['X-DSPA-Webapp-Token', 'forged', 'X-User-ID', principal('alice')],
    ['X-DSPA-Webapp-Token', env.DSPA_WEBAPP_GATEWAY_TOKEN, 'X-User-ID', 'dev:alice'],
    ['X-DSPA-Webapp-Token', env.DSPA_WEBAPP_GATEWAY_TOKEN, 'X-User-ID', principal('alice'), 'X-User-ID', principal('bob')],
    ['X-DSPA-Webapp-Token', env.DSPA_WEBAPP_GATEWAY_TOKEN, 'X-DSPA-Webapp-Token', env.DSPA_WEBAPP_GATEWAY_TOKEN, 'X-User-ID', principal('alice')]]) {
    const { request, response } = requestResponse(headers);
    await middleware(request, response, () => assert.fail('must not dispatch'));
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
  }
});

test('middleware exposes immutable resolved context and aborts it when the response ends', async () => {
  const { db } = harness();
  const middleware = createUserContextMiddleware({ database: db, env });
  const { request, response } = requestResponse();
  let operation, context;
  await middleware(request, response, () => {
    context = currentUserContext();
    assert.equal(context, request.userContext);
    assert.ok(Object.isFrozen(context));
    assert.equal(context.userId, 11);
    assert.equal(context.principal, principal('alice'));
    assert.throws(() => { request.userContext = user(999); }, TypeError);
    operation = db.query('SELECT private_data');
  });
  assert.equal((await operation)[0][0].owner, 11);
  response.emit('finish');
  assert.equal(context.signal.aborted, true);
  assert.equal(request.listenerCount('aborted'), 0);
  assert.equal(response.listenerCount('close'), 0);
});

test('shared middleware retains public access without authenticating', () => {
  let called = false;
  createUserContextMiddleware({ database: { mode: 'shared' }, env: {} })({}, {}, () => { called = true; });
  assert.equal(called, true);
  assert.throws(() => createUserContextMiddleware({ database: { mode: 'per-user' }, env: {} }), /GATEWAY_TOKEN/);
});

test('principal codec matches canonical Rust form encoding and rejects alternate encodings', () => {
  assert.deepEqual(decodePrincipal(principal('a+b%2Bc%3A*%7E%C3%A9')), ['https://issuer.example', 'a b+c:*~é']);
  for (const invalid of ['dev:alice', 'oidc:issuer:', 'oidc:issuer:a:b', 'oidc:issuer:a%20b',
    'oidc:issuer:%ff', 'oidc:issuer:%GG', 'oidc:issuer:~', 'oidc:issuer:a&b',
    'oidc:urn%3Adspa%3Ainternal:alice', `oidc:issuer:${'a'.repeat(256)}`]) {
    assert.throws(() => decodePrincipal(invalid));
  }
});
