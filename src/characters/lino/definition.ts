import type { HeroDef } from '../../core/types';
import { cardIds } from './cards';
import { MATTER_COSTS, TETHER_COST, MATTER_RULES } from './rules';

/** Atributos, arma, passiva, habilidades e história de lino. */
export const lino: HeroDef = {
  id: "lino",
  ai: 'objective',
  name: "LINO",
  title: "O Arquiteto do Abismo",
  role: "Controller",
  color: 0xff3b5c,
  description: "Molda matéria demoníaca conectada ao corpo para controlar o espaço. Combina foice, fio de movimentação e estruturas destrutíveis.",
  hp: 400, moveSpeed: 6.2, jumpPower: 7.5,
  weapon: { kind: "melee", name: "Foice Demoníaca — Ceifar", damage: 60, fireRate: 2.5, ammo: -1, reloadTime: 0, spread: 0, auto: true, range: 7.5, cone: 0.55, tracerColor: 0xff173d,
    combo: { steps: [{ damage: 45, cone: .55, fireRate: 2.5 }, { damage: 45, cone: .55, fireRate: 2.5 }, { damage: 60, cone: .95, fireRate: 1 / .65 }], resetAfter: 1.25 } },
  melee: { damage: 60, range: 7.5, cone: 0.55, rate: 2.5 },
  passive: { name: "Vínculo", mechanic: "matter", description: `${MATTER_RULES.control} de Controle. Construções e fio reservam capacidade. A matéria permanece conectada a Lino; ao retrair ou destruir uma criação, o Controle retorna gradualmente (${MATTER_RULES.regeneration}/s).` },
  abilities: [
    { name: "Moldar", key: "Q", cooldown: 5, kind: "mold", config: {}, description: `Paredes podem se sobrepor às suas próprias paredes. Q abre as formas: 1 Parede (${MATTER_COSTS[0]}), 2 Rampa (${MATTER_COSTS[1]}), 3 Prisão (${MATTER_COSTS[2]}). Clique cria; Q fecha a seleção. A rampa tem superfície contínua e inclinação de 36°. R retrai a estrutura na mira. Até ${MATTER_RULES.limit} construções por ${MATTER_RULES.lifetime}s, com recarga compartilhada. A prisão leva 1s para fechar; se alguém ocupar uma parede, a moldagem falha.`, icon: "▥" },
    { name: "Fio do Abismo", key: "SHIFT", cooldown: 2, kind: "tether", config: { range: 28 }, description: `Segure Shift mirando uma superfície ou inimigo a até 28m. Prender em um inimigo puxa Lino até ele, acompanhando seu movimento. Reserva ${TETHER_COST} de Controle e puxa com força ampliada e movimento físico; use WASD para balançar. Solte para preservar o impulso.`, icon: "⌁" },
    { name: "Impulso do Abismo", key: "M2", cooldown: 6, kind: "dash", config: { speed: 22, duration: .22, damage: 55, radius: 1.6, invuln: .3 }, description: "Avança cerca de 5m na direção do movimento, ou da mira se estiver parado. Causa 55 de dano aos inimigos próximos durante o trajeto, uma vez por alvo, e concede 0,3s de invulnerabilidade. Funciona no ar e interrompe Moldar ou o fio.", icon: "»" },
  ],
  ultimate: { name: "Campo Maleável", key: "E", cooldown: 0, kind: "matterfield", config: { duration: 12, radius: 14 }, description: "Por 12s, uma rede de 14m reduz a recarga de Moldar para 0,6s, com metade da reserva de Controle, e libera Pilar, Cobertura e Barreira. Sair da rede inicia um colapso de 1,5s. Permite até 8 construções; as criadas no campo são recolhidas ao terminar. Todas continuam destrutíveis.", icon: "◎" },
  resource: { name: "Carga da Suprema", icon: "◎", gainDamage: 16, gainMeleeHit: 2, regen: 1 },
  cards: cardIds,
  lore: "Toda matéria demoníaca criada por Lino permanece ligada a ele. Seu poder exige controle e concentração: paredes, rampas e armas são manifestações do mesmo vínculo.",
};
