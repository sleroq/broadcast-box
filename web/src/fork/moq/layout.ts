export type PlayerLayout = {
  aspectRatio: number;
  controlsHeight: number;
};

export function playerHeight(width: number, layout?: PlayerLayout): number {
  return layout ? width / layout.aspectRatio + layout.controlsHeight : width * 9 / 16;
}
