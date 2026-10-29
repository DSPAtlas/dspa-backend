import mysql from 'mysql2';
import { currentUserContext } from './userContext.js';

function integerSetting(value, fallback, maximum, name) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return number;
}

function destroy(holder) {
  if (holder && !holder.destroyed) {
    holder.destroyed = true;
    holder.connection.destroy();
  }
}

function release(holder) {
  if (holder && !holder.destroyed) holder.connection.release();
}

function cancellationError() {
  return Object.assign(new Error('Database request was cancelled'), { code: 'ABORT_ERR' });
}

// mysql2 cannot cancel a queued acquisition. Dispose its eventual connection if
// the caller has already left; never leave a late lease checked out in the pool.
function acquire(pool, signal, timeout) {
  if (signal?.aborted) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, holder) => {
      if (settled) {
        if (holder) destroy(holder);
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(holder);
    };
    const abort = () => finish(cancellationError());
    const timer = setTimeout(() => finish(new Error('Database connection acquisition timed out')), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => pool.getConnection()).then(
      connection => finish(null, { connection, destroyed: false }), error => finish(error),
    );
  });
}

// A timeout/abort destroys the physical session, rather than returning an
// in-flight command to the pool. The driver promise remains observed afterwards.
function statement(holder, sql, values, signal, timeout) {
  if (signal?.aborted) {
    destroy(holder);
    return Promise.reject(cancellationError());
  }
  if (holder.destroyed) return Promise.reject(new Error('Database connection is closed'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result, discard = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (discard) destroy(holder);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(cancellationError(), null, true);
    const timer = setTimeout(() => finish(
      Object.assign(new Error('Database query timed out'), { code: 'QUERY_TIMEOUT' }), null, true,
    ), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => holder.connection.query(sql, values)).then(
      result => finish(null, result), error => finish(error, null, true),
    );
  });
}

export function createDatabase({ env = process.env, createPool = options => mysql.createPool(options).promise() } = {}) {
  const mode = env.DB_USER_CONTEXT_MODE || 'shared';
  if (!['shared', 'per-user'].includes(mode)) throw new Error('DB_USER_CONTEXT_MODE must be shared or per-user');
  const timeout = integerSetting(env.DB_QUERY_TIMEOUT_MS, 30000, 300000, 'DB_QUERY_TIMEOUT_MS');
  const options = {
    host: env.DB_HOST || 'localhost', user: env.DB_USER || 'root', password: env.DB_PASSWORD,
    database: env.DB_NAME || 'dynaprotdbv2', port: Number(env.DB_PORT || 3306),
    ...(env.DB_SOCKET_PATH ? { socketPath: env.DB_SOCKET_PATH } : {}),
    waitForConnections: true,
    connectionLimit: integerSetting(env.DB_CONNECTION_LIMIT, 10, 100, 'DB_CONNECTION_LIMIT'),
    queueLimit: 0, connectTimeout: 10000, multipleStatements: false,
    ...(mode === 'per-user' ? { supportBigNumbers: true, bigNumberStrings: true } : {}),
  };
  if (mode === 'per-user') {
    if (env.DB_NAME !== 'app' || env.DB_USER !== 'dspa_backend_reader') {
      throw new Error('Per-user database access requires DB_NAME=app and DB_USER=dspa_backend_reader');
    }
    for (const name of ['DB_PASSWORD', 'DSPA_IDENTITY_DB_USER', 'DSPA_IDENTITY_DB_PASSWORD',
      'DSPA_CONTEXT_DB_USER', 'DSPA_CONTEXT_DB_PASSWORD']) {
      if (!env[name]) throw new Error(`Per-user database access requires ${name}`);
    }
    if (new Set([env.DB_USER, env.DSPA_IDENTITY_DB_USER, env.DSPA_CONTEXT_DB_USER]).size !== 3) {
      throw new Error('Data, identity, and context database accounts must be separate');
    }
  }
  const dataPool = createPool(options);
  if (mode === 'shared') {
    dataPool.mode = mode;
    dataPool.healthCheck = () => dataPool.query('SELECT 1');
    return dataPool;
  }
  const serviceOptions = { ...options, database: undefined };
  const identityPool = createPool({ ...serviceOptions, user: env.DSPA_IDENTITY_DB_USER, password: env.DSPA_IDENTITY_DB_PASSWORD });
  const controlPool = createPool({ ...serviceOptions, user: env.DSPA_CONTEXT_DB_USER, password: env.DSPA_CONTEXT_DB_PASSWORD });
  const query = (holder, sql, values, signal) => statement(holder, sql, values, signal, timeout);
  const uuid = async (holder, signal) => {
    const [rows] = await query(holder, 'SELECT @@server_uuid AS server_uuid', [], signal);
    if (!rows[0]?.server_uuid) throw new Error('MySQL server identity is unavailable');
    return rows[0].server_uuid;
  };

  async function boundQuery(sql, values) {
    const context = currentUserContext();
    if (!context?.serverUuid) throw new Error('Authenticated database context is required');
    const signal = context.signal;
    let data, control, target, result, failure;
    try {
      data = await acquire(dataPool, signal, timeout);
      control = await acquire(controlPool, signal, timeout);
      const [rows] = await query(data,
        'SELECT @@server_uuid AS server_uuid, CONNECTION_ID() AS connection_id, PS_CURRENT_THREAD_ID() AS thread_id', [], signal);
      const metadata = rows[0];
      if (!metadata?.thread_id || !metadata.connection_id || !metadata.server_uuid
          || metadata.server_uuid !== context.serverUuid || metadata.server_uuid !== await uuid(control, signal)) {
        throw new Error('Database context requires the same instrumented MySQL server');
      }
      target = [metadata.connection_id, metadata.thread_id];
      await query(control, 'CALL dspa_security.bind_context(?,?,?,?)',
        [...target, context.userId, Math.max(60, Math.ceil(timeout / 1000) + 30)], signal);
      result = await query(data, sql, values, signal);
    } catch (error) {
      failure = error;
      destroy(data);
    } finally {
      if (target) {
        try {
          // Cleanup deliberately ignores the request abort signal.
          await query(control, 'CALL dspa_security.clear_context(?,?)', target);
        } catch (error) {
          destroy(data);
          destroy(control);
          failure ||= new Error('Database context cleanup failed', { cause: error });
        }
      }
      release(data);
      release(control);
    }
    if (failure) throw failure;
    return result;
  }

  return {
    mode,
    query: boundQuery,
    async resolveUser(issuer, subject, { signal } = {}) {
      let data, identity;
      try {
        data = await acquire(dataPool, signal, timeout);
        identity = await acquire(identityPool, signal, timeout);
        const serverUuid = await uuid(data, signal);
        if (serverUuid !== await uuid(identity, signal)) throw new Error('Identity and data MySQL servers must match');
        const [results] = await query(identity, 'CALL dspa_security.ensure_user(?,?)', [issuer, subject], signal);
        const userId = Number(results[0]?.[0]?.user_id);
        if (!Number.isInteger(userId) || userId < 1 || userId > 4294967295) throw new Error('Invalid resolved user');
        return { userId, serverUuid };
      } catch (error) {
        destroy(data);
        destroy(identity);
        throw error;
      } finally {
        release(data);
        release(identity);
      }
    },
    async healthCheck() {
      let data;
      try {
        data = await acquire(dataPool, undefined, timeout);
        return await query(data, 'SELECT 1', []);
      } catch (error) {
        destroy(data);
        throw error;
      } finally {
        release(data);
      }
    },
    async end() { await Promise.all([dataPool.end(), identityPool.end(), controlPool.end()]); },
  };
}

export default createDatabase();
