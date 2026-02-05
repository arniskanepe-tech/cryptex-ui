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

  // === Body ===
  scene.add(createCryptexBody());

  // === Rings ===
  const SYMBOLS_PER_RING = 10;
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  const rings = createRings();
  rings.forEach(r => scene.add(r));

  let activeRing = 0;
  updateActiveRingVisual();

  // === Keyboard (ja ir) ===
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key;

    if (k === "ArrowLeft") setActive(activeRing - 1);
    if (k === "ArrowRight") setActive(activeRing + 1);
    if (k === "ArrowUp") rotateActive(+1);
    if (k === "ArrowDown") rotateActive(-1);
  });

  // === Mobile/Screen buttons ===
  bindScreenButtons();

  function bindScreenButtons() {
    const controls = document.querySelector(".controls");
    if (!controls) return;

    // Lai iOS nebūtu “double tap zoom” un lai spiešana būtu “tūlītēja”
    controls.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      e.preventDefault();

      const action = btn.dataset.action;
      if (action === "left") setActive(activeRing - 1);
      if (action === "right") setActive(activeRing + 1);
      if (action === "up") rotateActive(+1);
      if (action === "down") rotateActive(-1);
    }, { passive: false });
  }

  function setActive(nextIndex) {
    activeRing = clamp(nextIndex, 0, rings.length - 1);
    updateActiveRingVisual();
  }

  function rotateActive(dir) {
    rotateRing(rings[activeRing], dir);
  }

  function rotateRing(ring, dir) {
    ring.userData.index =
      (ring.userData.index + dir + SYMBOLS_PER_RING) % SYMBOLS_PER_RING;

    // Precīza pozīcija bez starpstāvokļiem
    ring.rotation.z = ring.userData.index * STEP_ANGLE;
  }

  function updateActiveRingVisual() {
    rings.forEach((r, i) => {
      r.children[0].material.color.set(i === activeRing ? 0x5a6072 : 0x3a3f4d);
    });
  }

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

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function createCryptexBody() {
    const geom = new THREE.CylinderGeometry(1.05, 1.05, 8, 48, 1);
    geom.rotateZ(Math.PI / 2);

    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        color: 0x2b2f3a,
        roughness: 0.55,
        metalness: 0.35,
      })
    );

    return mesh;
  }

  function createRings() {
    const ringCount = 4;
    const ringWidth = 0.8;   // 2× platāks
    const radius = 1.15;
    const gap = 0.12;

    const total = ringCount * ringWidth + (ringCount - 1) * gap;
    const startX = -total / 2 + ringWidth / 2;

    return Array.from({ length: ringCount }, (_, i) => {
      const ring = createDialRing(radius, ringWidth);
      ring.position.x = startX + i * (ringWidth + gap);
      ring.userData.index = 0;
      return ring;
    });
  }

  function createDialRing(radius, width) {
    const geom = new THREE.CylinderGeometry(radius, radius, width, 64, 1);
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