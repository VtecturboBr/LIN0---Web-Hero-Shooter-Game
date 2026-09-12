import * as THREE from 'three';
import { HERO_MAP } from '../../characters/index';
import { heroPresentation } from './presentation';

/** Independent preview models; never modifies player/team colors in a match. */
export class GalleryViewer {
  readonly group = new THREE.Group();
  private cache = new Map<string, THREE.Group>();
  private selected = '';
  private angle = -0.2;
  private time = 0;
  constructor() { this.group.position.set(0, 0, 2); }
  rotate(delta: number) { this.angle += delta; }
  select(id: string) {
    if (id === this.selected || !HERO_MAP[id]) return;
    this.selected = id; this.angle = -0.2;
    this.group.clear();
    if (!this.cache.has(id)) {
      this.cache.set(id, this.placeholder(id));
      const url = heroPresentation[id].model;
      if (url) void this.load(id, url);
    }
    this.group.add(this.cache.get(id)!);
    this.status('MODELO PROVISÓRIO');
    if (this.cache.get(id)!.userData.loaded) this.status('MODELO 3D');
  }
  private status(text: string) { const el = document.getElementById('gallery-viewer-status'); if (el) el.textContent = text; }
  private async load(id: string, url: string) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      model.scale.setScalar(5.7 / Math.max(0.01, box.getSize(new THREE.Vector3()).y));
      const scaled = new THREE.Box3().setFromObject(model), center = scaled.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaled.min.y, -center.z);
      model.userData.loaded = true;
      if (gltf.animations[0]) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(gltf.animations.find(a => a.name === 'Idle') ?? gltf.animations[0]).play(); model.userData.mixer = mixer; }
      const old = this.cache.get(id)!;
      old.traverse(o => { const mesh = o as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose()); });
      this.cache.set(id, model);
      if (this.selected === id) { this.group.clear(); this.group.add(model); this.status('MODELO 3D'); }
    } catch { if (this.selected === id) this.status('PLACEHOLDER · ASSET INDISPONÍVEL'); }
  }
  private placeholder(id: string) {
    const hero = HERO_MAP[id];
    const g = new THREE.Group();
    const base = new THREE.MeshStandardMaterial({ color: id === 'yume' ? 0x9babb4 : id === 'kenji' ? 0x473441 : 0x202532, roughness: 0.65, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e19, roughness: 0.6 });
    const accent = new THREE.MeshStandardMaterial({ color: hero.color, emissive: hero.color, emissiveIntensity: 0.7 });
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o;
    };
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m;
    };
    const width = id === 'raijin' ? 1.5 : 1.05;
    mesh(new THREE.CylinderGeometry(width * 0.55, width * 0.38, 1.6, 6), base, 0, 3.25, 0);
    box(0, 3.5, 0.42, width * 0.83, 0.7, 0.14, dark);
    box(0, 2.42, 0, width * 0.9, 0.22, 0.75, accent);
    const head = mesh(new THREE.IcosahedronGeometry(0.46, 1), base, 0, 4.6, 0); head.scale.set(0.87, 1.2, 0.9);
    mesh(new THREE.ConeGeometry(0.51, 0.4, 6), dark, 0, 5.04, -0.03).rotation.z = -0.2;
    box(0, 4.56, 0.4, 0.58, 0.09, 0.05, accent);
    box(0, 4.31, 0.27, 0.6, 0.25, 0.4, dark);
    for (const side of [-1, 1]) {
      box(side * width * 0.65, 3.65, 0, 0.43, 0.55, 0.68, base).rotation.z = side * -0.3;
      mesh(new THREE.CylinderGeometry(0.2, 0.16, 1.45, 6), base, side * width * 0.78, 2.9, 0.05).rotation.z = side * 0.15;
      box(side * width * 0.8, 2.35, 0.12, 0.28, 0.35, 0.4, accent);
      box(side * 0.32, 1.32, 0, 0.44, 2, 0.54, dark).rotation.z = side * -0.05;
      box(side * 0.38, 0.95, 0.27, 0.41, 0.75, 0.12, base);
      box(side * 0.4, 0.25, 0.18, 0.5, 0.32, 0.8, base);
      box(side * 0.4, 0.09, 0.18, 0.5, 0.04, 0.8, accent);
    }
    if (id === 'lino' || id === 'shin') {
      const rifle = box(0.95, 2.4, 0.3, 0.25, 1.25, 0.42, dark); rifle.rotation.z = -0.25;
      box(1.08, 1.85, 0.32, 0.07, 0.6, 0.09, accent).rotation.z = -0.25;
      box(-0.42, 3.2, -0.35, 0.1, 3.4, 0.12, accent).rotation.z = -0.32;
    } else if (id === 'raijin') {
      box(1.3, 2.0, 0.1, 0.12, 3.2, 0.12, dark).rotation.z = -0.18;
      box(1.6, 3.4, 0.1, 1.4, 0.8, 0.8, base);
      box(1.6, 3.4, 0.52, 1.1, 0.22, 0.04, accent);
    } else if (id === 'yume') {
      const bow = mesh(new THREE.TorusGeometry(1.4, 0.07, 6, 40, Math.PI), accent, 1.05, 2.85, 0.15); bow.rotation.z = -Math.PI / 2;
      box(1.05, 2.85, 0.15, 0.018, 2.8, 0.018, base);
      mesh(new THREE.ConeGeometry(0.75, 2.2, 8), base, 0, 1.9, -0.1);
    } else if (id === 'kitsune') {
      for (const side of [-1, 1]) mesh(new THREE.ConeGeometry(0.2, 0.65, 4), accent, side * 0.34, 5.16, 0).rotation.z = side * -0.2;
      for (let i = 0; i < 3; i++) {
        const tail = mesh(new THREE.TorusGeometry(1.1 + i * 0.12, 0.14, 5, 30, Math.PI), dark, 0, 1.9, -0.65);
        tail.rotation.set(0.5, 0.4, i * 0.65 - 0.5);
      }
    } else {
      for (const side of [-1, 1]) mesh(new THREE.IcosahedronGeometry(0.32, 0), accent, side * 0.87, 2.3, 0.25);
      for (let i = 0; i < 10; i++) mesh(new THREE.SphereGeometry(0.07, 6, 6), accent, Math.cos(i * Math.PI / 5) * 0.44, 3.75 + Math.sin(i * Math.PI / 5) * 0.23, 0.38);
    }
    const ring = mesh(new THREE.TorusGeometry(1.5, 0.012, 4, 64), accent, 0, 0.03, 0); ring.rotation.x = -Math.PI / 2;
    g.scale.setScalar(1.15);
    return g;
  }
  update(dt: number, reduced: boolean) {
    if (!reduced) { this.time += dt; this.cache.get(this.selected)?.userData.mixer?.update(dt); }
    this.group.rotation.y = this.angle + (reduced ? 0 : Math.sin(this.time * 0.55) * 0.06);
  }
}
