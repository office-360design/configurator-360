import { AsyncLocalStorage } from 'node:async_hooks';

const requestContext = new AsyncLocalStorage<{ clientKey: string }>();
export const withClientKey = <T>(clientKey: string, fn: () => T) => requestContext.run({ clientKey }, fn);
export const currentClientKey = () => requestContext.getStore()?.clientKey || 'stdio-internal';
