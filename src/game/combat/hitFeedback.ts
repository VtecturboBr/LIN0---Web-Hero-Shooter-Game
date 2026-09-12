import type { Player } from '../actors/Player';
import { audio } from '../../core/audio';

export function hitFeedback(source: Player, target: Player, headshot: boolean, damage: number) {
  if (!source.isLocal || damage <= 0 || source.combat?.presentation) return;
  audio.hit(headshot);
  if (!target.alive) audio.kill();
  (window as any).__hitMarker?.(headshot, !target.alive);
  (window as any).__damageNumber?.(damage, headshot);
}
