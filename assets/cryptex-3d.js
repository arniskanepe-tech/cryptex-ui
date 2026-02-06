import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

(function boot() {
  const canvas = document.getElementById("c");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xe7e7e7, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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

  // ====== mūsu “izmēru patiesība” vienuviet ======
  const BODY_RADIUS = 1.05;

  const SYMBOLS_PER_RING = 10;
  const STEP_ANGLE = (Math.PI * 2) / SYMBOLS_PER_RING;

  // ring / plate dimensijas
  const RING_COUNT = 4;
  const RING_WIDTH = 0.8;
  const RING_RADIUS = 1.15;
  const RING_GAP = 0.12;

  // BODY_LENGTH piesiets ringiem
  const RINGS_TOTAL = RING_COUNT * RING_WIDTH + (RING_COUNT - 1) * RING_GAP;
  const BODY_LENGTH = RINGS_TOTAL + 2 * RING_GAP;

  const PLATE_H = 0.18;
  const PLATE_OUTER_R = RING_RADIUS + PLATE_H * 0.3 + PLATE_H / 2;
  const CAPS_OUTER_R = PLATE_OUTER_R + 0.1;

  // bultu rinda (tava aktuālā)
  const CHECK_ROW_Y = 0.85;

  // ====== centrs ======
  cryptex.add(createCryptexBodyLocalZ(BODY_LENGTH, BODY_RADIUS));

  // ====== Dizaina gali (LATHE) ======
  const ends = createEndCapsLocalZ({
    bodyLength: BODY_LENGTH,
    outerRadius: CAPS_OUTER_R,
    checkRowY: CHECK_ROW_Y,
  });
  cryptex.add(ends.group);

  // ====== riņķi ======
  const rings = createRingsLocalZ({
    ringCount: RING_COUNT,
    symbols: SYMBOLS_PER_RING,
    ringWidth: RING_WIDTH,
    ringRadius: RING_RADIUS,
    gap: RING_GAP,
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

  // ===== UPRIGHT stabils =====
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
    _upWorld.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    for (const ring of rings) {
      for (const p of ring.userData.plates) {
        const label = p.userData.labelPlane;
        const nLocal = p.userData.labelNormalLocal;
        if (!label || !nLocal) continue;

        p.getWorldQuaternion(_plateWorldQ);
        _invPlateWorldQ.copy(_plateWorldQ).invert();

        _normalWorld.copy(nLocal).applyQuaternion(_plateWorldQ).normalize();

        _upProj
          .copy(_upWorld)
          .addScaledVector(_normalWorld, -_upWorld.dot(_normalWorld));

        if (_upProj.lengthSq() < 1e-6) {
          const fw = _fallbackUp.clone().applyQuaternion(camera.quaternion);
          _upProj.copy(fw).addScaledVector(_normalWorld, -fw.dot(_normalWorld));
        }
        if (_upProj.lengthSq() < 1e-6) {
          const fr = _fallbackRight.clone().applyQuaternion(camera.quaternion);
          _upProj.copy(fr).addScaledVector(_normalWorld, -fr.dot(_normalWorld));
        }

        _upProj.normalize();

        _rightWorld.crossVectors(_upProj, _normalWorld);
        if (_rightWorld.lengthSq() < 1e-6) continue;
        _rightWorld.normalize();

        _upFinal.crossVectors(_normalWorld, _rightWorld).normalize();

        _m.makeBasis(_rightWorld, _upFinal, _normalWorld);
        _qDesiredWorld.setFromRotationMatrix(_m);

        _qLocal.copy(_invPlateWorldQ).multiply(_qDesiredWorld);

        label.quaternion.copy(_qLocal);
      }
    }
  }

  function tick() {
    keepLabelsUpright();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  // ---------- helpers ----------
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function createCryptexBodyLocalZ(length, radius) {
    const geom = new THREE.CylinderGeometry(radius, radius, length, 48, 1);
    geom.rotateX(Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a6b2d,
      roughness: 0.75,
      metalness: 0.45,
    });

    return new THREE.Mesh(geom, mat);
  }

  function createRingsLocalZ({ ringCount, symbols, ringWidth, ringRadius, gap }) {
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

    const baseRadius = radius - 0.1;
    const baseGeom = new THREE.CylinderGeometry(
      baseRadius,
      baseRadius,
      width,
      64,
      1
    );
    baseGeom.rotateX(Math.PI / 2);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x6f5524,
      roughness: 0.8,
      metalness: 0.5,
    });

    const base = new THREE.Mesh(baseGeom, baseMat);
    group.add(base);

    const plates = [];
    const step = (Math.PI * 2) / symbols;

    const plateW = width * 0.96;
    const plateH = 0.18;
    const plateT = 0.62;
    const gapT = 0.08;

    const ringR = radius + plateH * 0.3;
    const plateGeom = new THREE.BoxGeometry(plateT, plateH, plateW);

    const EPS = 0.006;
    const scratchOut = new THREE.Vector3();
    const scratchInvQ = new THREE.Quaternion();
    const scratchLocal = new THREE.Vector3();

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const t = s / (symbols - 1);
      const baseColor = new THREE.Color().setHSL(0.62, 0.1, 0.26 + 0.1 * t);
      if (s === 0) baseColor.setHSL(0.1, 0.55, 0.62);

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

      const digitText = String(s);
      const tex = makeDigitTexture(THREE, digitText);

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
          Math.min(plateT * 0.86, 0.6),
          Math.min(plateW * 0.72, 0.58)
        ),
        labelMat
      );

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

  function makeDigitTexture(THREE, text) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    ctx.clearRect(0, 0, size, size);

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

  // ============================================================
  //  END CAPS (LATHE) — hardcore profils:
  //   - īsāks slīpums
  //   - "knife-edge" gropes
  //   - "fiksatora" sajūta (zemāks radialSegments)
  // ============================================================

  function createEndCapsLocalZ({ bodyLength, outerRadius, checkRowY }) {
    const group = new THREE.Group();

    const overlap = 0.015;
    const leftFace = -bodyLength / 2;
    const rightFace = bodyLength / 2;

    const ornament = makeOrnamentTexture(THREE);
    ornament.wrapS = ornament.wrapT = THREE.RepeatWrapping;
    ornament.repeat.set(6, 1);

    const patina = makePatinaTexture(THREE);
    patina.wrapS = patina.wrapT = THREE.RepeatWrapping;
    patina.repeat.set(3, 1);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0x8a6b2d,
      metalness: 0.78,
      roughness: 0.62,
      map: patina,
      bumpMap: ornament,
      bumpScale: 0.055,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x2a251b,
      metalness: 0.35,
      roughness: 0.95,
    });

    // LatheGeometry ass ir Y => pēc tam pagriežam X, lai ass kļūst par Z.
    const { geom: capGeom, capLen } = buildCapLatheGeometry(outerRadius);
    capGeom.rotateX(Math.PI / 2); // Y -> Z

    const capL = new THREE.Mesh(capGeom, goldMat);
    capL.position.z = leftFace - overlap;
    capL.scale.z = -1; // spogulis: lai “iet uz kreiso pusi”
    group.add(capL);

    const capR = new THREE.Mesh(capGeom, goldMat);
    capR.position.z = rightFace + overlap;
    capR.scale.z = 1;
    group.add(capR);

    // iekšējais “tumšais disks”
    const innerDiskGeom = new THREE.CylinderGeometry(
      outerRadius * 0.62,
      outerRadius * 0.62,
      0.06,
      60,
      1
    );
    innerDiskGeom.rotateX(Math.PI / 2);

    const innerL = new THREE.Mesh(innerDiskGeom, darkMat);
    innerL.position.z = leftFace - overlap - capLen - 0.02;
    group.add(innerL);

    const innerR = new THREE.Mesh(innerDiskGeom, darkMat);
    innerR.position.z = rightFace + overlap + capLen + 0.02;
    group.add(innerR);

    // ===== bultas (sprites) =====
    const arrowTex = makeArrowTexture(THREE);
    const arrowMat = new THREE.SpriteMaterial({
      map: arrowTex,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    const arrowScale = 0.65;
    const arrowInset = 0.06;

    const arrowL = new THREE.Sprite(arrowMat.clone());
    arrowL.material.rotation = 0; // ->
    arrowL.scale.set(arrowScale, arrowScale, 1);
    arrowL.position.set(-1.15, checkRowY, leftFace - arrowInset);
    group.add(arrowL);

    const arrowR = new THREE.Sprite(arrowMat.clone());
    arrowR.material.rotation = Math.PI; // <-
    arrowR.scale.set(arrowScale, arrowScale, 1);
    arrowR.position.set(-1.15, checkRowY, rightFace + arrowInset);
    group.add(arrowR);

    return { group, arrowL, arrowR };
  }

  function buildCapLatheGeometry(outerRadius) {
    // Y=0 ir pie body sejas (pie ringiem). Y aug uz āru.
    // Slīpā zona saīsināta (straujāki kritumi), knife-edge gropes ar ļoti mazu Y starpību.
    const pts = [
      // pie sejas (lielais diametrs)
      new THREE.Vector2(outerRadius * 1.0, 0.0),
      new THREE.Vector2(outerRadius * 1.0, 0.09),

      // Knife-edge groove #1 (ļoti šaura)
      new THREE.Vector2(outerRadius * 0.90, 0.102),
      new THREE.Vector2(outerRadius * 1.0, 0.114),

      // Knife-edge groove #2 (ļoti šaura)
      new THREE.Vector2(outerRadius * 0.88, 0.132),
      new THREE.Vector2(outerRadius * 1.0, 0.146),

      // Straujš kritums (saīsināts slīpums)
      new THREE.Vector2(outerRadius * 0.76, 0.22),

      // Stop-ring (izteikts pakāpiens)
      new THREE.Vector2(outerRadius * 0.86, 0.26),
      new THREE.Vector2(outerRadius * 0.86, 0.33),

      // Ļoti īss slīpums uz “fiksatoru”
      new THREE.Vector2(outerRadius * 0.66, 0.40),

      // “Fiksators” (cilindrs + gala pakāpiens)
      new THREE.Vector2(outerRadius * 0.62, 0.46),
      new THREE.Vector2(outerRadius * 0.62, 0.60),

      // Pēdējais mazais gredzens (asi)
      new THREE.Vector2(outerRadius * 0.50, 0.64),
      new THREE.Vector2(outerRadius * 0.50, 0.78),

      // Aizveram uz asi
      new THREE.Vector2(0.001, 0.78),
    ];

    // zemāks segments skaits => “mehānisks / sešstūra” iespaids
    const radialSegments = 8; // (6–10) varianti: 6 = vissešstūrīgākais
    const geom = new THREE.LatheGeometry(pts, radialSegments);

    const capLen = pts[pts.length - 1].y;
    return { geom, capLen };
  }

  function makeOrnamentTexture(THREE) {
    const w = 512,
      h = 128;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgb(88,88,88)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let x = 0; x < w + 120; x += 120) {
      const midY = h * 0.52;

      ctx.beginPath();
      ctx.moveTo(x + 10, midY);
      ctx.bezierCurveTo(x + 35, midY - 35, x + 70, midY + 35, x + 95, midY);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x + 52, midY - 18, 12, 0.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x + 52, midY + 18, 12, 1.2 * Math.PI, 2.8 * Math.PI);
      ctx.stroke();

      ctx.lineWidth = 6;
    }

    ctx.strokeStyle = "rgb(168,168,168)";
    ctx.lineWidth = 3;
    for (let x = 0; x < w + 120; x += 120) {
      const midY = h * 0.52;
      ctx.beginPath();
      ctx.moveTo(x + 14, midY - 2);
      ctx.bezierCurveTo(
        x + 38,
        midY - 30,
        x + 68,
        midY + 30,
        x + 92,
        midY - 2
      );
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makePatinaTexture(THREE) {
    const w = 512,
      h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#8A6B2D";
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 220; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 6 + Math.random() * 28;
      ctx.fillStyle = `rgba(55,45,20,${0.06 + Math.random() * 0.10})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 8 + Math.random() * 34;
      ctx.fillStyle = `rgba(44,120,92,${0.05 + Math.random() * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#ffffff";
    for (let x = 0; x < w; x += 18) {
      ctx.fillRect(x, 0, 2, h);
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makeArrowTexture(THREE) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");

    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    drawArrow(ctx, 6, 2);

    ctx.fillStyle = "rgba(250,240,210,0.95)";
    drawArrow(ctx, 0, 0);

    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(30,25,18,0.55)";
    strokeArrow(ctx);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;

    function drawArrow(ctx2, dx, dy) {
      ctx2.beginPath();
      ctx2.moveTo(-70 + dx, -40 + dy);
      ctx2.lineTo(40 + dx, -40 + dy);
      ctx2.lineTo(40 + dx, -70 + dy);
      ctx2.lineTo(90 + dx, 0 + dy);
      ctx2.lineTo(40 + dx, 70 + dy);
      ctx2.lineTo(40 + dx, 40 + dy);
      ctx2.lineTo(-70 + dx, 40 + dy);
      ctx2.closePath();
      ctx2.fill();
    }

    function strokeArrow(ctx2) {
      ctx2.beginPath();
      ctx2.moveTo(-70, -40);
      ctx2.lineTo(40, -40);
      ctx2.lineTo(40, -70);
      ctx2.lineTo(90, 0);
      ctx2.lineTo(40, 70);
      ctx2.lineTo(40, 40);
      ctx2.lineTo(-70, 40);
      ctx2.closePath();
      ctx2.stroke();
    }
  }
})();