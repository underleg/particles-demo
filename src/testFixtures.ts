import { parseParticle, type ParticleDoc } from '@particlr/runtime';
import portalText from '../public/portal.prt?raw';
import type { FlipbookSheet } from './skullLayer';

// Shared by the tests only; nothing in the app imports this.

// A 1x1 PNG: the validator checks the data-URL shape, the decode happens later in the browser.
export const SHEET: FlipbookSheet = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  cols: 5,
  rows: 4,
  fps: 30,
};

export function portal(): ParticleDoc {
  const doc = parseParticle(portalText).doc;
  if (!doc) throw new Error('portal.prt failed to parse');
  return doc;
}
