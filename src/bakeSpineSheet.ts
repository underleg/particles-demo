import { Container, RenderTexture, type Renderer } from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { fitInBox, type Rect } from './layout';
import { animationDuration, localBounds, poseAt } from './spineAnimation';
import type { FlipbookSheet } from './skullLayer';

export interface SheetGrid {
  cols: number;
  rows: number;
  cellPx: number; // bake resolution: particles drawn larger than this blur
}

// Renders one loop of a manually driven Spine instance's animation into a cols x rows grid, then returns it as a
// PNG data URL, the only texture form a .prt document can embed. Frames are evenly spaced over the loop and the
// flipbook fps is set so one pass through the sheet takes exactly one loop of the animation.
export async function bakeSpineSheet(renderer: Renderer, spine: Spine, grid: SheetGrid): Promise<FlipbookSheet> {
  const frames = grid.cols * grid.rows;
  const duration = animationDuration(spine);
  // The whole animation's bounds, so every frame uses the same fit and the skull doesn't jitter between cells.
  const bounds = localBounds(spine);
  const target = RenderTexture.create({ width: grid.cols * grid.cellPx, height: grid.rows * grid.cellPx });
  const stage = new Container();
  stage.addChild(spine);

  for (let i = 0; i < frames; i++) {
    poseAt(spine, (i * duration) / frames);
    const cell: Rect = {
      x: (i % grid.cols) * grid.cellPx,
      y: Math.floor(i / grid.cols) * grid.cellPx,
      width: grid.cellPx,
      height: grid.cellPx,
    };
    const placement = fitInBox(bounds, cell);
    spine.scale.set(placement.scale);
    spine.position.set(placement.x, placement.y);
    renderer.render({ container: stage, target, clear: i === 0 });
  }

  const dataUrl = await renderer.extract.base64(target);
  stage.removeChild(spine);
  stage.destroy();
  target.destroy(true);
  return { dataUrl, cols: grid.cols, rows: grid.rows, fps: frames / duration };
}
