export type CaptureTeam = -1 | 0 | 1;
export interface CaptureState { progress: number; controller: CaptureTeam; claimant: CaptureTeam; contested: boolean; }

/** Opponents first neutralize the existing claim, then capture their own point. */
export function advanceCapture(state: CaptureState, inside: [boolean, boolean], dt: number): { captured: CaptureTeam; scoring: CaptureTeam } {
  const previous = state.controller;
  state.contested = inside[0] && inside[1];
  if (state.contested) return { captured: -1, scoring: -1 };
  const team: CaptureTeam = inside[0] ? 0 : inside[1] ? 1 : -1;
  if (team === -1) {
    // A fully captured point remains owned; incomplete claims decay when abandoned.
    if (state.controller === -1) {
      state.progress = Math.max(0, state.progress - dt * 8);
      if (!state.progress) state.claimant = -1;
    }
  } else if (state.claimant !== -1 && state.claimant !== team) {
    state.progress = Math.max(0, state.progress - dt * 24);
    if (!state.progress) { state.controller = -1; state.claimant = team; }
  } else {
    state.claimant = team;
    state.progress = Math.min(100, state.progress + dt * 12);
    if (state.progress === 100) state.controller = team;
  }
  return {
    captured: state.controller !== -1 && state.controller !== previous ? state.controller : -1,
    // An enemy on the point also blocks scoring during neutralization.
    scoring: state.controller >= 0 && (team === -1 || team === state.controller) ? state.controller : -1,
  };
}
