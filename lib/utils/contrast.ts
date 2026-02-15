function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const [fr, fg, fb] = foreground;
  const [br, bg, bb] = background;
  const l1 = 0.2126 * linearize(fr) + 0.7152 * linearize(fg) + 0.0722 * linearize(fb);
  const l2 = 0.2126 * linearize(br) + 0.7152 * linearize(bg) + 0.0722 * linearize(bb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}
