/**
 * Id minting, shared by everything that creates world objects. It lives on its
 * own so the marketplace can mint offer ids without importing factory.ts, which
 * needs to import the marketplace back to seed the opening board.
 */
let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
