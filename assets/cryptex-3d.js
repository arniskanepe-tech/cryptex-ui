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

  // === Cryptex group (build in local-Z axis, then rotate to world-X) ===
  const cryptex = new THREE.Group();
  cryptex.rotation.y = Math.PI / 2; // local Z -> world X
  scene.add(cryptex);

  // === Body ===
  cryptex.add(createCryptexBodyLocalZ());

  // === Rings (segmented) ===
  const SYMBOLS_PER_RING = 10;                 // plāksnīšu skaits uz riņķa
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  const rings = createRingsLocalZ({ ringCount: 4, symbols: SYMBOLS_PER_RING });
  rings.forEach(r => cryptex.add(r));

  let activeRing = 0;
  updateActiveRingVisual();

  // Keyboard (if any)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft") setActive(activeRing - 1);
    if (e.key === "ArrowRight") setActive(activeRing + 1);
    if (e.key === "ArrowUp") rotateActive(+1);
    if (e.key === "ArrowDown") rotateActive(-1);
  });

  // Screen buttons (mobile)
  bindScreenButtons();

  function bindScreenButtons() {
    const controls = document.querySelector(".controls");
    if (!controls) return;

    controls.addEventListener(
      "pointerdown",
      (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        e.preventDefault();

        const action = btn.dataset.action;
        if (action === "left") setActive(activeRing - 1);
        if (action === "right") setActive(activeRing + 1);
        if (action === "up") rotateActive(+1);
        if (action === "down") rotateActive(-1);
      },
      { passive: false }
    );
  }

  function setActive(nextIndex) {
    activeRing = clamp(nextIndex, 0, rings.length - 1);
    updateActiveRingVisual();
  }

  function rotateActive(dir) {
    const ring = rings[activeRing];
    ring.userData.index = (ring.userData.index + dir + SYMBOLS_PER_RING) % SYMBOLS_PER_RING;

    // Precīzs detent: 1 spiediens = 1 plāksnīte
    ring.rotation.z = ring.userData.index * STEP_ANGLE;
  }

  function updateActiveRingVisual() {
    rings.forEach((ring, i) => {
      const isActive = i === activeRing;
      // bāzes cilindrs
      ring.userData.base.material.color.set(isActive ? 0x4f5668 : 0x2f3442);
      // plāksnītes
      ring.userData.plates.forEach(p => {
        p.material.color.set(isActive ? 0x7a839a : 0x565e73);
      });
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

  // Body along local Z
  function createCryptexBodyLocalZ() {
    const length = 8.0;
    const radius = 1.05;

    const geom = new THREE.CylinderGeometry(radius, radius, length, 48, 1);
    geom.rotateX(Math.PI / 2); // Y axis -> Z axis

    const mat = new THREE.MeshStandardMaterial({
      color: 0x232734,
      roughness: 0.65,
      metalness: 0.25,
    });

    return new THREE.Mesh(geom, mat);
  }

  function createRingsLocalZ({ ringCount, symbols }) {
    const ringWidth = 0.8;   // 2× platāks
    const ringRadius = 1.15; // kur ir plāksnīšu centrs
    const gap = 0.12;

    const total = ringCount * ringWidth + (ringCount - 1) * gap;
    const startZ = -total / 2 + ringWidth / 2;

    const rings = [];

    for (let i = 0; i < ringCount; i++) {
      const ring = createSegmentedRingLocalZ({
        width: ringWidth,
        radius: ringRadius,
        symbols,
      });

      ring.position.z = startZ + i * (ringWidth + gap);
      ring.userData.index = 0;
      rings.push(ring);
    }

    return rings;
  }

  // Riņķis (local Z axis) sastāv no:
  // - bāzes cilindrs (tumšāks)
  // - symbols gab. plāksnītes pa apli (lai redz rotāciju)
  function createSegmentedRingLocalZ({ width, radius, symbols }) {
    const group = new THREE.Group();

    // Bāze (mazliet mazāks radius, lai plāksnītes “sēž” virsū)
    const baseRadius = radius - 0.06;
    const baseGeom = new THREE.CylinderGeometry(baseRadius, baseRadius, width, 64, 1);
    baseGeom.rotateX(Math.PI / 2); // axis -> Z

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2f3442,
      roughness: 0.55,
      metalness: 0.35,
    });

    const base = new THREE.Mesh(baseGeom, baseMat);
    group.add(base);

    // Plāksnītes
    // Forma: plāns “taisnstūra” gabals, kas stāv tangenciāli uz riņķa
    const plates = [];
    const plateW = width * 0.92;   // garums pa Z (riņķa platums)
    const plateH = 0.28;           // augstums (radiāli)
    const plateT = 0.10;           // biezums (tangenciāli)

    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x565e73,
      roughness: 0.45,
      metalness: 0.25,
    });

    const step = (Math.PI * 2) / symbols;

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const p = new THREE.Mesh(plateGeom, plateMat.clone());

      // novietojam plāksnīti pa apli XY plaknē, ass ir Z
      const r = radius + plateH * 0.35; // lai plāksne ir virs bāzes
      p.position.x = Math.cos(a) * r;
      p.position.y = Math.sin(a) * r;

      // orientējam tā, lai plāksnīte būtu tangenciāli (skatās “apkārt”)
      // a + 90° => tangente
      p.rotation.z = a + Math.PI / 2;

      // Neliels “slīpums” uz augšu/leju var dot “mehānisku” sajūtu (bet atstājam 0)
      // p.rotation.x = 0;

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;

    return group;
  }
})();