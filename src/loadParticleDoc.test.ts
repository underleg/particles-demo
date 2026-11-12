import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect } from '@particlr/runtime';
import portalText from '../public/portal.prt?raw';
import { loadParticleDoc } from './loadParticleDoc';

function stubFetch(body: string, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
}

describe('loadParticleDoc', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the shipped Portal effect as a document that simulates', async () => {
    stubFetch(portalText);
    const doc = await loadParticleDoc('/portal.prt');
    expect(doc.meta.name).toBe('Portal');
    // Prove the document actually simulates, not just parses: Portal is prewarmed, so particles exist after one step.
    const fx = new Effect(doc);
    fx.step(1 / 30);
    expect(fx.particleCount).toBeGreaterThan(0);
  });

  it('reports the HTTP status when the file is missing', async () => {
    stubFetch('<html>Not found</html>', 404);
    await expect(loadParticleDoc('/missing.prt')).rejects.toThrow('Failed to fetch /missing.prt: HTTP 404');
  });

  it('lists validation errors for a document that is valid JSON but not an effect', async () => {
    stubFetch('{}');
    await expect(loadParticleDoc('/empty.prt')).rejects.toThrow(/Invalid particle effect \/empty\.prt: schemaVersion:/);
  });

  it('rejects malformed JSON', async () => {
    stubFetch('{not json');
    await expect(loadParticleDoc('/bad.prt')).rejects.toThrow(SyntaxError);
  });
});
