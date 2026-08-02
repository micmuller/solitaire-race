export function generateRandomSeed(now = Date.now(), random = Math.random) {
  const time = now.toString(36).toUpperCase();
  const entropy = Math.floor(random() * 0x100000000)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
  return `HN-${time}-${entropy}`;
}
