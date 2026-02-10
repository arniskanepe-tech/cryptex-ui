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
  const RING_COUNT = 5;
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
  function makeBeveledPlateGeom(THREE, plateT, plateH, plateW) {
  const w = plateT; // X
  const h = plateH; // Y
  const d = plateW; // Z

  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo( w / 2, -h / 2);
  shape.lineTo( w / 2,  h / 2);
  shape.lineTo(-w / 2,  h / 2);
  shape.closePath();

  const bevel = Math.min(w, h) * 0.16;
  const bevelSegs = 2;

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelThickness: bevel * 0.55,
    bevelSize: bevel,
    bevelSegments: bevelSegs,
    curveSegments: 1,
    steps: 1,
  });

  geom.translate(0, 0, -d / 2);
  geom.computeVertexNormals();
  return geom;
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
    const plateGeom = makeBeveledPlateGeom(THREE, plateT, plateH, plateW);

    const EPS = 0.035;
    const scratchOut = new THREE.Vector3();
    const scratchInvQ = new THREE.Quaternion();
    const scratchLocal = new THREE.Vector3();

    for (let s = 0; s < symbols; s++) {
      const a = s * step;

      const t = s / (symbols - 1);

    // bronza/zelts gradients (nevis zilgani pelēks)
    const baseColor = new THREE.Color().setHSL(
    0.095,                // hue: silti zeltains/bronzas
    0.35 + 0.10 * t,      // saturation: mazliet dzīvelīgāks uz beigām
    0.22 + 0.08 * t       // lightness: tumšāks -> gaišāks
    );

    // izceltais simbols (s === 0) - mazliet gaišāks zeltains
    if (s === 0) baseColor.setHSL(0.11, 0.55, 0.60);

    const mat = new THREE.MeshStandardMaterial({
    color: baseColor.clone(),
    roughness: 0.38,      // “gludāks” (mazāk plastmasas)
    metalness: 0.35,      // vairāk metālisks
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
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,

      // ✅ palīdz pret “z-fighting” uz bevel virsmām
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

      const labelPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(
          Math.min(plateT * 0.86, 0.6),
          Math.min(plateW * 0.72, 0.58)
        ),
        labelMat
      );

      labelPlane.renderOrder = 10; // lai zīmējas “pa virsu” stabilāk

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

    const x = size / 2;
    const y = size / 2 + 4;

    // 1) tumšā apakšējā ēna (iegravējums)
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(text, x + 3, y + 4);

    // 2) gaišā augšējā mala
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(text, x - 1, y - 1);

    // 3) pats cipars (tumšs metāla gravējums)
    ctx.fillStyle = "rgba(20,15,8,0.95)";
    ctx.fillText(text, x, y);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  // ============================================================
  //  END CAPS (LATHE)
  // ============================================================

  function createEndCapsLocalZ({ bodyLength, outerRadius, checkRowY }) {
  const group = new THREE.Group();

  const overlap = 0.06;
  const leftFace = -bodyLength / 2;
  const rightFace = bodyLength / 2;

  const ornament = makeOrnamentTexture(THREE);
  ornament.wrapS = ornament.wrapT = THREE.RepeatWrapping;
  ornament.repeat.set(6, 1);

  const patina = makePatinaTexture(THREE);
  patina.wrapS = patina.wrapT = THREE.RepeatWrapping;
  patina.repeat.set(3, 1);

  // === 2x “gaišāks” cap materiāls (lai reljefs izlec) ===
    const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,          // svarīgi: ļauj vertexColor joslām dominēt
    vertexColors: true,       // svarīgi
    metalness: 0.86,
    roughness: 0.42,
    bumpMap: ornament,
    bumpScale: 0.095,
    emissive: 0x2c2514,
    emissiveIntensity: 0.85,  // drošs “2x gaišāk” efekts
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    metalness: 0.15,
    roughness: 0.88,
  });

  // LatheGeometry ass ir Y => pēc tam pagriežam X, lai ass kļūst par Z.
  const { geom: capGeom, capLen } = buildCapLatheGeometry(outerRadius);
  capGeom.rotateX(Math.PI / 2); // Y -> Z
  capGeom.computeVertexNormals();

  // ✅ IESLĒDZAM banded krāsas uz cap ģeometrijas
  applyCapBandVertexColors(capGeom);

  // ===== CAPs =====
  const capL = new THREE.Mesh(capGeom, goldMat);
  capL.position.z = leftFace - overlap;
  capL.rotation.y = Math.PI;
  group.add(capL);

  const capR = new THREE.Mesh(capGeom, goldMat);
  capR.position.z = rightFace + overlap;
  group.add(capR);

  // ============================================================
  // spraugas nosedzējs (apkakle) – NEKO citu te nemainu
  // ============================================================
  const collarLen = 0.18;
  const collarR = outerRadius * 1.04;

  const collarGeom = new THREE.CylinderGeometry(collarR, collarR, collarLen, 72, 1);
  collarGeom.rotateX(Math.PI / 2);

  const collarL = new THREE.Mesh(collarGeom, darkMat);
  collarL.position.z = leftFace + collarLen / 2 - 0.06;
  group.add(collarL);

  const collarRMesh = new THREE.Mesh(collarGeom, darkMat);
  collarRMesh.position.z = rightFace - collarLen / 2 + 0.06;
  group.add(collarRMesh);

  collarL.visible = true;
  collarRMesh.visible = true;

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

  innerL.visible = true;
  innerR.visible = true;

  // ============================================================
  // JAUNS: “akcenta riņķi” kā atsevišķi mesh (kontrasts 100% redzams)
  //  - 3 riņķi katrā pusē
  //  - katram sava krāsa + emissive (lai izlec arī tumšumā)
  // ============================================================
  const accents = [
    { r: outerRadius * 0.99, tube: 0.030, z: 0.06,  color: 0xd1b36a, em: 0x3a2a12, ei: 0.65 },
    { r: outerRadius * 0.93, tube: 0.024, z: 0.16,  color: 0x8f6e2a, em: 0x241a0b, ei: 0.55 },
    { r: outerRadius * 0.86, tube: 0.020, z: 0.26,  color: 0x3b2b14, em: 0x120c06, ei: 0.45 },
  ];

  function makeAccentMat(hex, emissiveHex, emissiveIntensity) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    metalness: 0.75,
    roughness: 0.35,
    emissive: emissiveHex,
    emissiveIntensity,
    });
  }

  for (const a of accents) {
  // diametrs balstīts uz MELNĀS APKAKLES rādiusu (collarR), nevis uz cap a.r
  const torusGeom = new THREE.TorusGeometry(collarR * 1.01, a.tube, 14, 96);

  // “uz apkakles” = turpat, kur ir collarL / collarRMesh
  const zOnCollar = collarLen * 0.05;

  // Right side (apkakles zonā)
  const mR = makeAccentMat(a.color, a.em, a.ei);
  const ringR = new THREE.Mesh(torusGeom, mR);
  ringR.position.set(0, 0, rightFace - collarLen / 2 + 0.06 + zOnCollar);
  ringR.rotation.set(0, 0, 0);
  group.add(ringR);

  // Left side (apkakles zonā)
  const mL = makeAccentMat(a.color, a.em, a.ei);
  const ringL = new THREE.Mesh(torusGeom, mL);
  ringL.position.set(0, 0, leftFace + collarLen / 2 - 0.06 - zOnCollar);
  ringL.rotation.set(0, 0, 0);
  group.add(ringL);
}

  // ===== bultas (sprites) =====
  const arrowTex = makeArrowTexture(THREE);
  const arrowMat = new THREE.SpriteMaterial({
    map: arrowTex,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const ARROW_W = 0.75;   // platums
  const ARROW_H = 0.55;   // augstums
  const arrowInset = 0.06;

  const arrowL = new THREE.Sprite(arrowMat.clone());
  arrowL.material.rotation = 0; // ->
  arrowL.scale.set(ARROW_W, ARROW_H, 1);
  arrowL.position.set(-1.15, checkRowY, leftFace - arrowInset);
  group.add(arrowL);

  const arrowR = new THREE.Sprite(arrowMat.clone());
  arrowR.material.rotation = Math.PI; // <-
  arrowR.scale.set(ARROW_W, ARROW_H, 1);
  arrowR.position.set(-1.15, checkRowY, rightFace + arrowInset);
  group.add(arrowR);

  return { group, arrowL, arrowR, capL, capR };
}

  // ===== stabils Lathe profils (bez “ūsām”) =====
  function buildCapLatheGeometry(outerRadius) {
    const pts = [
      new THREE.Vector2(outerRadius * 1.03, 0.0),
      new THREE.Vector2(outerRadius * 1.03, 0.08),

      new THREE.Vector2(outerRadius * 0.98, 0.14),
      new THREE.Vector2(outerRadius * 0.98, 0.22),

      new THREE.Vector2(outerRadius * 0.82, 0.34),
      new THREE.Vector2(outerRadius * 0.82, 0.48),

      new THREE.Vector2(outerRadius * 0.60, 0.62),
      new THREE.Vector2(outerRadius * 0.60, 0.78),
    ];

    const radialSegments = 32;

    let geom = new THREE.LatheGeometry(pts, radialSegments);
    geom = geom.toNonIndexed();
    geom.computeVertexNormals();

    const capLen = pts[pts.length - 1].y;
    return { geom, capLen };
  }

  // ===== JAUNS: “banded” krāsas cap ģeometrijai, lai izceļ gredzenus =====
  function applyCapBandVertexColors(geom) {
    const pos = geom.getAttribute("position");
    const count = pos.count;

    // atrodam Z diapazonu (pēc rotateX ass ir Z)
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = pos.getZ(i);
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const span = Math.max(1e-6, maxZ - minZ);

    // 5 joslas (vari mainīt toņus vēlāk)
        const bandColors = [
      new THREE.Color(0x0f0b08), // ļoti tumšs
      new THREE.Color(0x5a3f1e), // silts vidējs
      new THREE.Color(0xe3c57a), // ļoti gaišs “highlight”
      new THREE.Color(0x8a6b2d), // gold
      new THREE.Color(0x241a12), // tumšs atkal
    ];

    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = pos.getZ(i);
      const t = (z - minZ) / span; // 0..1
      const band = Math.max(0, Math.min(bandColors.length - 1, Math.floor(t * bandColors.length)));
      const c = bandColors[band];

      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  function makeOrnamentTexture(THREE) {
    const w = 512, h = 128;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
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
      ctx.bezierCurveTo(x + 38, midY - 30, x + 68, midY + 30, x + 92, midY - 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makePatinaTexture(THREE) {
    const w = 512, h = 256;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
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
    for (let x = 0; x < w; x += 18) ctx.fillRect(x, 0, 2, h);
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

    ctx.lineWidth = 10;
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