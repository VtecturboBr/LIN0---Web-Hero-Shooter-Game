import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';

/** Atributos, arma, passiva, habilidades e história de yume. */
export const yume: HeroDef = {
  id: "yume",
  ai: 'support',
  name: "YUME",
  title: "A Donzela Espiritual",
  role: "Support",
  color: 0x7ee0b0,
  description: "Miko que invoca espíritos para curar aliados e atacar inimigos com seu arco sagrado.",
  hp: 300,
  moveSpeed: 6.0,
  jumpPower: 7.5,
  weapon: {
    kind: "projectile", name: "Arco Espiritual", damage: 65, fireRate: 1.1, ammo: 18,
    reloadTime: 1.1, spread: 0.006, auto: false, headshotMult: 1.5,
    projectileSpeed: 46, projectileRadius: 0.3, gravity: 0.6, tracerColor: 0x7ee0b0,
  },
  melee: { damage: 30, range: 2.6, cone: 0.8, rate: 2.5 },
  passive: {
    name: "Presença da Miko", mechanic: "auraRegen",
    auraRadius: 12, healPerSec: 4,
    description: "Aliados próximos regeneram 4 de vida por segundo.",
  },
  abilities: [
    {
      name: "Espírito Curandeiro", key: "Q", cooldown: 9, kind: "summon",
      config: { summonKind: "heal", summonHp: 999, duration: 6, healPerSec: 20 },
      description: "Invoca um espírito que cura o aliado mais ferido ao redor.",
      icon: "✨",
    },
    {
      name: "Espírito Guardião", key: "M2", cooldown: 11, kind: "summon",
      config: { summonKind: "attack", summonHp: 999, duration: 7, damage: 18 },
      description: "Espírito que atira rajadas espirituais em inimigos próximos.",
      icon: "👁",
    },
    {
      name: "Ofuda de Proteção", key: "F", cooldown: 12, kind: "shield",
      config: { shield: 120, duration: 4 }, defensive: true,
      description: "Concede um escudo espiritual a você.",
      icon: "🛡",
    },
  ],
  ultimate: {
    name: "Dança dos Espíritos", key: "E", cooldown: 0, kind: "nova",
    config: { radius: 14, healPerSec: 50, duration: 4, buffStat: "damageMult", buffMult: 0.2, buffDuration: 6 },
    description: "Espíritos dançam ao redor curando aliados e aumentando o dano do time.",
    icon: "🌸",
  },
  resource: { name: "Favor", icon: "❀", gainHeal: 12, gainDamage: 30, gainPerCast: 4 },
  cards: cardIds,
  lore: "Miko do santuário de Tsukikage, capaz de conversar com espíritos. Protetora incansável de seus aliados.",
};
