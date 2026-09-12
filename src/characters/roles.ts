import type { HeroDef } from '../core/types';

export const roleLabels: Record<HeroDef['role'], string> = { Damage: 'DANO', Tank: 'TANQUE', Support: 'SUPORTE', Controller: 'CONTROLE' };
export const roleDescriptions: Record<HeroDef['role'], string> = {
  Damage: 'PRESSÃO E ELIMINAÇÕES', Tank: 'RESISTÊNCIA E PRESENÇA', Support: 'CURA E PROTEÇÃO', Controller: 'CONTROLE DE ESPAÇO',
};
