import { tracePlayer } from '../../game/combat/hitDetection';
import * as THREE from 'three';
import type { Player, GameCtx } from '../../game/actors/Player';
import type { Input } from '../../core/input';
import { raycastWorld, colliderGeometry, type AABB } from '../../maps/world';
import { gameNow } from '../../core/time';
import { firePrimary } from '../../game/combat/weapons';
import { audio } from '../../core/audio';
import { matterCost, TETHER_COST, MATTER_RULES, MATTER_SHAPES } from './rules';
import { ResourceTracker } from '../../core/ResourceTracker';

export const SHAPES = MATTER_SHAPES.map(shape => shape.name);
export function createMatterState() {
  return { control: MATTER_RULES.control, reserved: 0, molding: false, shape: 0,
    combo: 0, comboUntil: 0,
    anchor: null as THREE.Vector3 | null, anchorBox: null as AABB | null, anchorTarget: null as Player | null, ropeLength: 0,
    momentumUntil: 0, field: null as THREE.Vector3 | null, fieldUntil: 0, outsideAt: -1,
    notice: '', noticeUntil: 0 };
}
type Structure = { owner: Player; shape: number; cost: number; parts: { box: AABB; mesh: THREE.Mesh; hp: number }[];
  root: THREE.Line; born: number; ready: number; expires: number; field: boolean; active: boolean };

/** Destructible matter shares the world's collision/visibility system. All clocks use simulation time. */
export class LinoMatter {
  readonly structures: Structure[] = [];
  private group = new THREE.Group();
  private visuals = new Map<number, { rope: THREE.Line; field: THREE.Mesh }>();
  private preview = new THREE.Group();
  constructor(private ctx: GameCtx) {
    this.group.name = 'lino-matter';
    ctx.world.group.add(this.group);
    this.group.add(this.preview);
  }
  private notice(p: Player, message: string) { p.lino.notice = message; p.lino.noticeUntil = gameNow() + 2; }
  private spend(p: Player, cost: number, reserve = true) {
    if (p.lino.control + .001 < cost) { this.notice(p, 'Controle insuficiente — retraia uma estrutura com R'); return false; }
    p.lino.control -= cost;
    if (reserve) p.lino.reserved += cost;
    return true;
  }
  private release(p: Player, cost: number) { p.lino.reserved = Math.max(0, p.lino.reserved - cost); }
  private line() {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xff2449 }));
    this.group.add(line); return line;
  }
  private setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3, ground = false) {
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, (a.x + b.x) / 2, ground ? .07 : (a.y + b.y) / 2 - .15, (a.z + b.z) / 2);
    attr.setXYZ(2, b.x, b.y, b.z); attr.needsUpdate = true; line.geometry.computeBoundingSphere();
  }
  private dispose(object: THREE.Object3D) {
    ResourceTracker.dispose(object);
  }
  cast(p: Player, index: number): boolean {
    const wasMolding = p.lino.molding;
    const result = this.performCast(p, index);
    if (result && index === 0 && wasMolding) p.runtimes[0]?.interrupt(true);
    if (result && !(index === 0 && wasMolding)) {
      const ability = p.hero.abilities[index];
      p.combat.emit('ability_cast', { source: p, ability, ultimate: false });
      p.runtimes[index]?.start({ duration: ability.config.duration, persistent: index === 1 || (index === 0 && p.lino.molding) }, { activate: () => {}, end: interrupted => {
        if (interrupted && index === 0) p.lino.molding = false;
        if (interrupted && index === 1) this.detach(p);
        if (interrupted && index === 2) p.dash = null;
      } });
    }
    return result;
  }
  private performCast(p: Player, index: number): boolean {
    if (!p.alive) return false;
    const s = p.lino, now = gameNow();
    if (index === 0 && s.molding) { s.molding = false; return true; }
    if (index < 0 || index >= p.hero.abilities.length || p.abilityCd[index] > 0) return false;
    if (index === 0) {
      s.molding = true;
      if (p.isBot) { s.shape = 0; this.build(p); s.molding = false; }
      return true;
    } else if (index === 1) {
      if (s.anchor || p.dash) return false;
      const eye = p.eyePos, dir = p.aimDir();
      const hit = raycastWorld(this.ctx.world, eye, dir, p.hero.abilities[1].config.range!);
      let closest = hit?.t ?? p.hero.abilities[1].config.range!, target: Player | null = null;
      for (const enemy of this.ctx.players) {
        if (!enemy.alive || enemy.team === p.team) continue;
        const contact = tracePlayer(eye, dir, enemy.pos);
        if (contact && contact.t < closest) { closest = contact.t; target = enemy; }
      }
      if (!target && (!hit || (hit.box.ownerId !== undefined && hit.box.ownerId !== p.id))) { this.notice(p, 'Mire em um inimigo, uma superfície ou na sua própria construção'); return false; }
      if (!this.spend(p, TETHER_COST)) return false;
      s.anchorTarget = target;
    s.anchor = target ? target.center : hit!.point.clone(); s.anchorBox = target ? null : hit!.box;
      s.ropeLength = Math.max(MATTER_RULES.tether.minLength, eye.distanceTo(s.anchor));
      s.momentumUntil = now + MATTER_RULES.tether.momentum;
      p.animateWeapon('ability');
      return true;
    } else if (index === 2) {
      if (p.dash) return false;
      this.detach(p); s.molding = false;
      const dir = p.localMove.lengthSq() > .01 ? p.localMove.clone().normalize() : new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      p.dash = { dir, until: now + p.hero.abilities[2].config.duration!, speed: p.hero.abilities[2].config.speed!, damage: p.hero.abilities[2].config.damage!, radius: p.hero.abilities[2].config.radius! * p.stat('abilityRadius'), invuln: 0, hitIds: new Set() };
      p.invulnUntil = Math.max(p.invulnUntil, now + p.hero.abilities[2].config.invuln!);
      p.abilityCd[2] = p.hero.abilities[2].cooldown * p.stat('cooldownMult');
      p.animateWeapon('ability'); if (!p.combat.presentation) audio.ability('dash');
      this.ctx.effects.ring(p.pos.clone(), p.hero.color, 2.5, .3);
      return true;
    } else return false;
  }
  detach(p: Player) {
    if (!p.lino.anchor) return;
    p.lino.anchor = null; p.lino.anchorBox = null; p.lino.anchorTarget = null;
    p.lino.momentumUntil = gameNow() + MATTER_RULES.tether.momentum;
    this.release(p, TETHER_COST);
    p.abilityCd[1] = p.hero.abilities[1].cooldown * p.stat('cooldownMult');
    p.runtimes[1]?.interrupt(true);
  }
  ultimate(p: Player) {
    if (!p.alive || !p.ultReady || p.lino.field) return false;
    p.useUlt(); p.animateWeapon('ultimate');
    p.combat.emit('ability_cast', { source: p, ability: p.hero.ultimate, ultimate: true });
    if (!p.combat.presentation) audio.ult();
    p.ultimateRuntime.start({ duration: p.hero.ultimate.config.duration }, { activate: () => {}, end: interrupted => { if (interrupted) this.endField(p); } });
    p.lino.field = p.pos.clone(); p.lino.fieldUntil = gameNow() + p.hero.ultimate.config.duration!; p.lino.outsideAt = -1;
    p.abilityCd[0] = Math.min(p.abilityCd[0], MATTER_RULES.fieldCooldown * p.stat('cooldownMult'));
    this.notice(p, 'Campo Maleável — Q e teclas 1–6 para moldar'); return true;
  }
  input(p: Player, input: Input) {
    if (!p.alive) return;
    const s = p.lino;
    if (input.wasPressed('KeyQ')) this.cast(p, 0);
    if (input.wasPressed('KeyE')) this.ultimate(p);
    if (input.wasPressed('ShiftLeft') || input.wasPressed('ShiftRight')) this.cast(p, 1);
    if (!input.down('ShiftLeft') && !input.down('ShiftRight')) this.detach(p);
    if (input.wasPressed('KeyR')) {
      const hit = raycastWorld(this.ctx.world, p.eyePos, p.aimDir(), 28);
      const structure = this.structures.find(st => st.owner === p && st.parts.some(part => part.box === hit?.box));
      if (structure) { this.remove(structure); this.notice(p, 'Matéria retraída — Controle retornando'); }
    }
    if (input.wasMousePressed(2)) { this.cast(p, 2); return; }
    if (s.molding) {
      for (let i = 0; i < (s.field ? SHAPES.length : MATTER_RULES.basicShapes); i++) if (input.wasPressed(`Digit${i + 1}`)) s.shape = i;
      if (input.wasMousePressed(0)) this.build(p);
      return;
    }
    if (input.mouseDown(0) || input.wasPressed('KeyV')) firePrimary(p, this.ctx);
  }
  /** Rope tension accelerates velocity; collisions still resolve through normal player physics. */
  physics(p: Player, dt: number) {
    const s = p.lino;
    if (!s.anchor) return;
    if (s.anchorTarget) {
      if (!s.anchorTarget.alive || s.anchorTarget.team === p.team) { this.detach(p); return; }
      s.anchor.copy(s.anchorTarget.center);
    }
    if (!p.alive || (!s.anchorTarget && !this.ctx.world.colliders.includes(s.anchorBox!))) { this.detach(p); return; }
    const to = s.anchor.clone().sub(p.eyePos), distance = to.length();
    if (distance > MATTER_RULES.tether.maxLength || distance < MATTER_RULES.tether.detachDistance) { this.detach(p); return; }
    const obstruction = raycastWorld(this.ctx.world, p.eyePos, to.clone().normalize(), Math.max(0, distance - .15));
    if (obstruction && obstruction.box !== s.anchorBox) { this.detach(p); return; }
    s.ropeLength = Math.max(MATTER_RULES.tether.minLength, s.ropeLength - MATTER_RULES.tether.reelSpeed * dt);
    to.normalize();
    p.vel.addScaledVector(to, (MATTER_RULES.tether.pull + Math.max(0, distance - s.ropeLength) * MATTER_RULES.tether.tension) * dt);
    if (p.vel.dot(to) < 0 && distance >= s.ropeLength) p.vel.addScaledVector(to, -p.vel.dot(to));
    p.vel.clampLength(0, MATTER_RULES.tether.maxSpeed);
    s.momentumUntil = gameNow() + MATTER_RULES.tether.momentum;
  }
  private isOwnWall(box: AABB, owner: Player): boolean {
    return this.structures.some(st => st.owner === owner && st.shape === 0 && st.parts.some(part => part.box === box));
  }
  private placement(p: Player): THREE.Vector3 | null {
    const dir = p.aimDir(), eye = p.eyePos;
    const distance = dir.y < -.08 ? Math.min(12, -eye.y / dir.y) : 8;
    const hit = raycastWorld(this.ctx.world, eye, dir, distance);
    const target = hit ? hit.point.clone().addScaledVector(dir, p.lino.shape === 0 && this.isOwnWall(hit.box, p) ? .25 : -.7) : eye.clone().addScaledVector(dir, distance);
    // Ground projection avoids floating walls and structures intersecting roofs.
    const groundWorld = p.lino.shape === 0
      ? { ...this.ctx.world, colliders: this.ctx.world.colliders.filter(box => !this.isOwnWall(box, p)) }
      : this.ctx.world;
    const ground = raycastWorld(groundWorld, new THREE.Vector3(target.x, p.pos.y + 1, target.z), new THREE.Vector3(0, -1, 0), p.pos.y + 2);
    target.y = ground?.point.y ?? 0;
    if (Math.abs(target.x) > this.ctx.world.size.w / 2 - 3 || Math.abs(target.z) > this.ctx.world.size.d / 2 - 3) return null;
    return target;
  }
  private boxes(p: Player, at: THREE.Vector3): AABB[] {
    const shape = p.lino.shape, rotate = Math.abs(Math.sin(p.yaw)) > Math.abs(Math.cos(p.yaw));
    const boxes: AABB[] = [];
    const add = (x: number, z: number, w: number, h: number, d: number, step = false) => {
      if (rotate) { [x, z] = [z, x]; [w, d] = [d, w]; }
      boxes.push({ min: at.clone().add(new THREE.Vector3(x - w / 2, 0, z - d / 2)), max: at.clone().add(new THREE.Vector3(x + w / 2, h, z + d / 2)), step, ownerId: p.id });
    };
    for (const part of MATTER_SHAPES[shape].parts) add(...part);
    if (MATTER_SHAPES[shape].ramp) {
      const forward = rotate ? -Math.sign(Math.sin(p.yaw)) : -Math.sign(Math.cos(p.yaw));
      boxes[0].ramp = { axis: rotate ? 'x' : 'z', direction: forward as 1 | -1 };
    }
    return boxes;
  }
  private valid(boxes: AABB[], owner: Player, shape: number) {
    return boxes.every(box => !this.ctx.world.colliders.some(b => !(shape === 0 && this.isOwnWall(b, owner)) && box.min.x < b.max.x - .02 && box.max.x > b.min.x + .02 && box.min.y < b.max.y - .02 && box.max.y > b.min.y + .02 && box.min.z < b.max.z - .02 && box.max.z > b.min.z + .02)
      && !this.ctx.players.some(p => p.alive && p.pos.x + p.radius > box.min.x && p.pos.x - p.radius < box.max.x && p.pos.z + p.radius > box.min.z && p.pos.z - p.radius < box.max.z && p.pos.y + p.height > box.min.y && p.pos.y < box.max.y));
  }
  build(p: Player): boolean {
    const s = p.lino, at = this.placement(p), now = gameNow();
    if (!p.alive || !s.molding || p.abilityCd[0] > 0 || !at) return false;
    if (!s.field && s.shape > 2) s.shape = 0;
    const boxes = this.boxes(p, at), cost = matterCost(s.shape, !!s.field);
    if (s.field && at.distanceTo(s.field) > p.hero.ultimate.config.radius! * p.stat('abilityRadius')) { this.notice(p, 'Construa dentro do Campo Maleável'); return false; }
    if (!this.valid(boxes, p, s.shape)) { this.notice(p, 'Espaço ocupado — ajuste a mira'); return false; }
    if (this.structures.filter(st => st.owner === p).length >= (s.field ? MATTER_RULES.fieldLimit : MATTER_RULES.limit)) { this.notice(p, 'Limite de construções — mire em uma e pressione R'); return false; }
    if (!this.spend(p, cost)) return false;
    const delay = MATTER_SHAPES[s.shape].windup ?? (s.field ? MATTER_RULES.fieldWindup : MATTER_RULES.windup);
    const st: Structure = { owner: p, shape: s.shape, cost, parts: [], root: this.line(), born: now, ready: now + delay, expires: now + MATTER_RULES.lifetime, field: !!s.field, active: false };
    for (const box of boxes) {
      const size = box.max.clone().sub(box.min);
      const material = new THREE.MeshStandardMaterial({ color: 0x120b13, emissive: p.team === 0 ? 0x18395b : 0x651126, emissiveIntensity: .1, roughness: .65, transparent: true, opacity: .22 });
      const mesh = new THREE.Mesh(colliderGeometry(box), material);
      mesh.position.copy(box.min).addScaledVector(size, .5);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: p.team === 0 ? 0x389dff : 0xff2449 })); mesh.add(edges);
      this.group.add(mesh);
      const part = { box, mesh, hp: MATTER_SHAPES[s.shape].hp };
      box.onDamage = (source, amount) => {
        if (!st.active || source.team === p.team || !st.parts.includes(part)) return;
        part.hp -= amount * source.stat('damageMult');
        material.emissiveIntensity = 1.4;
        this.ctx.effects.impact(mesh.position, new THREE.Vector3(0, 1, 0), 0xff2449, .6);
        if (source.isLocal) { audio.hit(false); this.notice(source, part.hp <= 0 ? 'Estrutura destruída' : `Estrutura: ${Math.ceil(part.hp)} de vida`); }
        if (part.hp <= 0) {
          this.removePart(st, part);
          if (!st.parts.length) this.remove(st);
        }
      };
      st.parts.push(part);
    }
    this.structures.push(st);
    p.abilityCd[0] = (s.field ? MATTER_RULES.fieldCooldown : p.hero.abilities[0].cooldown) * p.stat('cooldownMult');
    p.animateWeapon('ability'); audio.ability('shield');
    this.notice(p, `${SHAPES[s.shape]} moldada · ${cost} de Controle reservado`);
    return true;
  }
  private removePart(st: Structure, part: Structure['parts'][number]) {
    const index = this.ctx.world.colliders.indexOf(part.box);
    if (index >= 0) this.ctx.world.colliders.splice(index, 1);
    this.dispose(part.mesh); st.parts.splice(st.parts.indexOf(part), 1);
  }
  private remove(st: Structure) {
    if (!this.structures.includes(st)) return;
    for (const part of [...st.parts]) this.removePart(st, part);
    this.dispose(st.root); this.release(st.owner, st.cost);
    this.structures.splice(this.structures.indexOf(st), 1);
  }
  reset(p?: Player) {
    for (const st of [...this.structures]) if (!p || st.owner === p) this.remove(st);
    for (const player of this.ctx.players) if ((!p || p === player) && player.hero.id === 'lino') Object.assign(player.lino, createMatterState());
    for (const [id, visual] of this.visuals) if (!p || id === p.id) {
      this.dispose(visual.rope); this.dispose(visual.field); this.visuals.delete(id);
    }
  }
  private endField(p: Player) {
    if (!p.lino.field) return;
    for (const st of [...this.structures]) if (st.owner === p && st.field) this.remove(st);
    p.lino.field = null; p.lino.shape = Math.min(2, p.lino.shape); this.notice(p, 'Campo Maleável recolhido');
  }
  update(dt: number) {
    const now = gameNow();
    for (const p of this.ctx.players) {
      if (p.hero.id !== 'lino') continue;
      const s = p.lino;
      if (!p.alive) { this.reset(p); continue; }
      if (s.field) {
        const outside = p.pos.distanceTo(s.field) > p.hero.ultimate.config.radius! * p.stat('abilityRadius');
        if (outside && s.outsideAt < 0) s.outsideAt = now;
        if (!outside) s.outsideAt = -1;
        if (now >= s.fieldUntil || (s.outsideAt >= 0 && now - s.outsideAt >= MATTER_RULES.collapseDelay)) {
          this.endField(p); p.ultimateRuntime.interrupt(true);
        }
      }
      if (!s.molding && p.runtimes[0]?.state === 'ACTIVE') p.runtimes[0].interrupt(true);
      s.control = Math.min(MATTER_RULES.control - s.reserved, s.control + MATTER_RULES.regeneration * p.stat('controlRegen') * dt);
      this.updateVisuals(p);
    }
    for (const st of [...this.structures]) {
      if (!st.owner.alive || now >= st.expires) { this.remove(st); continue; }
      if (!st.active && now >= st.ready) {
        // Never solidify through a player who entered during the visible windup.
        if (!this.valid(st.parts.map(part => part.box), st.owner, st.shape)) { this.remove(st); this.notice(st.owner, 'Moldagem interrompida: espaço ocupado'); continue; }
        st.active = true;
        for (const part of st.parts) { this.ctx.world.colliders.push(part.box); (part.mesh.material as THREE.MeshStandardMaterial).opacity = 1; }
      }
      this.setLine(st.root, st.owner.center, st.parts[0].mesh.position, true);
    }
    this.updatePreview();
  }
  private updateVisuals(p: Player) {
    let v = this.visuals.get(p.id);
    if (!v) {
      const field = new THREE.Mesh(new THREE.RingGeometry(.985, 1, 80), new THREE.MeshBasicMaterial({ color: p.team === 0 ? 0x389dff : 0xff2449, side: THREE.DoubleSide, transparent: true, opacity: .85 }));
      field.rotation.x = -Math.PI / 2;
      this.group.add(field); v = { rope: this.line(), field }; this.visuals.set(p.id, v);
      // Roots remain attached to the center of the ultimate field.
      for (let i = 0; i < 16; i++) {
        const angle = Math.PI * 2 * i / 16;
        const root = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(Math.cos(angle) * .6, Math.sin(angle) * .6, 0), new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0)]), new THREE.LineBasicMaterial({ color: 0xff2449, transparent: true, opacity: .5 })); field.add(root);
      }
    }
    const s = p.lino;
    v.rope.visible = !!s.anchor || !!s.field;
    if (s.anchor || s.field) this.setLine(v.rope, p.eyePos, (s.anchor ?? s.field)!, !s.anchor);
    v.field.visible = !!s.field;
    if (s.field) {
      v.field.position.copy(s.field); v.field.position.y += .05;
      v.field.scale.setScalar(p.hero.ultimate.config.radius! * p.stat('abilityRadius') * Math.min(1, (p.hero.ultimate.config.duration! - (s.fieldUntil - gameNow())) / .65));
    }
  }
  private previewKey = '';
  private updatePreview() {
    const p = this.ctx.players.find(pl => pl.isLocal && pl.hero.id === 'lino');
    this.preview.visible = !!p?.alive && !!p?.lino.molding;
    if (!p || !this.preview.visible) return;
    const at = this.placement(p);
    if (!at) { this.preview.visible = false; return; }
    const boxes = this.boxes(p, at), valid = this.valid(boxes, p, p.lino.shape) && p.lino.control >= matterCost(p.lino.shape, !!p.lino.field);
    const key = `${p.lino.shape}/${Math.abs(Math.sin(p.yaw)) > Math.abs(Math.cos(p.yaw))}/${Math.sign(Math.sin(p.yaw))}/${Math.sign(Math.cos(p.yaw))}/${valid}`;
    if (key !== this.previewKey) {
      for (const child of [...this.preview.children]) this.dispose(child);
      for (const box of boxes) {
        const size = box.max.clone().sub(box.min);
        const geometry = colliderGeometry(box);
        const edges = new THREE.EdgesGeometry(geometry);
        geometry.dispose();
        const mesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: valid ? 0x389dff : 0xff2449, transparent: true, opacity: .6 }));
        mesh.position.copy(box.min).addScaledVector(size, .5).sub(at); this.preview.add(mesh);
      }
      this.previewKey = key;
    }
    this.preview.position.copy(at);
  }
}
