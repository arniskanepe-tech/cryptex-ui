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

        p.userData.plainMats.forEach((m) => m.color.copy(base));

        if (p.userData.labelMat) {
          p.userData.labelMat.opacity = isActive ? 1.0 : 0.92;
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

  // ===== UPRIGHT stabils (bez crash) =====
  const _plateWorldQ = new THREE.Quaternion();
  const _invPlateWorldQ = new THREE.Quaternion();
  const _normalWorld = new THREE.Vector3();
  const _upWorld = new THREE.Vector3();
  const _upProj = new THREE.Vector3();
  const _rightWorld = new THREE.Vector3();
  const _upFinal = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _qDesiredWorld = new THREE.Quaternion();
  const _qLocal = new THREE.Quaternion();
  const _fallbackRight = new THREE.Vector3(1, 0, 0);
  const _fallbackUp = new THREE.Vector3(0, 1, 0);

  function keepLabelsUpright() {
    // kamerai "up" pasaulē
    _upWorld.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    for (const ring of rings) {
      for (const p of ring.userData.plates) {
        const label = p.userData.labelPlane;
        const nLocal = p.userData.labelNormalLocal; // plate-local normāle uz āru
        if (!label || !nLocal) continue;

        // plate world quaternion
        p.getWorldQuaternion(_plateWorldQ);
        _invPlateWorldQ.copy(_plateWorldQ).invert();

        // normāle pasaulē
        _normalWorld.copy(nLocal).applyQuaternion(_plateWorldQ).normalize();

        // projicējam kameras up uz plaknes
        _upProj.copy(_upWorld).addScaledVector(_normalWorld, -_upWorld.dot(_normalWorld));

        // ja sanāk gandrīz 0 (degenerācija), mēģinam ar fallback vektoru
        if (_upProj.lengthSq() < 1e-6) {
          const fw = _fallbackUp.clone().applyQuaternion(camera.quaternion);
          _upProj.copy(fw).addScaledVector(_normalWorld, -fw.dot(_normalWorld));
        }
        if (_upProj.lengthSq() < 1e-6) {
          const fr = _fallbackRight.clone().applyQuaternion(camera.quaternion);
          _upProj.copy(fr).addScaledVector(_normalWorld, -fr.dot(_normalWorld));
        }

        _upProj.normalize();

        // right = up × normal (labrocis)
        _rightWorld.crossVectors(_upProj, _normalWorld);
        if (_rightWorld.lengthSq() < 1e-6) continue;
        _rightWorld.normalize();

        // upFinal = normal × right (ortogonāls)
        _upFinal.crossVectors(_normalWorld, _rightWorld).normalize();

        // world orientācija labelim
        _m.makeBasis(_rightWorld, _upFinal, _normalWorld);
        _qDesiredWorld.setFromRotationMatrix(_m);

        // pārvēršam uz plate-local: qLocal = inv(plateWorldQ) * qDesiredWorld
        _qLocal.copy(_invPlateWorldQ).multiply(_qDesiredWorld);

        // pieliekam labelim
        label.quaternion.copy(_qLocal);
      }
    }
  }

  function tick() {
    // ja kaut kas notiek, šis vairs nepārvērtīs visu par melnu ekrānu
    try {
      keepLabelsUpright();
    } catch (e) {
      console.error("keepLabelsUpright error:", e);
    }

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
      color: 0x8A6B2D,
      roughness: 0.75,
      metalness: 0.45,
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

    const baseRadius = radius - 0.10;
    const baseGeom = new THREE.CylinderGeometry(baseRadius, baseRadius, width, 64, 1);
    baseGeom.rotateX(Math.PI / 2);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x6F5524,
      roughness: 0.80,
      metalness: 0.50,
    });

    const base = new THREE.Mesh(baseGeom, baseMat);
    group.add(base);

    const plates = [];
    const step = (Math.PI * 2) / symbols;

    const plateW = width * 0.96;
    const plateH = 0.18; // radiālais biezums
    const plateT = 0.62; // tangenciālais izmērs
    const gapT = 0.08;

    const ringR = radius + plateH * 0.30;
    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    const EPS = 0.006;
    const scratchOut = new THREE.Vector3();
    const scratchInvQ = new THREE.Quaternion();
    const scratchLocal = new THREE.Vector3();

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const t = s / (symbols - 1);
      const baseColor = new THREE.Color().setHSL(0.62, 0.10, 0.26 + 0.10 * t);
      if (s === 0) baseColor.setHSL(0.10, 0.55, 0.62);

      const mat = new THREE.MeshStandardMaterial({
        color: baseColor.clone(),
        roughness: 0.45,
        metalness: 0.22,
      });

      const p = new THREE.Mesh(plateGeom, mat);

      p.position.x = Math.cos(a) * ringR;
      p.position.y = Math.sin(a) * ringR;
      p.rotation.z = a + Math.PI / 2;

      p.scale.x = (plateT - gapT) / plateT;

      p.userData.baseColor = baseColor;
      p.userData.plainMats = [mat];

      // ===== LABEL =====
      const digitText = String(s);
      const tex = makeDigitTexture(THREE, digitText, baseColor);

      const labelMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.92,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const labelPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(
          Math.min(plateT * 0.86, 0.60),
          Math.min(plateW * 0.72, 0.58)
        ),
        labelMat
      );

      // atrodam “uz āru” virzienu ring-local, pārnesam plate-local
      scratchOut.set(p.position.x, p.position.y, 0).normalize();
      scratchInvQ.copy(p.quaternion).invert();
      scratchLocal.copy(scratchOut).applyQuaternion(scratchInvQ);

      const useY = Math.abs(scratchLocal.y) >= Math.abs(scratchLocal.x);
      const sign = (useY ? scratchLocal.y : scratchLocal.x) >= 0 ? 1 : -1;

      labelPlane.position.set(0, 0, 0);
      labelPlane.rotation.set(0, 0, 0);

      if (useY) {
        labelPlane.position.y = sign * (plateH / 2 + EPS);
        labelPlane.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
        p.userData.labelNormalLocal = new THREE.Vector3(0, sign, 0);
      } else {
        labelPlane.position.x = sign * (plateT / 2 + EPS);
        labelPlane.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        p.userData.labelNormalLocal = new THREE.Vector3(sign, 0, 0);
      }

      p.add(labelPlane);
      p.userData.labelPlane = labelPlane;
      p.userData.labelMat = labelMat;

      plates.push(p);
      group.add(p);
    }

    group.userData.base = base;
    group.userData.plates = plates;
    return group;
  }

  function makeDigitTexture(THREE, text, baseColor) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    // ctx.fillStyle = "#" + baseColor.getHexString();
    // ctx.fillRect(0, 0, size, size);

    // fons (OFF)
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255,255,255,0.00)";
    roundRect(ctx, 28, 28, size - 56, size - 56, 22);
    ctx.fill();

    ctx.font = "900 148px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.lineWidth = 18;
    ctx.strokeStyle = "rgba(0,0,0,0.70)";
    ctx.strokeText(text, size / 2, size / 2 + 4);

    ctx.fillStyle = "rgba(255,255,255,0.96)";
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