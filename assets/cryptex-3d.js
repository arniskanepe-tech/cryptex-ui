// assets/cryptex-3d.js
// Cryptex 3D — v0.1 (Scene + fixed camera + simple body cylinder)

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

(function boot() {
  const canvas = document.getElementById("c");
  if (!canvas) {
    console.error('Canvas ar id="c" nav atrasts.');
    return;
  }

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0b0d12, 1);

  // Scene
  const scene = new THREE.Scene();

  // Camera (fixed; bez OrbitControls)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 2.4, 7.5);
  camera.lookAt(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 6, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-6, 2, -3);
  scene.add(fill);

  // ===== 2) Simple cryptex body cylinder (static) =====
  const body = createCryptexBody();
  scene.add(body);

  // Resize
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Render loop (bez animācijas pagaidām)
  function tick() {
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // --- helpers ---
  function createCryptexBody() {
    // ass virziens: X (horizontāli). CylinderGeometry ass ir Y => griežam ap Z.
    const length = 8.0;
    const radius = 1.05;

    const geom = new THREE.CylinderGeometry(radius, radius, length, 48, 1, false);
    geom.rotateZ(Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2b2f3a,
      roughness: 0.55,
      metalness: 0.35,
    });

    const mesh = new THREE.Mesh(geom, mat);

    // “end-cap” akcenti, lai vizuāli saprotamas malas
    const capGeom = new THREE.TorusGeometry(radius * 0.98, 0.06, 16, 64);
    capGeom.rotateY(Math.PI / 2);

    const capMat = new THREE.MeshStandardMaterial({
      color: 0x141824,
      roughness: 0.65,
      metalness: 0.2,
    });

    const leftCap = new THREE.Mesh(capGeom, capMat);
    leftCap.position.x = -length / 2;

    const rightCap = new THREE.Mesh(capGeom, capMat);
    rightCap.position.x = length / 2;

    const group = new THREE.Group();
    group.add(mesh, leftCap, rightCap);
    return group;
  }
})();