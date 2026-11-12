import { parseParticle, type ParticleDoc } from '@particlr/runtime';

// Returns the document rather than an Effect so the caller can adapt it (the skull layer) before simulating it.
// Kept free of pixi.js so it can be tested in plain Node.
export async function loadParticleDoc(url: string): Promise<ParticleDoc> {
  const response = await fetch(url);
  // Without this check a 404 page's HTML would reach the parser and fail with a misleading JSON error.
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);

  const result = parseParticle(await response.text());
  if (!result.ok || !result.doc) {
    const issues = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid particle effect ${url}: ${issues}`);
  }
  return result.doc;
}
