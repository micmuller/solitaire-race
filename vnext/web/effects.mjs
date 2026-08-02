export function cueForIntentResult(intentKind, response) {
  if (!response || typeof response !== 'object') return null;
  if (response.kind === 'reject') return 'invalid';
  if (response.kind === 'snapshot' && response.reason !== 'INITIAL_CONNECT') return 'sync';
  if (response.kind !== 'ack') return null;
  if (intentKind === 'draw' || intentKind === 'recycle') return 'draw';
  if (intentKind === 'foundationMove') return 'foundation';
  if (intentKind === 'tableauMove' || intentKind === 'flip') return 'move';
  return 'move';
}
