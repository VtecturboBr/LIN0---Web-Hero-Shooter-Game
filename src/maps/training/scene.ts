import * as THREE from 'three';
import type { World } from '../world';
import type { BoxDef } from '../types';
import type { Player } from '../../game/actors/Player';

export function dressTraining(world: World, players: Player[]) {
    const grid = new THREE.GridHelper(48, 24, 0x416477, 0x263d4d);
    grid.position.y = 0.015;
    world.group.add(grid);
    const sign = (text: string, x: number, z: number, color: string, y = 3.7) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 80;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#0b1724"; c.fillRect(0, 0, 512, 80);
      c.fillStyle = color; c.fillRect(0, 74, 512, 6);
      c.font = "bold 28px sans-serif"; c.textAlign = "center";
      c.fillText(text, 256, 48);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
      sprite.position.set(x, y, z); sprite.scale.set(5, 0.78, 1);
      world.group.add(sprite);
    };
    sign("DANO • ALVOS", -4, -4, "#ff3b5c");
    sign("CURA • ALIADOS", 8, 5, "#3f9fff");
    sign("MOBILIDADE", -15, 3, "#8dcaff");
    sign("COBERTURA", 14, -7, "#ffcf3f");
    sign("SHIFT • CIRCUITO DE PRÉDIOS", 0, -24, "#8dcaff", 9);
    for (const building of world.map.boxes.filter(box => box.kind === 'tower')) {
      sign(`TELHADO • ${building.h} m`, building.x, building.z, "#8dcaff", building.h + 1);
    }
    for (const p of players) {
      if (p.isLocal) continue;
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 32),
        new THREE.MeshBasicMaterial({ color: p.team === 1 ? 0xff3b5c : 0x3f9fff, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(p.pos.x, 0.025, p.pos.z);
      world.group.add(pad);
    }
  }

export function dressTrainingBuilding(mesh: THREE.Mesh, b: BoxDef) {
      mesh.name = `training-building-${b.h}m`;
      const floors = Math.floor((b.h - 1) / 2);
      const columns = 3;
      const windows = new THREE.InstancedMesh(
        new THREE.BoxGeometry(.65, .8, .025),
        new THREE.MeshBasicMaterial({ color: 0x85cfed }), floors * columns * 4);
      const pose = new THREE.Object3D();
      let instance = 0;
      for (let floor = 0; floor < floors; floor++) for (let column = 0; column < columns; column++) {
        const y = -b.h / 2 + 1.7 + floor * 2;
        for (const side of [-1, 1]) {
          pose.position.set((column - 1) * (b.w / 4), y, side * (b.d / 2 + .015));
          pose.rotation.y = 0; pose.updateMatrix(); windows.setMatrixAt(instance++, pose.matrix);
          pose.position.set(side * (b.w / 2 + .015), y, (column - 1) * (b.d / 4));
          pose.rotation.y = Math.PI / 2; pose.updateMatrix(); windows.setMatrixAt(instance++, pose.matrix);
        }
      }
      mesh.add(windows);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x426e8b }));
      mesh.add(outline);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.w - .3, b.d - .3), new THREE.MeshBasicMaterial({color: 0x344d62}));
      roof.rotation.x = -Math.PI / 2; roof.position.y = b.h / 2 + .01;
      mesh.add(roof);
    }
