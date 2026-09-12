/** Shared simulation time. Paused matches never advance this clock. */
let seconds = Date.now() / 1000;
export const gameNow = () => seconds;
export function resetGameTime() { seconds = Date.now() / 1000; }
export function advanceGameTime(dt: number) { seconds += dt; }
