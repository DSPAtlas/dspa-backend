import { timingSafeEqual } from 'node:crypto';
import db from '../config/database.js';
import { runWithUserContext, currentUserContext } from '../config/userContext.js';

export function encodePrincipalComponent(value) {
  return [...Buffer.from(value, 'utf8')].map(byte =>
    ((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57)
      || [42, 45, 46, 95].includes(byte)) ? String.fromCharCode(byte)
      : byte === 32 ? '+' : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
  ).join('');
}

export function decodePrincipal(principal) {
  if (typeof principal !== 'string' || principal.length > 6 + 12 * (512 + 255)) throw new Error('Invalid principal');
  const parts = principal.split(':');
  if (parts.length !== 3 || parts[0] !== 'oidc') throw new Error('Invalid principal');
  const identity = parts.slice(1).map((encoded, index) => {
    const value = decodeURIComponent(encoded.replaceAll('+', ' '));
    if (!value.trim() || [...value].length > [512, 255][index] || encodePrincipalComponent(value) !== encoded) {
      throw new Error('Invalid principal');
    }
    return value;
  });
  if (identity[0] === 'urn:dspa:internal') throw new Error('Invalid principal');
  return identity;
}

function singleHeader(request, name) {
  const values = [];
  // rawHeaders retains duplicates that Node's convenience headers may merge.
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) values.push(request.rawHeaders[index + 1]);
  }
  if (values.length !== 1) throw new Error('Missing trusted gateway identity');
  return values[0];
}

export function createUserContextMiddleware({ database = db, env = process.env } = {}) {
  if (database.mode === 'shared') return (_request, _response, next) => next();
  const expected = Buffer.from(env.DSPA_WEBAPP_GATEWAY_TOKEN || '', 'utf8');
  if (!expected.length) throw new Error('Per-user web access requires DSPA_WEBAPP_GATEWAY_TOKEN');
  return async (request, response, next) => {
    response.set('Cache-Control', 'private, no-store');
    let principal, issuer, subject;
    try {
      const supplied = Buffer.from(singleHeader(request, 'x-dspa-webapp-token'), 'utf8');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid gateway token');
      principal = singleHeader(request, 'x-user-id');
      [issuer, subject] = decodePrincipal(principal);
    } catch {
      response.status(401).json({ error: 'Authenticated gateway request required.' });
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const cleanup = () => {
      request.removeListener('aborted', abort);
      response.removeListener('close', finish);
      response.removeListener('finish', finish);
    };
    const finish = () => { abort(); cleanup(); };
    request.once('aborted', abort);
    response.once('close', finish);
    response.once('finish', finish);
    if (request.aborted || response.destroyed) abort();
    try {
      const resolved = await database.resolveUser(issuer, subject, { signal: controller.signal });
      if (controller.signal.aborted) { cleanup(); return; }
      runWithUserContext({ ...resolved, principal, issuer, subject, signal: controller.signal }, () => {
        Object.defineProperty(request, 'userContext', { value: currentUserContext(), writable: false });
        next();
      });
    } catch (error) {
      cleanup();
      if (controller.signal.aborted) return;
      const denied = error.errno === 1644;
      response.status(denied ? 403 : 503).json({
        error: denied ? 'This user cannot access data.' : 'User identity service unavailable.',
      });
    }
  };
}

export default createUserContextMiddleware();
