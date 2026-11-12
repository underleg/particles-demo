import skeletonUrl from '../assets/HalloweenCreature/CreatureScene/HalloweenCreature.skel?url';
import atlasUrl from '../assets/HalloweenCreature/CreatureScene/HalloweenCreature.atlas?url';
import imageUrl from '../assets/HalloweenCreature/CreatureScene/HalloweenCreature.png?url';
import type { SpinePlayback } from './spineAnimation';
import type { SheetGrid } from './bakeSpineSheet';

// The skull art, shared by the app (Spine mode) and export.html (which bakes the flipbook sheet into the .prt files).

export const SPINE_URLS = { skeleton: skeletonUrl, atlas: atlasUrl, image: imageUrl };
export const SKULL: SpinePlayback = { skin: 'skull', animation: 'still', loop: true };
// 40 frames over the 1.28 s 'still' loop is ~31 fps; 96 px cells stay sharp at the largest (90 px) skulls.
export const SHEET_GRID: SheetGrid = { cols: 8, rows: 5, cellPx: 96 };
