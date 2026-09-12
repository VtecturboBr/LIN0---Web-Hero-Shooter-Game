import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';

/** Atributos, arma, passiva, habilidades e história de raijin. */
export const raijin: HeroDef = {
  id: "raijin",
  ai: 'tank',
  name: "RAIJIN",
  title: "O Oni do Trovão",
  role: "Tank",
  color: 0x5ac8ff,
  description: "Guerreiro colossal inspirado em entidades do trovão, acumula carga elétrica em combate.",
  hp: 780,
  moveSpeed: 4.8,
  jumpPower: 7.0,
  weapon: {
    kind: "melee", name: "Martelo Eletromagnético", damage: 78, fireRate: 1.15, ammo: -1,
    reloadTime: 0, spread: 0, auto: true, range: 4.2, cone: 0.65, tracerColor: 0x5ac8ff,
  },
  melee: { damage: 78, range: 4.2, cone: 0.65, rate: 1.15 },
  passive: {
    name: "Pele de Trovão",
    mods: { dmgResist: 0.08 },
    description: "Resistência inata a dano. Sofrer dano gera Carga elétrica.",
  },
  abilities: [
    {
      name: "Pancada do Trovão", key: "Q", cooldown: 7, kind: "slam",
      config: { radius: 5.5, damage: 75, slow: 0.35, slowDur: 2.5, knockback: 6, trailColor: 0x5ac8ff },
      description: "Esmaga o chão, causando dano e lentidão em área.",
      icon: "💥",
    },
    {
      name: "Relâmpago", key: "M2", cooldown: 6, kind: "beam",
      config: { range: 28, damage: 60, trailColor: 0x5ac8ff },
      description: "Dispara um raio de energia elétrica à distância.",
      icon: "⚡",
    },
    {
      name: "Muralha Elétrica", key: "F", cooldown: 13, kind: "buff",
      config: { buffStat: "dmgResist", buffMult: 0.4, duration: 3.5, trailColor: 0x5ac8ff }, defensive: true,
      description: "Cria uma muralha de energia que reduz o dano recebido.",
      icon: "⛩",
    },
  ],
  ultimate: {
    name: "Fúria do Oni do Trovão", key: "E", cooldown: 0, kind: "storm",
    config: { radius: 11, dps: 60, duration: 4.5, slow: 0.3, trailColor: 0x5ac8ff },
    description: "Libera uma tempestade de relâmpagos ao seu redor.",
    icon: "🌩",
  },
  resource: { name: "Carga", icon: "⚡", gainTaken: 10, gainDamage: 18, gainPerCast: 6 },
  cards: cardIds,
  lore: "Um oni forjado em relâmpagos que jurou proteger as fronteiras do reino. Sua pele absorve a fúria das tempestades.",
};
