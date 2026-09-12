export function glyph(kind: string) {
  const shapes: Record<string, string> = {
    mold: '<path d="M5 40V15h38v25M5 27h38M17 15v12m14-12v12m-7 0v13M12 40V27m24 0v13"/>',
    tether: '<path d="M8 41q18 0 14-15T33 9M28 4l15 4-10 12m0-11L8 41"/>',
    matterfield: '<ellipse cx="24" cy="30" rx="21" ry="12"/><path d="M24 5v25L5 38m19-8 19 8M24 30 5 23m19 7 19-7"/>',
    passive: '<path d="m24 4 5 13 15 7-15 6-5 14-6-14-14-6 14-7Z"/><path d="m24 15 8 9-8 9-8-9Z"/>',
    weapon: '<path d="m7 35 25-25 8 3-4 9-25 19ZM12 29l7 7M30 12l6 6M9 35l-4 8"/>',
    dash: '<path d="m8 9 16 15L8 39l29-15ZM3 17l8 7-8 7"/>',
    shield: '<path d="m24 4 16 7-3 20-13 13-13-13-3-20Z"/><path d="M24 12v23m-10-11h20"/>',
    buff: '<path d="m24 4 16 7-3 20-13 13-13-13-3-20Z"/><path d="m16 23 6 6 12-14"/>',
    smoke: '<path d="M6 34h31a7 7 0 0 0-1-14 12 12 0 0 0-23-4 9 9 0 0 0-7 18Zm5 7h24"/>',
    summon: '<circle cx="24" cy="24" r="14"/><path d="M24 2v8m0 28v8M2 24h8m28 0h8m-32-8 6 8-6 8m20-16-6 8 6 8"/>',
    ultimate: '<path d="m24 3 7 10 13 4-7 12 1 13-14-3-14 3 1-13-7-12 13-4Z"/><path d="m26 12-9 14h9l-4 11 11-16h-9Z"/>',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">${shapes[kind] ?? '<path d="m5 39 11-22L42 5 29 32ZM16 17l13 15M9 33l7 6"/>'}</svg>`;
}
