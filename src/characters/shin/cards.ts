import type { CardDef } from '../../core/types';

/** As 20 opções do personagem, na ordem usada nos baralhos existentes. */
export const cardIds: string[] = [
  "c_regen", "c_armor", "c_lowhp", "c_wind", "c_jump", "c_damage", "c_headshot", "c_ammo", "c_reload", "c_spread", "c_lifesteal", "c_cooldown", "c_ultgain", "c_shin_ki", "c_shin_dash", 'c_vigor', 'c_melee', 'c_resource', 'c_abilitdmg', 'c_onkillspeed',
];

/** Valores-base de nível 3; o catálogo compartilhado normaliza por nível. */
export const uniqueCards: Record<string, CardDef> = {
  c_shin_ki:   { id: "c_shin_ki", name: "Fluxo de Ki do Shinobi", category: "Resource", description: "+15% geração de Ki.", heroOnly: "shin", mods: { resourceGain: 0.15 } },
  c_shin_dash: { id: "c_shin_dash", name: "Passos Sombríos", category: "Mobility", description: "-20% recarga do Passo Sombrio.", heroOnly: "shin", mods: { cooldownMult: -0.08 } },
};
