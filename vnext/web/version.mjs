export const WEB_CLIENT_VERSION = '0.1.0-alpha.8';

export function labelsFromConfig(config = {}) {
  const serverVersion = config.serverVersion || config.appVersion || '-';
  const protocolVersion = config.protocolVersion || '-';
  return {
    serverVersion,
    protocolVersion,
    webClientVersion: WEB_CLIENT_VERSION
  };
}

export function setVersionMenuOpen(menu, badge, isOpen) {
  menu.hidden = !isOpen;
  badge.setAttribute('aria-expanded', String(isOpen));
}

export function toggleVersionMenu(menu, badge) {
  setVersionMenuOpen(menu, badge, menu.hidden);
}
