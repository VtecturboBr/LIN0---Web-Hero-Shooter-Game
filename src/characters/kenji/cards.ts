import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_vigor", "c_regen", "c_armor", "c_defshield", "c_lowhp", "c_wind", "c_melee", "c_lifesteal", "c_cooldown", "c_radius", "c_resource", "c_ultgain", "c_ultdmg", "c_kenji_onda", "c_kenji_manto", 'c_shield', 'c_abilitdmg', 'c_jump', 'c_onkillspeed', 'c_damage',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_kenji_onda:{ id: "c_kenji_onda", name: "Onda do Vazio", category: "Offense", description: "+20% dano da Onda de Ki e +15% dano de habilidades.", heroOnly: "kenji", mods: { abilityDamageMult: 0.15, damageMult: 0.05 } },
  c_kenji_manto:{ id: "c_kenji_manto", name: "Manto Duradouro", category: "Defense", description: "+15% de escudo recebido ou gerado.", heroOnly: "kenji", mods: { shieldMult: 0.15 } },
};
