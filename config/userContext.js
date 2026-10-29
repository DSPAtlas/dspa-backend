import { AsyncLocalStorage } from 'node:async_hooks';

const contexts = new AsyncLocalStorage();

export const currentUserContext = () => contexts.getStore();

// Trusted server middleware supplies this object after resolving the OIDC user.
export function runWithUserContext(context, callback) {
  if (!Number.isInteger(context.userId) || context.userId < 1 || context.userId > 4294967295) {
    throw new Error('A valid authenticated database user is required');
  }
  return contexts.run(Object.freeze({ ...context }), callback);
}
