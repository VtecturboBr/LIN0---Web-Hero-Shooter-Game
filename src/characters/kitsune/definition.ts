import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';

/** Atributos, arma, passiva, habilidades e história de kitsune. */
export const kitsune: HeroDef = {
  id: "kitsune",
  ai: 'flanker',
  name: "KITSUNE",
  title: "A Trapaceira de Nove Caudas",
  role: "Controller",
  color: 0xff7ad9,
  description: "Yokai especialista em ilusões, cria clones e névoas para confundir os adversários.",
  hp: 300,
  moveSpeed: 6.4,
  jumpPower: 7.6,
  weapon: {
    kind: "projectile", name: "Kunais Espirituais", damage: 27, fireRate: 3.6, ammo: 24,
    reloadTime: 1.3, spread: 0.01, auto: true, headshotMult: 1.6,
    projectileSpeed: 52, projectileRadius: 0.16, tracerColor: 0xff7ad9,
  },
  melee: { damage: 32, range: 2.6, cone: 0.8, rate: 2.4 },
  passive: {
    name: "Passos de Kitsune", mods: { moveSpeed: 0.08 },
    description: "Velocidade de movimento aumentada permanentemente.",
  },
  abilities: [
    {
      name: "Salto Ilusório", key: "Q", cooldown: 9, kind: "clone",
      config: { speed: 20, duration: 0.25, cloneCount: 1, cloneDuration: 4, trailColor: 0xff7ad9 },
      description: "Investe para frente deixando um clone que atira kunais.",
      icon: "🪞",
    },
    {
      name: "Névoa Enganosa", key: "M2", cooldown: 12, kind: "smoke",
      config: { radius: 5, duration: 4, slow: 0.3 },
      description: "Névoa que desorienta e reduz a velocidade dos inimigos.",
      icon: "🌫",
    },
    {
      name: "Troca Fantasma", key: "F", cooldown: 8, kind: "teleport",
      config: { range: 8 },
      description: "Troca de lugar com um clone, ou desloca-se para frente.",
      icon: "👻",
    },
  ],
  ultimate: {
    name: "Mil Máscaras", key: "E", cooldown: 0, kind: "illusions",
    config: { count: 3, damage: 14, duration: 7, trailColor: 0xff7ad9 },
    description: "Invoca múltiplas ilusões que atacam os inimigos.",
    icon: "🦊",
  },
  resource: { name: "Caudas", icon: "🦊", gainPerCast: 3, gainDamage: 22 },
  cards: cardIds,
  lore: "Uma kitsune de nove caudas que adora pregar peças nos mortais e nos deuses. Ninguém sabe qual de suas formas é real.",
};
