import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestDropTarget } from '../src/input/drop-target.js';

const card = { width: 100, height: 142 };
const targets = [
  { zone: 'tableau', index: 0, x: 200, y: 400, width: 100, height: 142 },
  { zone: 'tableau', index: 1, x: 340, y: 400, width: 100, height: 142 },
  { zone: 'foundation', index: 0, x: 500, y: 180, width: 100, height: 142 }
];

test('accepts a card released near a tableau pile', () => {
  assert.equal(nearestDropTarget(targets, { x: 175, y: 590 }, card)?.index, 0);
});

test('chooses the closest pile when generous hit areas overlap', () => {
  assert.equal(nearestDropTarget(targets, { x: 335, y: 470 }, card)?.index, 1);
});

test('accepts a nearby foundation without swallowing distant drops', () => {
  assert.equal(nearestDropTarget(targets, { x: 535, y: 160 }, card)?.zone, 'foundation');
  assert.equal(nearestDropTarget(targets, { x: 50, y: 50 }, card), null);
});
