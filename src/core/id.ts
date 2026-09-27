/**
 * Collision-resistant id generator. Uses `crypto.randomUUID` when available
 * (all modern browsers + Node 19+) and falls back to `getRandomValues`.
 */
export function newId(prefix: string): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}_${cryptoObj.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  const bytes = new Uint8Array(8);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `${prefix}_${hex}`;
}
