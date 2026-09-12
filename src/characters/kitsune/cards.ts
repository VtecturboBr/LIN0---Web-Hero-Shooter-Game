import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_vigor", "c_armor", "c_lowhp", "c_wind", "c_jump", "c_damage", "c_headshot", "c_ammo", "c_reload", "c_cooldown", "c_resource", "c_ultgain", "c_ultdmg", "c_kitsune_clone", "c_kitsune_névoa", 'c_spread', 'c_projspeed', 'c_radius', 'c_lifesteal', 'c_onkillspeed',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_kitsune_clone:{ id: "c_kitsune_clone", name: "Cauda Extra", category: "Utility", description: "+1 clone simultâneo.", heroOnly: "kitsune", mods: { cloneCount: 1 } },
  c_kitsune_névoa:{ id: "c_kitsune_névoa", name: "Névoa Perpétua", category: "Utility", description: "+2s de duração da névoa enganosa.", heroOnly: "kitsune", mods: { smokeDuration: 2 } },
};
