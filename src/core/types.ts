export type Role = "Tank" | "Damage" | "Support" | "Controller";
export type TeamId = 0 | 1;

/** Stat keys used by deck cards, shop items, passives and HUD. Values are multiplicative fractions
 *  (0.15 = +15%). Cards and items use negative deltas for reductions; durations/counts are raw values. */
export type StatKey =
  | "maxHp" | "hpRegen" | "dmgResist" | "moveSpeed" | "jumpPower"
  | "damageMult" | "headshotMult" | "ammoMult" | "reloadMult" | "projSpeed"
  | "spreadMult" | "lifesteal" | "meleeDamageMult" | "cooldownMult" | "abilityRadius"
  | "resourceGain" | "ultGain" | "ultDamageMult" | "healMult" | "shieldMult"
  | "onKillHeal" | "onKillSpeed" | "onKillSpeedDur" | "lowHpDamage" | "defensiveShield"
  | "abilityDamageMult" | "dashDamageMult" | "spiritHealMult" | "cloneCount" | "meleeRangeMult" | "smokeDuration" | "controlRegen";

export type Mods = Partial<Record<StatKey, number>>;

export type WeaponKind = "hitscan" | "projectile" | "melee" | "beam";

export interface WeaponDef {
  combo?: { steps: { damage: number; cone: number; fireRate: number }[]; resetAfter: number };
  kind: WeaponKind;
  name: string;
  damage: number;
  fireRate: number;            // shots per second
  ammo: number;                // -1 = infinite
  reloadTime: number;
  spread: number;              // radians
  auto: boolean;
  pellets?: number;
  headshotMult?: number;       // default 1.5
  projectileSpeed?: number;
  projectileRadius?: number;
  pierce?: number;             // extra targets a projectile can pass through
  range?: number;              // melee/beam reach
  cone?: number;               // melee cleave half-angle (radians)
  gravity?: number;            // projectile gravity
  tracerColor?: number;
  alt?: WeaponAlt;
}

export interface WeaponAlt {
  name: string;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  projectileRadius: number;
}

export type AbilityKind =
  | "dash"          // dash forward, damage enemies passed through
  | "projectile"    // fired projectile (damage or heal)
  | "aoe"           // instant area effect (damage/heal/slow)
  | "beam"          // instant hitscan beam
  | "slam"          // melee-range aoe burst
  | "buff"          // temporary stat buff on self
  | "shield"        // temporary shields on self/ally
  | "smoke"         // vision/slow cloud
  | "clone"         // dash leaving behind a clone
  | "teleport"      // swap with clone / short blink
  | "summon"        // Yume: healing/guardian spirit
  | "storm"         // Raijin: persistent lightning storm around self
  | "illusions"     // Kitsune: spawn attacking illusions
  | "mark"          // Shin: mark target, delayed execution damage
  | "wave"          // Kenji: huge piercing projectile
  | "mold" | "tether" | "matterfield"
  | "nova";         // Yume: big AoE heal + damage buff

export interface AbilityConfig {
  damage?: number;
  speed?: number;
  duration?: number;
  radius?: number;
  range?: number;
  pierce?: number;
  heal?: number;
  healPerSec?: number;
  slow?: number;
  slowDur?: number;
  buffStat?: StatKey;
  buffMult?: number;
  shield?: number;
  invuln?: number;
  knockback?: number;
  lifesteal?: number;
  trailColor?: number;
  cloneCount?: number;
  summonKind?: "heal" | "attack";
  summonHp?: number;
  passive?: boolean;
  shots?: number;             // multi-projectile spread
  spread?: number;            // spread angle between shots
  dps?: number;               // storm
  count?: number;             // illusions count
  buffDuration?: number;      // duration of buff granted to others (nova)
  cloneDuration?: number;     // clone lifetime
  meleeDef?: { damage: number; range: number; cone: number; rate: number }; // scythe mode
  modeMoveMult?: number;      // scythe mode move speed multiplier
}

export interface AbilityDef {
  runtime?: import('../game/combat/AbilityRuntime').RuntimeConfig;
  name: string;
  key: "Q" | "M2" | "F" | "E" | "SHIFT";
  cooldown: number;
  kind: AbilityKind;
  config: AbilityConfig;
  description: string;
  icon: string;    // display glyph
  defensive?: boolean; // triggers "defensiveShield" cards
}

export interface HeroDef {
  ai?: import('../game/ai/profiles').AIProfileName;
  id: string;
  name: string;
  title: string;
  role: Role;
  color: number;
  description: string;
  hp: number;
  moveSpeed: number;
  jumpPower: number;
  weapon: WeaponDef;
  melee: { damage: number; range: number; cone: number; rate: number; };
  passive: { name: string; description: string; mods?: Mods; mechanic?: "doubleJump" | "auraRegen" | "meleeResource" | "matter";
    auraRadius?: number; healPerSec?: number; stackSpeed?: number; maxStacks?: number; stackDuration?: number };
  abilities: AbilityDef[];          // Q, E, F
  ultimate: AbilityDef;
  resource: {
    name: string;
    icon: string;
    gainDamage?: number;   // +1 per N damage dealt
    gainHeal?: number;     // +1 per N healing done
    gainTaken?: number;    // +1 per N damage taken
    gainPerCast?: number;  // +1 per ability cast
    gainMeleeHit?: number; // +1 per melee hit landed
    regen?: number;        // per second
  };
  cards: string[];                  // 20 available card ids
  lore: string;
}

export interface DeckCard { id: string; level: number; }
export interface SavedDeck { name: string; cards: DeckCard[]; }

export interface CardDef {
  id: string;
  name: string;
  category: string;
  description: string;
  mods?: Mods;
  heroOnly?: string;
}

export interface ShopItemDef {
  id: string;
  name: string;
  category: string;
  description: string;
  levels: number;
  costs: number[];     // cost of each level purchase (cumulative investment = sum)
  mods: Mods[];        // mods applied at each level (index 0 = level 1)
  icon: string;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  healing: number;
  kobanEarned: number;
}
