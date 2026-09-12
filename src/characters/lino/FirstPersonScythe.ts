import * as THREE from 'three';
import type { Match } from '../../game/match/Match';
import { gameNow } from '../../core/time';

/** Camera-space hands and scythe. Geometry is owned and reused across matches. */
export class FirstPersonScythe {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, .01, 10);
  readonly rig = new THREE.Group();
  readonly weapon = new THREE.Group();
  private leftHand = new THREE.Group();
  private edge = new THREE.MeshStandardMaterial({ color: 0xff435b, emissive: 0xff173d, emissiveIntensity: 2, metalness: .6, roughness: .3 });
  constructor() {
    this.rig.name = 'lino-first-person-scythe';
    this.scene.add(this.rig, new THREE.HemisphereLight(0xb9c9ee, 0x221321, 2.5));
    const key = new THREE.DirectionalLight(0xffdddd, 3); key.position.set(-2, 3, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff163a, 2); rim.position.set(2, 1, -2); this.scene.add(rim);
    const metal = new THREE.MeshStandardMaterial({ color: 0x151923, metalness: .85, roughness: .32 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x18151c, metalness: .9, roughness: .22 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x18151c, roughness: .95 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x24232d, roughness: .8 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); this.rig.add(mesh); return mesh;
    };
    add(new THREE.CylinderGeometry(.035, .042, 1.92, 12), metal, 0, -.15, 0);
    for (let i = 0; i < 13; i++) add(new THREE.TorusGeometry(.044, .006, 5, 12), leather, 0, -.78 + i * .061, 0).rotation.x = Math.PI / 2;
    for (const y of [-1.1, -.91, .48, .69]) add(new THREE.CylinderGeometry(.052, .052, .055, 12), steel, 0, y, 0);
    add(new THREE.BoxGeometry(.015, 1.45, .02), this.edge, .032, -.08, .028);
    const blade = new THREE.Shape();
    blade.moveTo(.035, .66); blade.lineTo(.09, .89);
    blade.bezierCurveTo(-.38, 1.03, -.89, .79, -1.06, .27);
    blade.bezierCurveTo(-.84, .48, -.52, .64, -.28, .61);
    blade.lineTo(-.12, .7); blade.closePath();
    add(new THREE.ExtrudeGeometry(blade, { depth: .035, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1, steps: 1 }), metal, 0, 0, -.02);
    const bevel = new THREE.Shape();
    bevel.moveTo(-1.06, .27); bevel.bezierCurveTo(-.85, .63, -.46, .8, -.08, .79);
    bevel.lineTo(-.12, .7); bevel.lineTo(-.28, .61); bevel.bezierCurveTo(-.52, .64, -.84, .48, -1.06, .27);
    add(new THREE.ShapeGeometry(bevel), metal, 0, 0, .031);
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(-.08, .84, .044), new THREE.Vector3(-.5, .89, .044), new THREE.Vector3(-.83, .65, .044), new THREE.Vector3(-1.015, .32, .044));
    add(new THREE.TubeGeometry(curve, 32, .009, 5, false), this.edge, 0, 0, 0);
    add(new THREE.OctahedronGeometry(.087), this.edge, 0, .72, .02);
    add(new THREE.ConeGeometry(.06, .23, 6), steel, 0, 1.01, 0);
    // Weapon and hands animate independently around the lower grip.
    this.weapon.position.y = -.83;
    for (const child of [...this.rig.children]) { child.position.y += .83; this.weapon.add(child); }
    this.rig.add(this.weapon);
    // Both gloved hands wrap the shaft, with forearms extending out of frame.
    for (const [y, side] of [[-.45, 1], [-.83, -1]]) {
      const previous = new Set(this.rig.children);
      const hand = add(new THREE.BoxGeometry(.13, .17, .13), leather, .035 * side, y, .075);
      hand.rotation.z = side * -.12;
      for (let i = 0; i < 4; i++) add(new THREE.CapsuleGeometry(.017, .07, 3, 5), leather, -.027 + i * .025, y - .02, .14).rotation.z = Math.PI / 2;
      const arm = add(new THREE.CylinderGeometry(.077, .12, .65, 8), sleeve, .18 * side, y - .34, .19);
      arm.rotation.z = side * .45; arm.rotation.x = -.23;
      add(new THREE.BoxGeometry(.15, .08, .16), metal, .06 * side, y - .1, .08);
      add(new THREE.BoxGeometry(.16, .027, .015), this.edge, .06 * side, y - .09, .169);
      if (side === -1) for (const child of [...this.rig.children]) if (!previous.has(child)) this.leftHand.add(child);
    }
    this.rig.add(this.leftHand);
    this.rig.visible = false;
  }
  update(match: Match | null, aspect: number) {
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.rig.visible = !!match && match.local.hero.id === 'lino' && match.local.alive && (match.state === 'running' || match.state === 'intro');
    if (!this.rig.visible || !match) return;
    const player = match.local, t = gameNow();
    const moving = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / player.speed);
    const bob = Math.sin(t * (player.sprinting ? 12 : 8)) * .018 * moving;
    const action = player.viewAction;
    const duration = action.kind === 'melee' ? .5 : action.kind === 'ultimate' ? .85 : action.kind === 'ability' ? .45 : .18;
    const age = t - action.time;
    const pulse = age >= 0 && age < duration ? Math.sin(age / duration * Math.PI) : 0;
    const slash = action.kind === 'melee' ? pulse * (player.lino.combo === 0 ? 1.25 : 1) : 0;
    const cast = action.kind === 'ability' || action.kind === 'ultimate' ? pulse : 0;
    const reload = player.reloading ? .3 + Math.sin(t * 7) * .05 : 0;
    const plant = action.kind === 'ultimate' ? pulse : 0;
    this.leftHand.position.set(-plant * .5, -plant * .5, -plant * .7);
    this.leftHand.rotation.x = plant * .75;
    this.rig.position.set(.43 - slash * .48, -.05 + Math.sin(t * 1.8) * .009 + bob - reload + cast * .1 - plant * .45, -1.28 + pulse * .08);
    this.rig.rotation.set(.02 + reload * .7 - cast * .25 + plant * .9, -.1 + Math.sin(t * 4) * moving * .03, -.12 + slash * 1.25 - cast * .35 + bob * .7);
    const scale = aspect < 1 ? .55 : .75;
    this.rig.scale.setScalar(scale);
    this.edge.emissiveIntensity = 1.5 + Math.sin(t * 2) * .3 + cast * 3;
  }
  render(renderer: THREE.WebGLRenderer) {
    if (!this.rig.visible) return;
    const clear = renderer.autoClear;
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.camera); renderer.autoClear = clear;
  }
}
