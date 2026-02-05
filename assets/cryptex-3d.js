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

  // Cryptex group: build local Z, rotate to horizontal
  const cryptex = new THREE.Group();
  cryptex.rotation.y = Math.PI / 2; // local Z -> world X
  scene.add(cryptex);

  cryptex.add(createCryptexBodyLocalZ());

  const SYMBOLS_PER_RING = 10;
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  const rings = createRingsLocalZ({
    ringCount: 4,
    symbols: SYMBOLS_PER_RING,
  });
  rings.forEach((r) => cryptex.add(r));

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
    ring.userData.index =
      (ring.userData.index + dir + SYMBOLS_PER_RING) % SYMBOLS_PER_RING;
    ring.rotation.z = ring.userData.index * STEP_ANGLE;
  }

  function updateActiveRingVisual() {
    rings.forEach((ring, i) => {
      const isActive = i === activeRing;

      ring.userData.base.material.color.set(isActive ? 0x4f5668 : 0x2f3442);

      ring.userData.plates.forEach((p) => {
        const base = p.userData.baseColor.clone();
        if (isActive) base.multiplyScalar(1.12);

        // plain faces
        p.userData.plainMats.forEach((m) => m.color.copy(base));

        // digit face
        p.userData.digitMat.emissiveIntensity = isActive ? 0.35 : 0.18;
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

  // Plāksne+cipars = viens mesh (cipars ir tekstūra uz ārējās virsmas)
  function createSegmentedRingLocalZ({ width, radius, symbols }) {
    const group = new THREE.Group();

    // base cylinder
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

      const t = s / (symbols - 1);
      const baseColor = new THREE.Color().setHSL(0.62, 0.10, 0.26 + 0.10 * t);
      if (s === 0) baseColor.setHSL(0.10, 0.55, 0.62);

      const plain = () =>
        new THREE.MeshStandardMaterial({
          color: baseColor.clone(),
          roughness: 0.45,
          metalness: 0.22,
        });

      // ✅ ŠEIT ir galvenais fix:
      // mēs "iecepam" pretējo rotāciju Canvas zīmējumā,
      // lai cipars vienmēr būtu taisni ekrānā, pat ja plāksne rotē ap cilindru.
      const digit = String(s); // šobrīd 0..9
      const bakedAngle = -(a + Math.PI / 2); // pretējais plāksnes pagrieziens

      const digitTex = makeDigitFaceTexture(THREE, digit, baseColor, bakedAngle);

      const digitMat = new THREE.MeshStandardMaterial({
        map: digitTex,
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.15,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.18,
      });
      digitMat.toneMapped = false;

      // BoxGeometry material order: +x, -x, +y, -y, +z, -z
      // Mēs ciparu liekam uz +Y (ārējā radiālā virsma)
      const mats = [
        plain(),   // +X
        plain(),   // -X
        digitMat,  // +Y  <<< ārējā virsma
        plain(),   // -Y
        plain(),   // +Z
        plain(),   // -Z
      ];

      const p = new THREE.Mesh(plateGeom, mats);

      p.position.x = Math.cos(a) * ringR;
      p.position.y = Math.sin(a) * ringR;

      // svarīgi: lai ārējā virsma būtu lokāli +Y
      p.rotation.z = a + Math.PI / 2;

      // šķirba starp segmentiem
      p.scale.x = (plateT - gapT) / plateT;

      p.userData.baseColor = baseColor;
      p.userData.digitMat = digitMat;
      p.userData.plainMats = [mats[0], mats[1], mats[3], mats[4], mats[5]];

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;
    return group;
  }

  // Uzzīmē ciparu uz fona + iecepta rotācija (Safari-draudzīgi)
  function makeDigitFaceTexture(THREE, text, baseColor, angleRad) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // fons = plāksnes krāsa
    ctx.fillStyle = "#" + baseColor.getHexString();
    ctx.fillRect(0, 0, size, size);

    // “iekšējais panelis”
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, 28, 28, size - 56, size - 56, 22);
    ctx.fill();

    // ✅ iecepta rotācija ap centru
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angleRad);
    ctx.translate(-size / 2, -size / 2);

    // cipars
    ctx.font = "900 156px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.lineWidth = 20;
    ctx.strokeStyle = "rgba(0,0,0,0.80)";
    ctx.strokeText(text, size / 2, size / 2 + 4);

    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fillText(text, size / 2, size / 2 + 4);

    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
})();