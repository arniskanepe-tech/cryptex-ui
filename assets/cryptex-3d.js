import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

(function boot() {
  const canvas = document.getElementById("c");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0b0d12, 1);

  const scene = new THREE.Scene();

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

  // === Cryptex body ===
  const body = createCryptexBody();
  scene.add(body);

  // === Dial rings ===
  const rings = createRings();
  rings.forEach(r => scene.add(r));

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function tick() {
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // ---------- helpers ----------

  function createCryptexBody() {
    const length = 8.0;
    const radius = 1.05;

    const geom = new THREE.CylinderGeometry(radius, radius, length, 48, 1);
    geom.rotateZ(Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2b2f3a,
      roughness: 0.55,
      metalness: 0.35,
    });

    const mesh = new THREE.Mesh(geom, mat);

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

  function createRings() {
    const ringCount = 4;

    const ringWidth = 0.8;     // 2× platāks nekā “parasts”
    const ringRadius = 1.15;
    const gap = 0.12;

    const totalWidth =
      ringCount * ringWidth + (ringCount - 1) * gap;

    const startX = -totalWidth / 2 + ringWidth / 2;

    const rings = [];

    for (let i = 0; i < ringCount; i++) {
      const ring = createDialRing(ringRadius, ringWidth);
      ring.position.x = startX + i * (ringWidth + gap);
      rings.push(ring);
    }

    return rings;
  }

  function createDialRing(radius, width) {
    const geom = new THREE.CylinderGeometry(
      radius,
      radius,
      width,
      64,
      1,
      false
    );

    // cilindrs guļ pa X asi
    geom.rotateZ(Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3f4d,
      roughness: 0.45,
      metalness: 0.4,
    });

    const mesh = new THREE.Mesh(geom, mat);

    const group = new THREE.Group();
    group.add(mesh);

    return group;
  }
})();