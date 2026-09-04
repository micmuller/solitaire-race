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

export function celebrationProfileFor({ rendererPreference, qualityName, prefersReducedMotion = false } = {}) {
  if (prefersReducedMotion) return { mode: 'static', dialogDelay: 0 };
  if (rendererPreference === 'canvas' || qualityName === 'reduced') return { mode: 'lite', dialogDelay: 650 };
  return { mode: 'full', dialogDelay: 950 };
}
