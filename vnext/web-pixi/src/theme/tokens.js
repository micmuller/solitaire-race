export const TOKENS = Object.freeze({
  colors: {
    felt: 0x082a20, feltLight: 0x124a35, wood: 0x21130c, woodLight: 0x4a2915,
    leather: 0x441913, brass: 0xa77731, brassLight: 0xe4bd6d, amber: 0xffb44c,
    ivory: 0xf3ead6, ink: 0x17120f, red: 0x9c281f, black: 0x17130f, slot: 0x142319
  },
  card: { aspect: 1.42, radius: 7 },
  spacing: { xs: 4, sm: 8, md: 14, lg: 22 },
  z: { background: 0, zones: 10, cards: 20, transient: 30, effects: 40, debug: 50 },
  motion: { hover: 110, move: 220, reject: 160, flip: 180, glow: 320 }
});

export const QUALITY_PROFILES = Object.freeze({
  high: { resolutionCap: 2, particles: 26, shadows: true, motionScale: 1 },
  balanced: { resolutionCap: 1.5, particles: 12, shadows: true, motionScale: 0.85 },
  reduced: { resolutionCap: 1, particles: 0, shadows: false, motionScale: 0 }
});

export function resolveQuality(value, prefersReducedMotion = false) {
  const key = prefersReducedMotion ? 'reduced' : (QUALITY_PROFILES[value] ? value : 'balanced');
  return { name: key, ...QUALITY_PROFILES[key] };
}
