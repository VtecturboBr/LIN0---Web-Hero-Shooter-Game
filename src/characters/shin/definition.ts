import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';

/** Atributos, arma, passiva, habilidades e história de shin. */
export const shin: HeroDef = {
  id: "shin",
  ai: 'sniper',
  name: "SHIN",
  title: "O Shinobi Cibernético",
  role: "Damage",
  color: 0x8b6cff,
  description: "Assassino ágil com salto duplo, shurikens e névoa de fumaça cibernética.",
  hp: 315,
  moveSpeed: 6.6,
  jumpPower: 8.2,
  weapon: {
    kind: "hitscan", name: "Metralhadora de Shurikens", damage: 14, fireRate: 11, ammo: 36,
    reloadTime: 1.4, spread: 0.035, auto: true, headshotMult: 1.6, tracerColor: 0x8b6cff,
  },
  melee: { damage: 35, range: 2.8, cone: 0.75, rate: 2.3 },
  passive: {
    name: "Salto Duplo", mechanic: "doubleJump",
    description: "Pode pular uma segunda vez no ar.",
  },
  abilities: [
    {
      name: "Shuriken Triplo", key: "Q", cooldown: 6, kind: "projectile",
      config: { damage: 22, speed: 50, radius: 0.2, shots: 3, spread: 0.18, trailColor: 0x8b6cff },
      description: "Lança três shurikens em leque.",
      icon: "✴",
    },
    {
      name: "Névoa de Fumaça", key: "M2", cooldown: 10, kind: "smoke",
      config: { radius: 4.5, duration: 3.5, slow: 0.2 },
      description: "Nuvem de fumaça que desorienta os inimigos.",
      icon: "💨",
    },
    {
      name: "Passo Sombrio", key: "F", cooldown: 7, kind: "dash",
      config: { speed: 30, duration: 0.22, invuln: 0.35, trailColor: 0x8b6cff },
      description: "Desloca-se rapidamente ficando brevemente invulnerável.",
      icon: "🌑",
    },
  ],
  ultimate: {
    name: "Execução do Shinobi", key: "E", cooldown: 0, kind: "mark",
    config: { range: 30, damage: 150, duration: 1.2 },
    description: "Marca o inimigo mais próximo: ele sofre dano massivo após um instante.",
    icon: "☠",
  },
  resource: { name: "Ki", icon: "🌀", gainDamage: 10, regen: 1.5 },
  cards: cardIds,
  lore: "Um shinobi aprimorado por implantes cibernéticos, treinado nas sombras de Neo-Tóquio. Ninguém o vê chegar.",
};
