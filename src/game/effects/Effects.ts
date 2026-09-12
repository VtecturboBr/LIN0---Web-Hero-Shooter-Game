import * as THREE from "three";
import { MeshPool } from '../../core/ResourceTracker';

interface Particle {
  pooled?: boolean;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  shrink: number;
  baseScale: number;
}

interface FadeLine {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
}

interface Ring {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  grow: number;
}

export class Effects {
  private particles: Particle[] = [];
  private lines: FadeLine[] = [];
  private rings: Ring[] = [];
  private group = new THREE.Group();
  private particlePool = new MeshPool(400, 6, .5);
  get count() { return this.particles.length + this.lines.length + this.rings.length; }
  private lights: { light: THREE.PointLight; life: number }[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life: number, scale: number, gravity = 6, opacity = 1) {
    if (this.particles.length >= 400) return;
    const mesh = this.particlePool.acquire(color, scale, opacity);
    mesh.position.copy(pos);
    mesh.scale.setScalar(scale);
    this.group.add(mesh);
    this.particles.push({ mesh, vel, life, maxLife: life, gravity, shrink: scale / life, baseScale: scale, pooled: true });
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, color: number, strength = 1) {
    for (let i = 0; i < 6 * strength; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)
      ).addScaledVector(normal, 0.8).normalize();
      const speed = (3 + Math.random() * 7) * strength;
      this.spawnParticle(point.clone(), dir.multiplyScalar(speed), color, 0.35 + Math.random() * 0.25, 0.12 + Math.random() * 0.1);
    }
  }

  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, color: number) {
    const light = new THREE.PointLight(color, 40, 8, 2);
    light.position.copy(pos);
    this.group.add(light);
    this.spawnParticle(pos.clone(), dir.clone().multiplyScalar(4), color, 0.12, 0.35, 0, 0.9);
    this.lights.push({ light, life: 0.08 });
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.group.add(line);
    this.lines.push({ line, life: 0.07, maxLife: 0.07 });
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.12) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(width, width, len, 6, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.group.add(mesh);
    this.lines.push({ line: mesh, life: 0.12, maxLife: 0.12 });
  }

  ring(point: THREE.Vector3, color: number, radius: number, life = 0.45) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.position.copy(point);
    mesh.position.y += 0.15;
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.2);
    this.group.add(mesh);
    this.rings.push({ mesh, life, maxLife: life, grow: radius / life });
  }

  smokeCloud(point: THREE.Vector3, color: number, radius: number, duration = 3) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 14),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
    );
    mesh.position.copy(point);
    mesh.position.y += 0.6;
    mesh.scale.setScalar(radius);
    this.group.add(mesh);
    this.particles.push({ mesh, vel: new THREE.Vector3(0, 0.4, 0), life: duration, maxLife: duration, gravity: 0, shrink: 0, baseScale: radius });
  }

  deathBurst(point: THREE.Vector3, color: number) {
    for (let i = 0; i < 22; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).normalize();
      this.spawnParticle(point.clone(), dir.multiplyScalar(4 + Math.random() * 8), color, 0.5 + Math.random() * 0.4, 0.18);
    }
    this.ring(point, color, 3.5, 0.5);
  }

  healSpark(point: THREE.Vector3, color = 0x7ee0b0) {
    for (let i = 0; i < 5; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).normalize();
      this.spawnParticle(point.clone(), dir.multiplyScalar(2.5), color, 0.4, 0.12);
    }
  }

  update(dt: number) {
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const flash = this.lights[i];
      flash.life -= dt;
      if (flash.life <= 0) {
        flash.light.removeFromParent(); flash.light.dispose(); this.lights.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.pooled) this.particlePool.release(p.mesh);
        else { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const s = p.baseScale - p.shrink * (p.maxLife - p.life);
      p.mesh.scale.setScalar(Math.max(0.01, s));
      if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
        p.mesh.material.opacity = Math.min(1, (p.life / p.maxLife) * 1.4);
      }
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      const m = l.line.material;
      if (m) m.opacity = Math.max(0, l.life / l.maxLife);
      if (l.life <= 0) {
        this.group.remove(l.line);
        l.line.geometry.dispose();
        l.line.material.dispose();
        this.lines.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.mesh.scale.addScalar(r.grow * dt);
      r.mesh.material.opacity = Math.max(0, r.life / r.maxLife) * 0.8;
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear() {
    for (const object of [
      ...this.particles.map(p => p.mesh), ...this.lines.map(l => l.line), ...this.rings.map(r => r.mesh),
    ]) {
      object.removeFromParent(); object.geometry.dispose(); object.material.dispose();
    }
    for (const { light } of this.lights) { light.removeFromParent(); light.dispose(); }
    this.particlePool.clear();
    this.particles = []; this.lines = []; this.rings = []; this.lights = [];
  }
}
