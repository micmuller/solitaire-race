export function isAppleTouchDevice({ userAgent = '', maxTouchPoints = 0 } = {}) {
  return maxTouchPoints > 1 && /AppleWebKit/i.test(userAgent) && /(?:iPad|Macintosh)/i.test(userAgent);
}

export function rendererPreferenceFor(device = {}) {
  if(device.renderer === 'canvas')return 'canvas';
  if(device.renderer === 'webgl')return 'webgl';
  return isAppleTouchDevice(device) ? 'canvas' : 'webgl';
}

export function tickerMaxFpsFor({ rendererPreference, qualityName } = {}) {
  return rendererPreference === 'canvas' && qualityName === 'reduced' ? 30 : 0;
}

export function normalizeCardAnimationMode(value) {
  return ['auto', 'on', 'off'].includes(value) ? value : 'auto';
}

export function cardAnimationScaleFor({ mode = 'auto', qualityName = 'balanced', qualityMotionScale = 0.85, prefersReducedMotion = false } = {}) {
  if (prefersReducedMotion || normalizeCardAnimationMode(mode) === 'off') return 0;
  if (mode === 'on') return qualityName === 'high' ? 1 : 0.85;
  return qualityName === 'reduced' ? 0 : qualityMotionScale;
}

export function celebrationProfileFor({ rendererPreference, qualityName, prefersReducedMotion = false } = {}) {
  if (prefersReducedMotion) return { mode: 'static', dialogDelay: 0 };
  if (qualityName === 'reduced') return { mode: 'lite', dialogDelay: 900 };
  return { mode: 'full', dialogDelay: 1100 };
}
