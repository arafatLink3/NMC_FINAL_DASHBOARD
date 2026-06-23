/** All keys are namespaced with `nmc.` to mirror the legacy localStorage layout. */
export const PREFIX = 'nmc.';

export function ns(key: string): string {
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

export function deNs(key: string): string {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
}
