import type { CharacterPresentation } from '../../characters/presentation';
import { presentation as lino } from '../../characters/lino/presentation';
import { presentation as yume } from '../../characters/yume/presentation';
import { presentation as raijin } from '../../characters/raijin/presentation';
import { presentation as kitsune } from '../../characters/kitsune/presentation';
import { presentation as shin } from '../../characters/shin/presentation';
import { presentation as kenji } from '../../characters/kenji/presentation';

export const reservedPortrait = '/assets/characters/_reserved/portrait.png';
export const heroPresentation: Record<string, CharacterPresentation> = { lino, yume, raijin, kitsune, shin, kenji };
