function distanceToRect(point, target) {
  const dx = Math.max(target.x - point.x, 0, point.x - (target.x + target.width));
  const dy = Math.max(target.y - point.y, 0, point.y - (target.y + target.height));
  return dx * dx + dy * dy;
}

export function nearestDropTarget(targets, point, card) {
  const candidates = targets
    .filter((target) => target.zone === 'tableau' || target.zone === 'foundation')
    .map((target) => {
      const marginX = card.width * (target.zone === 'tableau' ? .52 : .38);
      const marginTop = card.height * .38;
      const marginBottom = card.height * (target.zone === 'tableau' ? 1.35 : .45);
      const inside = point.x >= target.x - marginX
        && point.x <= target.x + target.width + marginX
        && point.y >= target.y - marginTop
        && point.y <= target.y + target.height + marginBottom;
      const centerX = target.x + target.width / 2;
      const centerY = target.y + target.height / 2;
      return {
        target,
        inside,
        distance: distanceToRect(point, target),
        centerDistance: (point.x - centerX) ** 2 + (point.y - centerY) ** 2
      };
    })
    .filter((candidate) => candidate.inside)
    .sort((a, b) => a.distance - b.distance || a.centerDistance - b.centerDistance);

  return candidates[0]?.target || null;
}
