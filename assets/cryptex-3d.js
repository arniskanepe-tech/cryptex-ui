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

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 6, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-6, 2, -3);
  scene.add(fill);

  const cryptex = new THREE.Group();
  cryptex.rotation.y = Math.PI / 2; // local Z -> world X
  scene.add(cryptex);

  cryptex.add(createCryptexBodyLocalZ());

  const SYMBOLS_PER_RING = 10;
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  // textures 0..9
  const digitMats = buildDigitMaterials(THREE, {
    color: "#FFFFFF",
    outline: "rgba(0,0,0,.85)",
    bg: "rgba(0,0,0,0)",
    font: "900 140px system-ui, -apple-system, Segoe UI, Roboto, Arial",
  });

  const rings = createRingsLocalZ({
    ringCount: 4,
    symbols: SYMBOLS_PER_RING,
    digitMats,
  });
  rings.forEach(r => cryptex.add(r));

  let activeRing = 0;
  updateActiveRingVisual();

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft") setActive(activeRing - 1);
    if (e.key === "ArrowRight") setActive(activeRing + 1);
    if (e.key === "ArrowUp") rotateActive(+1);
    if (e.key === "ArrowDown") rotateActive(-1);
  });

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

      ring.userData.plates.forEach((p) => {
        const baseColor = p.userData.baseColor;
        const c = baseColor.clone();
        if (isActive) c.multiplyScalar(1.15);
        p.material.color.copy(c);

        if (p.userData.label) {
          p.userData.label.material.opacity = isActive ? 1.0 : 0.95;
        }
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

  function createRingsLocalZ({ ringCount, symbols, digitMats }) {
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
        digitMats,
      });

      ring.position.z = startZ + i * (ringWidth + gap);
      ring.userData.index = 0;
      return ring;
    });
  }

  function createSegmentedRingLocalZ({ width, radius, symbols, digitMats }) {
    const group = new THREE.Group();

    const baseRadius = radius - 0.10;
    const baseGeom = new THREE.CylinderGeometry(baseRadius, baseRadius, width, 64, 1);
    baseGeom.rotateX(Math.PI / 2);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x2f3442,
      roughness: 0.55,
      metalness: 0.35,
    });

    const base = new THREE.Mesh(baseGeom, baseMat);
    group.add(base);

    const plates = [];
    const step = (Math.PI * 2) / symbols;

    const plateW = width * 0.96;
    const plateH = 0.18;
    const plateT = 0.62;
    const gapT = 0.08;

    const ringR = radius + plateH * 0.30;

    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const mat = new THREE.MeshStandardMaterial({
        roughness: 0.45,
        metalness: 0.22,
      });

      const p = new THREE.Mesh(plateGeom, mat);

      p.position.x = Math.cos(a) * ringR;
      p.position.y = Math.sin(a) * ringR;
      p.rotation.z = a + Math.PI / 2;

      p.scale.x = (plateT - gapT) / plateT;

      const t = s / (symbols - 1);
      const c = new THREE.Color().setHSL(0.62, 0.10, 0.26 + 0.10 * t);
      if (s === 0) c.setHSL(0.10, 0.55, 0.62);
      p.userData.baseColor = c;
      p.material.color.copy(c);

      // ===== LABEL (digit) =====
      const digit = s % 10;
      const label = createDigitLabelPlane(THREE, digitMats[digit], {
        plateT, plateH, plateW,
      });

      // Novietojam uz ārējās (radiālās) virsmas +Y
      label.position.set(0, plateH / 2 + 0.01, 0);

      // Plaknei jāskatās uz ārpusi (lokāli +Y virziens),
      // tāpēc pagriežam plakni tā, lai tās normāle būtu +Y.
      // PlaneGeometry normāle sākumā ir +Z, tātad: +Z -> +Y => rotācija ap X = -90°
      label.rotation.x = -Math.PI / 2;

      // PAPILDUS: pagriežam par 90° ap Z, lai cipars stāvētu “taisni” uz plāksnes
      label.rotation.z = Math.PI / 2;

      p.add(label);
      p.userData.label = label;

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;
    return group;
  }

  // ======= digit textures =======

  function buildDigitMaterials(THREE, opts) {
    const mats = [];
    for (let d = 0; d <= 9; d++) {
      const tex = makeDigitTexture(THREE, String(d), opts);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        depthTest: false,   // TEST: vienmēr redzams (vēlāk varam ieslēgt)
        depthWrite: false,
      });
      mats.push(mat);
    }
    return mats;
  }

  function makeDigitTexture(THREE, text, opts) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    ctx.clearRect(0, 0, size, size);

    ctx.font = opts.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // outline
    ctx.lineWidth = 18;
    ctx.strokeStyle = opts.outline;
    ctx.strokeText(text, size / 2, size / 2 + 4);

    // fill
    ctx.fillStyle = opts.color;
    ctx.fillText(text, size / 2, size / 2 + 4);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function createDigitLabelPlane(THREE, material, { plateT, plateH, plateW }) {
    // Lielāks label, lai mobilajā tiešām redz
    const w = Math.min(plateT * 0.90, 0.62);
    const h = plateW * 0.62;

    const geom = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geom, material);
    return mesh;
  }
})();