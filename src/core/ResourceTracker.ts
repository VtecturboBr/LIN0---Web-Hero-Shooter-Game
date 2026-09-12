import * as THREE from 'three';

/** Dispose an ownership boundary once, including shared materials and textures. */
export class ResourceTracker {
  static dispose(...roots: THREE.Object3D[]) {
    const resources = new Set<{ dispose(): void }>();
    for (const root of roots) {
      root.removeFromParent();
      root.traverse(object => {
        if (object instanceof THREE.Light && 'shadow' in object) resources.add((object as THREE.DirectionalLight).shadow);
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) resources.add(mesh.geometry);
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          resources.add(material);
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
        }
      });
    }
    for (const resource of resources) resource.dispose();
  }
}

/** Bounded pool: excess objects are disposed, never retained indefinitely. */
export class MeshPool {
  private free: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  constructor(private limit: number, private segments = 8, private radius = 1) {}
  acquire(color: number, scale: number, opacity = 1) {
    const mesh = this.free.pop() ?? new THREE.Mesh(new THREE.SphereGeometry(this.radius, this.segments, this.segments),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    mesh.material.color.setHex(color); mesh.material.opacity = opacity;
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(scale); mesh.visible = true;
    return mesh;
  }
  release(mesh: THREE.Mesh) {
    mesh.removeFromParent();
    if (this.free.length < this.limit) this.free.push(mesh as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>);
    else ResourceTracker.dispose(mesh);
  }
  clear() { ResourceTracker.dispose(...this.free); this.free = []; }
  get retained() { return this.free.length; }
}
