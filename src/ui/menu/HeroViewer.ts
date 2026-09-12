import * as THREE from 'three';
import { menuAssets } from './config';

/** Owns presentation only: model loading, pose, animation and viewer rotation. */
export class HeroViewer {
  readonly group = new THREE.Group();
  private model = new THREE.Group();
  private mixer?: THREE.AnimationMixer;
  private angle = -0.25;
  private time = 0;
  private generation = 0;
  idle = true;

  constructor() {
    this.group.position.set(1.5, 0, 2);
    this.group.add(this.model);
    this.placeholder();
    if (menuAssets.characterModel) void this.setModel(menuAssets.characterModel);
  }
  rotate(delta: number) { this.angle += delta; }
  private placeholder() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x151923, roughness: 0.65, metalness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0x9c172c, emissive: 0xe91b39, emissiveIntensity: 1.2, metalness: 0.5 });
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z); this.model.add(o); return o;
    };
    // Faceted mannequin; intentionally a placeholder, not a final character design.
    mesh(new THREE.CylinderGeometry(0.47, 0.64, 1.8, 6), dark, 0, 3.1, 0);
    mesh(new THREE.ConeGeometry(1.0, 2.7, 6, 1, true), black, 0, 2.3, -0.12).rotation.z = Math.PI;
    const head = mesh(new THREE.IcosahedronGeometry(0.48, 1), dark, 0, 4.5, 0.03); head.scale.set(0.83, 1.14, 0.88);
    mesh(new THREE.ConeGeometry(0.53, 0.62, 7), black, 0, 4.99, -0.08).rotation.z = -0.25;
    for (let i = -1; i <= 1; i += 2) {
      mesh(new THREE.BoxGeometry(0.46, 0.14, 0.55), red, i * 0.65, 3.75, 0).rotation.z = i * -0.28;
      mesh(new THREE.CylinderGeometry(0.24, 0.2, 1.5, 5), dark, i * 0.79, 3.0, 0).rotation.z = i * 0.2;
      mesh(new THREE.BoxGeometry(0.43, 1.8, 0.5), dark, i * 0.37, 1.15, 0);
      mesh(new THREE.BoxGeometry(0.49, 0.3, 0.85), black, i * 0.37, 0.2, 0.15);
    }
    mesh(new THREE.BoxGeometry(0.65, 0.025, 0.04), red, 0, 4.52, 0.43);
    mesh(new THREE.BoxGeometry(0.045, 1.25, 0.055), red, 0.14, 3.3, 0.48).rotation.z = -0.15;
    const shaft = mesh(new THREE.CylinderGeometry(0.055, 0.055, 6.3, 8), black, 1.05, 3, 0.32); shaft.rotation.z = -0.15;
    const edge = mesh(new THREE.CylinderGeometry(0.013, 0.013, 6.3, 6), red, 1.085, 3, 0.37); edge.rotation.z = -0.15;
    const shape = new THREE.Shape();
    shape.moveTo(1.5, 6); shape.bezierCurveTo(0.4, 6.9, -1.4, 6.6, -2.05, 5.4);
    shape.bezierCurveTo(-0.6, 6.1, 0.35, 6.02, 1.5, 5.8); shape.closePath();
    mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }), black, 0, 0, 0.3);
    const points = shape.getPoints(50).map(p => new THREE.Vector3(p.x, p.y, 0.4));
    this.model.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xff3047 })));
    for (let i = 0; i < 5; i++) {
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(1.8 + i * 0.16, 0.018, 4, 60, Math.PI * 1.1), red);
      ribbon.position.set(0.3, 2.5 + i * 0.47, -0.5);
      ribbon.rotation.set(0.5 + i * 0.2, 0.3, i * 0.9);
      this.model.add(ribbon);
    }
  }
  async setModel(url: string) {
    const generation = ++this.generation;
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const asset = await new GLTFLoader().loadAsync(url);
      if (generation !== this.generation) { this.disposeObject(asset.scene); return; }
      this.mixer?.stopAllAction();
      this.disposeObject(this.model);
      this.group.remove(this.model);
      this.model = asset.scene;
      const box = new THREE.Box3().setFromObject(this.model);
      const height = box.getSize(new THREE.Vector3()).y || 1;
      this.model.scale.setScalar(5.4 / height * menuAssets.characterScale);
      const scaled = new THREE.Box3().setFromObject(this.model);
      this.model.position.y -= scaled.min.y;
      this.model.position.x -= scaled.getCenter(new THREE.Vector3()).x;
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip = asset.animations.find(a => a.name === menuAssets.idleAnimation) ?? asset.animations[0];
      if (clip) this.mixer.clipAction(clip).play();
      const status = document.getElementById('hero-asset-status'); if (status) status.textContent = 'MODELO 3D';
    } catch {
      const status = document.getElementById('hero-asset-status'); if (status) status.textContent = 'PLACEHOLDER · ASSET INDISPONÍVEL';
    }
  }
  private disposeObject(root: THREE.Object3D) {
    root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => { for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose(); mat.dispose(); }); });
  }
  update(dt: number, reduced: boolean) {
    if (this.idle && !reduced) { this.time += dt; this.mixer?.update(dt); }
    this.group.rotation.y = this.angle + (this.idle && !reduced ? Math.sin(this.time * 0.45) * 0.07 : 0);
    this.group.position.y = this.idle && !reduced ? Math.sin(this.time * 1.5) * 0.025 : 0;
  }
}
