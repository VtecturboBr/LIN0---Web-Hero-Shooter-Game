import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_vigor", "c_regen", "c_armor", "c_defshield", "c_wind", "c_headshot", "c_ammo", "c_cooldown", "c_resource", "c_ultgain", "c_heal", "c_shield", "c_abilitdmg", "c_yume_espirito", "c_yume_favor", 'c_reload', 'c_projspeed', 'c_radius', 'c_onkillheal', 'c_jump',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_yume_espirito: { id: "c_yume_espirito", name: "Elo Espiritual", category: "Support", description: "+30% cura dos espíritos invocados.", heroOnly: "yume", mods: { spiritHealMult: 0.30 } },
  c_yume_favor:   { id: "c_yume_favor", name: "Favor dos Deuses", category: "Resource", description: "+15% geração de Favor ao curar.", heroOnly: "yume", mods: { resourceGain: 0.15 } },
};
