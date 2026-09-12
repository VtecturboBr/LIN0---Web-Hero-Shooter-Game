import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_vigor", "c_regen", "c_armor", "c_defshield", "c_lowhp", "c_wind", "c_melee", "c_cooldown", "c_radius", "c_resource", "c_ultgain", "c_ultdmg", "c_onkillheal", "c_raijin_carga", "c_raijin_raio", 'c_shield', 'c_abilitdmg', 'c_jump', 'c_onkillspeed', 'c_lifesteal',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_raijin_carga: { id: "c_raijin_carga", name: "Tempestade Interna", category: "Resource", description: "+15% geração de Carga ao sofrer dano.", heroOnly: "raijin", mods: { resourceGain: 0.15 } },
  c_raijin_raio:  { id: "c_raijin_raio", name: "Raio Domado", category: "Ability", description: "-20% recarga do Relâmpago e Pancada.", heroOnly: "raijin", mods: { cooldownMult: -0.08 } },
};
