export function isAppleTouchDevice({ userAgent = '', maxTouchPoints = 0 } = {}) {
  return maxTouchPoints > 1 && /AppleWebKit/i.test(userAgent) && /(?:iPad|Macintosh)/i.test(userAgent);
}

export function rendererPreferenceFor(device = {}) {
  if(device.renderer === 'canvas')return 'canvas';
  if(device.renderer === 'webgl')return 'webgl';
  return isAppleTouchDevice(device) ? 'canvas' : 'webgl';
}
