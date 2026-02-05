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

  // Cryptex group: build local Z, rotate to horizontal
  const cryptex = new THREE.Group();
  cryptex.rotation.y = Math.PI / 2; // local Z -> world X
  scene.add(cryptex);

  cryptex.add(createCryptexBodyLocalZ());

  // Rings (segmented)
  const SYMBOLS_PER_RING = 10;
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  const rings = createRingsLocalZ({ ringCount: 4, symbols: SYMBOLS_PER_RING });
  rings.forEach(r => cryptex.add(r));

  let activeRing = 0;
  updateActiveRingVisual();

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft") setActive(activeRing - 1);
    if (e.key === "ArrowRight") setActive(activeRing + 1);
    if (e.key === "ArrowUp") rotateActive(+1);
    if (e.key === "ArrowDown") rotateActive(-1);
  });

  // Screen buttons
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
    ring.rotation.z = ring.userData.index * STEP_ANGLE;
  }

  function updateActiveRingVisual() {
    rings.forEach((ring, i) => {
      const isActive = i === activeRing;

      ring.userData.base.material.color.set(isActive ? 0x4f5668 : 0x2f3442);

      // plāksnītes: aktīvajam mazliet gaišākas
      ring.userData.plates.forEach((p) => {
        const baseColor = p.userData.baseColor; // saglabāts katrai plāksnei
        const c = baseColor.clone();
        if (isActive) c.multiplyScalar(1.25);
        p.material.color.copy(c);
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

  function createCryptexBodyLocalZ() {
    const length = 8.0;
    const radius = 1.05;

    const geom = new THREE.CylinderGeometry(radius, radius, length, 48, 1);
    geom.rotateX(Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x232734,
      roughness: 0.65,
      metalness: 0.25,
    });

    return new THREE.Mesh(geom, mat);
  }

  function createRingsLocalZ({ ringCount, symbols }) {
    const ringWidth = 0.8;
    const ringRadius = 1.15;
    const gap = 0.12;

    const total = ringCount * ringWidth + (ringCount - 1) * gap;
    const startZ = -total / 2 + ringWidth / 2;

    return Array.from({ length: ringCount }, (_, i) => {
      const ring = createSegmentedRingLocalZ({
        width: ringWidth,
        radius: ringRadius,
        symbols,
      });

      ring.position.z = startZ + i * (ringWidth + gap);
      ring.userData.index = 0;
      return ring;
    });
  }

  function createSegmentedRingLocalZ({ width, radius, symbols }) {
    const group = new THREE.Group();

    // base cylinder
    const baseRadius = radius - 0.06;
    const baseGeom = new THREE.CylinderGeometry(baseRadius, baseRadius, width, 64, 1);
    baseGeom.rotateX(Math.PI / 2);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2f3442,
      roughness: 0.55,
      metalness: 0.35,
    });

    const base = new THREE.Mesh(baseGeom, baseMat);
    group.add(base);

    // plates
    const plates = [];
    const plateW = width * 0.92;
    const plateH = 0.28;
    const plateT = 0.10;

    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    const step = (Math.PI * 2) / symbols;

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      // katrai plāksnei savs mats (lai krāsas atšķiras)
      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.45,
        metalness: 0.25,
      });

      const p = new THREE.Mesh(plateGeom, mat);

      // pozīcija pa apli
      const r = radius + plateH * 0.35;
      p.position.x = Math.cos(a) * r;
      p.position.y = Math.sin(a) * r;

      // tangenciāli
      p.rotation.z = a + Math.PI / 2;

      // ===== KRĀSOŠANA TESTAM =====
      // Gradient + "marķieris" (s==0) lai uzreiz redzētu rotāciju
      const t = s / (symbols - 1); // 0..1

      // tumšs -> gaišāks pelēks
      const c = new THREE.Color().setHSL(0.62, 0.12, 0.28 + 0.22 * t);

      // marķieris — viena plāksne izteikti gaišāka
      if (s === 0) c.setHSL(0.10, 0.55, 0.62); // silts “bēšīgs” marķieris

      p.userData.baseColor = c; // saglabājam, lai aktīvajam varam pastiprināt
      p.material.color.copy(c);

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;

    return group;
  }
})();