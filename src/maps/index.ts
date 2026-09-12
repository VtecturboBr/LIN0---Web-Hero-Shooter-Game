import type { MapDef } from './types';
import { SHOTO } from './shoto/definition';
import { TRAINING } from './training/definition';
import { CASTLE } from './castle/definition';

/** IDs persistentes: kyoto identifica Distrito Shōtō por compatibilidade. */
export const MAPS: Record<string, MapDef> = { training: TRAINING, kyoto: SHOTO, castle: CASTLE };
