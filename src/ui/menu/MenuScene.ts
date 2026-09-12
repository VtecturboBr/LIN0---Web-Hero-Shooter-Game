import * as THREE from 'three';
import { GalleryViewer } from '../gallery/GalleryViewer';
import { HeroViewer } from './HeroViewer';
import { menuAssets } from './config';

export class MenuScene {
  readonly group = new THREE.Group();
  readonly hero = new HeroViewer();
  readonly gallery = new GalleryViewer();
  private environment = new THREE.Group();
  private cursor = new THREE.Vector2();
  private background?: THREE.Texture;
  private video?: HTMLVideoElement;
  constructor(private scene: THREE.Scene) {
    scene.add(this.group); this.group.add(this.environment, this.hero.group, this.gallery.group);
    this.group.add(new THREE.HemisphereLight(0xaac2ff, 0x27111a, 2.2));
    const key = new THREE.DirectionalLight(0xbacfff, 3); key.position.set(-4, 9, 8); this.group.add(key);
    const rim = new THREE.PointLight(0xff1838, 65, 18); rim.position.set(4, 4, 0); this.group.add(rim);
    const fill = new THREE.PointLight(0x4e83ff, 45, 25); fill.position.set(-7, 5, 0); this.group.add(fill);
    this.buildEnvironment();
    if (menuAssets.background) new THREE.TextureLoader().load(menuAssets.background, texture => { texture.colorSpace = THREE.SRGBColorSpace; this.background = texture; this.environment.visible = false; }, undefined, () => {});
    if (menuAssets.backgroundVideo) {
      const video = document.createElement('video'); video.src = menuAssets.backgroundVideo; video.loop = true; video.muted = true; video.playsInline = true;
      video.addEventListener('loadeddata', () => { this.background = new THREE.VideoTexture(video); this.background.colorSpace = THREE.SRGBColorSpace; this.environment.visible = false; });
      this.video = video;
    }
    window.addEventListener('pointermove', e => this.cursor.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5));
  }
  setVisible(visible: boolean) { this.group.visible = visible; if (!visible) this.video?.pause(); }
  private buildEnvironment() {
    const structure = new THREE.MeshStandardMaterial({ color: 0x161e31, roughness: 0.8 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x10111b, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0x611522, roughness: 0.6 });
    const neon = new THREE.MeshBasicMaterial({ color: 0x426baf });
    const warm = new THREE.MeshBasicMaterial({ color: 0xffa66f });
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); this.environment.add(m); return m;
    };
    box(0, -0.2, -6, 65, 0.4, 60, structure);
    for (let i = 0; i < 15; i++) {
      const x = (i - 7) * 3.5, h = 6 + (i * 7 % 11);
      box(x, h / 2, -20 - i % 3 * 3, 2.5, h, 4, structure);
      for (let row = 0; row < h - 1; row++) for (let col = 0; col < 3; col++) if ((row + col + i) % 3 !== 0)
        box(x - 0.8 + col * 0.8, row + 1, -17.95 - i % 3 * 3, 0.13, 0.3, 0.02, (row + i) % 4 === 0 ? warm : neon);
      box(x + 1.1, h * 0.6, -17.9 - i % 3 * 3, 0.045, h * 0.5, 0.03, neon);
    }
    // Tiered temple silhouettes and torii retain recognizable Japanese architecture.
    for (const x of [-8, 10]) for (let i = 0; i < 4; i++) {
      const y = 1.4 + i * 1.7, w = 6 - i * 0.9;
      box(x, y, -10, w * 0.7, 1.5, 4 - i * 0.5, red);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 1.2, 4), roof); cap.rotation.y = Math.PI / 4; cap.scale.z = 0.8; cap.position.set(x, y + 1.1, -10); this.environment.add(cap);
      box(x, y + 0.5, -7.8 + i * -0.25, w * 0.6, 0.06, 0.1, warm);
    }
    for (const [x, z] of [[-9, 0], [9, -5], [-3, -13]]) {
      box(x - 2, 2.4, z, 0.4, 4.8, 0.4, red); box(x + 2, 2.4, z, 0.4, 4.8, 0.4, red);
      box(x, 4.5, z, 5.3, 0.3, 0.5, red); box(x, 5, z, 6, 0.35, 0.7, roof);
    }
    const grid = new THREE.GridHelper(60, 30, 0x33263b, 0x1d263a); grid.position.y = 0.01; this.environment.add(grid);
    for (let i = 0; i < 12; i++) box((i - 6) * 2.3, 0.8, -5 - i % 2 * 5, 0.22, 0.5, 0.22, warm);
  }
  update(dt: number, camera: THREE.PerspectiveCamera, reduced: boolean, galleryHero?: string) {
    this.hero.group.visible = !galleryHero;
    this.gallery.group.visible = !!galleryHero;
    this.gallery.group.position.x = camera.aspect < 0.8 ? 2.5 : camera.aspect < 1.2 ? 1.5 : 0;
    if (galleryHero) { this.gallery.select(galleryHero); this.gallery.update(dt, reduced); }
    this.group.visible = true;
    this.scene.background = this.background ?? new THREE.Color(0x182238);
    this.scene.fog = new THREE.Fog(0x182238, 20, 65);
    if (this.video) { if (reduced) this.video.pause(); else if (this.video.paused) void this.video.play().catch(() => {}); }
    camera.position.set((reduced ? 0 : this.cursor.x * 0.2), 3.5 + (reduced ? 0 : -this.cursor.y * 0.1), camera.aspect < 1.2 ? 13.5 : 10.5);
    camera.lookAt(0, 3, 0);
    this.hero.update(dt, reduced);
  }
}
