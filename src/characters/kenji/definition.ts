import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';

/** Atributos, arma, passiva, habilidades e história de kenji. */
export const kenji: HeroDef = {
  id: "kenji",
  ai: 'aggressive',
  name: "KENJI",
  title: "O Monge do Vazio",
  role: "Damage",
  color: 0xff9a3d,
  description: "Monge guerreiro que canaliza o vazio em punhos devastadores e ondas de ki.",
  hp: 390,
  moveSpeed: 6.2,
  jumpPower: 7.5,
  weapon: {
    kind: "melee", name: "Punhos do Vazio", damage: 40, fireRate: 2.3, ammo: -1,
    reloadTime: 0, spread: 0, auto: true, range: 3.2, cone: 0.7, tracerColor: 0xff9a3d,
    alt: { name: "Onda de Ki", damage: 34, fireRate: 0.9, projectileSpeed: 42, projectileRadius: 0.35 },
  },
  melee: { damage: 40, range: 3.2, cone: 0.7, rate: 2.3 },
  passive: {
    name: "Manto do Vazio", mechanic: "meleeResource",
    stackSpeed: .06, maxStacks: 3, stackDuration: 2,
    description: "Golpes corpo a corpo geram Chi e acumulam +6% de velocidade (até 3 acúmulos).",
  },
  abilities: [
    {
      name: "Golpe do Templo", key: "Q", cooldown: 7, kind: "slam",
      config: { radius: 4.5, damage: 62, slow: 0.4, slowDur: 2, knockback: 5, trailColor: 0xff9a3d },
      description: "Ondas de choque do vazio causam dano e lentidão ao redor.",
      icon: "👊",
    },
    {
      name: "Barreira Espiritual", key: "M2", cooldown: 12, kind: "shield",
      config: { shield: 130, duration: 4 }, defensive: true,
      description: "Conjura uma barreira de ki que absorve dano.",
      icon: "🧿",
    },
    {
      name: "Investida do Monge", key: "F", cooldown: 6, kind: "dash",
      config: { speed: 22, duration: 0.22, damage: 45, radius: 1.5, trailColor: 0xff9a3d },
      description: "Avança rapidamente, atropelando inimigos no caminho.",
      icon: "💨",
    },
  ],
  ultimate: {
    name: "Palma do Vazio", key: "E", cooldown: 0, kind: "wave",
    config: { damage: 210, speed: 46, radius: 1.5, pierce: 8, trailColor: 0xff9a3d },
    description: "Libera uma onda gigante do vazio que perfura todos os inimigos.",
    icon: "🖐",
  },
  resource: { name: "Chi", icon: "☯", gainDamage: 15, gainMeleeHit: 3, gainPerCast: 5 },
  cards: cardIds,
  lore: "Monge de um templo oculto que aprendeu a canalizar o vazio entre os mundos. Seus punhos quebram tanto corpos quanto espíritos.",
};
