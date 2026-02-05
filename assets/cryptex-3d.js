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

  // Lights (plāksnēm, cilindram)
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 6, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-6, 2, -3);
  scene.add(fill);

  // Cryptex group: būvējam "local Z" un pagriežam uz horizontālu
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

  // Keyboard (ja ir)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft") setActive(activeRing - 1);
    if (e.key === "ArrowRight") setActive(activeRing + 1);
    if (e.key === "ArrowUp") rotateActive(+1);
    if (e.key === "ArrowDown") rotateActive(-1);
  });

  // Mobile buttons (tev jau strādā)
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

        // plain virsmas
        p.userData.plainMats.forEach((m) => m.color.copy(base));
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

    // plāksnes proporcijas (kā tev patika)
    const plateW = width * 0.96;  // garums pa cryptex asi (local Z)
    const plateH = 0.18;          // radiālā “augstuma” biezums
    const plateT = 0.62;          // “platums” tangenciālajā virzienā
    const gapT = 0.08;

    const ringR = radius + plateH * 0.30;

    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    // ===== ROTATION_TWEAK =====
    // Ja kādā ierīcē cipari ir pagriezti par 90°, pamaini šo uz 0 vai -Math.PI/2
    const UV_ORIENTATION_FIX = Math.PI / 2;

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const t = symbols === 1 ? 0 : s / (symbols - 1);
      const baseColor = new THREE.Color().setHSL(0.62, 0.10, 0.26 + 0.10 * t);
      if (s === 0) baseColor.setHSL(0.10, 0.55, 0.62);

      const plain = () =>
        new THREE.MeshStandardMaterial({
          color: baseColor.clone(),
          roughness: 0.45,
          metalness: 0.22,
        });

      // Digit tekstūra + materiāls (neatkarīgs no gaismām => vienmēr redzams)
      const digit = s % 10; // pagaidām 0..9
      const digitTex = makeDigitFaceTexture(THREE, String(digit), baseColor);

      // lai cipars būtu "upright" ekrānā: kompensējam plāksnes rotāciju ap Z
      digitTex.center.set(0.5, 0.5);
      digitTex.rotation = -(a + Math.PI / 2) + UV_ORIENTATION_FIX;

      const digitMat = new THREE.MeshBasicMaterial({ map: digitTex });
      digitMat.toneMapped = false;
      digitMat.transparent = false;
      digitMat.depthTest = true;
      digitMat.depthWrite = true;

      // BoxGeometry material order: +x, -x, +y, -y, +z, -z
      // Mēs gribam ciparu tieši uz +Y, jo pēc mūsu p.rotation.z tas ir "ārā prom no centra".
      const mats = [
        plain(),   // +X
        plain(),   // -X
        digitMat,  // +Y  <<< ārējā radiālā virsma (prom no centra)
        plain(),   // -Y
        plain(),   // +Z
        plain(),   // -Z
      ];

      const p = new THREE.Mesh(plateGeom, mats);

      // novietojums apkārt ringam
      p.position.x = Math.cos(a) * ringR;
      p.position.y = Math.sin(a) * ringR;

      // pagrieziens: lai +Y virsma skatās radiāli uz āru
      p.rotation.z = a + Math.PI / 2;

      // šķirba starp segmentiem
      p.scale.x = (plateT - gapT) / plateT;

      p.userData.baseColor = baseColor;
      p.userData.plainMats = [mats[0], mats[1], mats[3], mats[4], mats[5]];

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;
    return group;
  }

  // Uzzīmē ciparu uz fona, kas ir tonī līdzīgs plāksnei, bet ar paneli lai ir kontrasts
  function makeDigitFaceTexture(THREE, text, baseColor) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // fons = plāksnes krāsa
    ctx.fillStyle = "#" + baseColor.getHexString();
    ctx.fillRect(0, 0, size, size);

    // panelis (kontrastaināks, lai mobilajā tiešām redz)
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    roundRect(ctx, 26, 26, size - 52, size - 52, 22);
    ctx.fill();

    // cipars
    ctx.font = "900 156px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // outline
    ctx.lineWidth = 20;
    ctx.strokeStyle = "rgba(0,0,0,0.88)";
    ctx.strokeText(text, size / 2, size / 2 + 4);

    // fill
    ctx.fillStyle = "rgba(255,255,255,0.98)";
    ctx.fillText(text, size / 2, size / 2 + 4);

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