import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_vigor", "c_regen", "c_armor", "c_lowhp", "c_wind", "c_damage", "c_lino_alcance", "c_lino_regresso", "c_cooldown", "c_ultgain", "c_onkillheal", "c_onkillspeed", "c_lino_pulso", "c_lino_foice", "c_lino_energia", 'c_jump', 'c_melee', 'c_lifesteal', 'c_resource', 'c_radius',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_lino_foice: { id: "c_lino_foice", name: "Caminho da Foice", category: "Offense", description: "+25% dano da foice.", heroOnly: "lino", mods: { meleeDamageMult: 0.25 } },
  c_lino_energia: { id: "c_lino_energia", name: "Vínculo Profundo", category: "Resource", description: "+15% recuperação de Controle.", heroOnly: "lino", mods: { controlRegen: 0.15 } },
  c_lino_alcance: { id: 'c_lino_alcance', name: 'Gume Maleável', category: 'Offense', description: '+15% alcance da foice.', heroOnly: 'lino', mods: { meleeRangeMult: .15 } },
  c_lino_pulso: { id: 'c_lino_pulso', name: 'Pulso do Abismo', category: 'Resource', description: '+18% recuperação de Controle.', heroOnly: 'lino', mods: { controlRegen: .18 } },
  c_lino_regresso: { id: 'c_lino_regresso', name: 'Raízes Vivas', category: 'Resource', description: '+12% recuperação de Controle e +2 de vida por segundo.', heroOnly: 'lino', mods: { controlRegen: .12, hpRegen: 2 } },
};
