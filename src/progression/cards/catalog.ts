import type { CardDef, DeckCard, Mods, StatKey } from '../../core/types';
import { sharedCards } from './shared';
import { uniqueCards as linoCards } from '../../characters/lino/cards';
import { uniqueCards as yumeCards } from '../../characters/yume/cards';
import { uniqueCards as raijinCards } from '../../characters/raijin/cards';
import { uniqueCards as kitsuneCards } from '../../characters/kitsune/cards';
import { uniqueCards as shinCards } from '../../characters/shin/cards';
import { uniqueCards as kenjiCards } from '../../characters/kenji/cards';
import { HEROES } from '../../characters';

export const CARD_POOL: Record<string, CardDef> = { ...sharedCards, ...linoCards, ...yumeCards, ...raijinCards, ...kitsuneCards, ...shinCards, ...kenjiCards };
export const HERO_DECKS: Record<string, string[]> = Object.fromEntries(HEROES.map(hero => [hero.id, hero.cards]));

export const DECK_RULES = { size: 5, budget: 15, slots: 9, minLevel: 1, maxLevel: 5 };
// All definitions use relative deltas; scale level-3 bonuses to one level.
for (const card of Object.values(CARD_POOL)) {
  for (const key of Object.keys(card.mods ?? {}) as StatKey[]) {
    const value = card.mods![key]!;
    card.mods![key] = key === 'cloneCount' || key === 'onKillSpeedDur' ? value : value / 3;
  }
}
export function cardMods(card: DeckCard): Mods {
  const def = CARD_POOL[card.id];
  if (!def || !Number.isInteger(card.level) || card.level < 1 || card.level > 5) return {};
  return Object.fromEntries(Object.entries(def.mods ?? {}).map(([key, value]) =>
    [key, value * (key === 'onKillSpeedDur' ? 1 : card.level)]));
}
const statLabels: Partial<Record<StatKey, string>> = {
  controlRegen: 'recuperação de Controle', meleeRangeMult: 'alcance da foice',
  maxHp: 'vida máxima', hpRegen: 'vida por segundo', dmgResist: 'resistência a dano',
  lowHpDamage: 'dano abaixo de 40% de vida', defensiveShield: 'escudo ao usar habilidade defensiva',
  moveSpeed: 'velocidade de movimento', jumpPower: 'força do salto', damageMult: 'dano causado',
  headshotMult: 'multiplicador de acerto crítico', ammoMult: 'munição', reloadMult: 'tempo de recarga da arma',
  projSpeed: 'velocidade de projéteis', spreadMult: 'dispersão', lifesteal: 'roubo de vida',
  meleeDamageMult: 'dano corpo a corpo', cooldownMult: 'tempo de recarga das habilidades',
  abilityRadius: 'raio das habilidades', resourceGain: 'geração de recurso', ultGain: 'carga de ultimate',
  ultDamageMult: 'dano do ultimate', onKillHeal: 'da vida máxima curada ao eliminar',
  onKillSpeed: 'velocidade por 2 s ao eliminar', healMult: 'cura causada', shieldMult: 'escudo gerado',
  abilityDamageMult: 'dano das habilidades', dashDamageMult: 'dano de investida',
  spiritHealMult: 'cura dos espíritos', cloneCount: 'clones extras por uso', smokeDuration: 's de duração da névoa',
};
const flatStats = new Set(['hpRegen', 'defensiveShield', 'cloneCount', 'smokeDuration']);
export function cardDescription(card: DeckCard): string {
  return Object.entries(cardMods(card)).filter(([key]) => key !== 'onKillSpeedDur').map(([key, value]) => {
    const n = Math.round(value * (flatStats.has(key) ? 1 : 100) * 100) / 100;
    return `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR')}${flatStats.has(key) ? '' : '%'} ${statLabels[key as StatKey] ?? key}`;
  }).join(' · ') + '.';
}
for (const card of Object.values(CARD_POOL)) card.description = cardDescription({ id: card.id, level: 1 });
