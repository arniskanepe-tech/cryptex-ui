(() => {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";
  const ALPHABET = LETTERS + DIGITS;

  // Per-letter texture (color + bump) for raised tiles
  const _glyphCache = new Map();
  function makeGlyphTexture(ch){
    if (_glyphCache.has(ch)) return _glyphCache.get(ch);

    const W = 256, H = 256;

    // COLOR
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    const bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0, "#f7f0dc");
    bg.addColorStop(0.5, "#dbcaa5");
    bg.addColorStop(1, "#f8f3e6");
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    // Inner border
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 6;
    ctx.strokeRect(10,10,W-20,H-20);

    // Letter
    ctx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#21160a";
    ctx.fillText(ch, W/2, H/2 + 6);

    const color = new THREE.CanvasTexture(c);
    color.anisotropy = 8;
    color.needsUpdate = true;

    // BUMP (emboss)
    const b = document.createElement("canvas");
    b.width = W; b.height = H;
    const btx = b.getContext("2d");
    btx.fillStyle = "#000";
    btx.fillRect(0,0,W,H);

    btx.filter = "blur(2.2px)";
    btx.strokeStyle = "#fff";
    btx.lineWidth = 18;
    btx.strokeRect(14,14,W-28,H-28);

    btx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btx.textAlign = "center";
    btx.textBaseline = "middle";
    btx.fillStyle = "#fff";
    btx.globalAlpha = 0.9;
    btx.fillText(ch, W/2, H/2 + 6);
    btx.globalAlpha = 0.25;
    btx.fillText(ch, W/2 + 2, H/2 + 8);
    btx.globalAlpha = 1.0;
    btx.filter = "none";

    const bump = new THREE.CanvasTexture(b);
    bump.anisotropy = 8;
    bump.needsUpdate = true;

    const out = { color, bump };
    _glyphCache.set(ch, out);
    return out;
  }

  const ringsCountEl = document.getElementById("ringsCount");
  const solutionEl = document.getElementById("solution");
  const rebuildBtn = document.getElementById("rebuild");
  const levelDoneBtn = document.getElementById("levelDone");
  const checkBtn = document.getElementById("checkBtn");
  const statusEl = document.getElementById("status");

  function normalizeSolution(len){
    let s = String(solutionEl.value || "").trim().toUpperCase();
    if (s.length > len) s = s.slice(0, len);
    while (s.length < len) s += "A";
    solutionEl.value = s;
    return s;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // IMPORTANT for Safari/touch: make sure the canvas receives pointer events and doesn't scroll page
  renderer.domElement.style.touchAction = "none";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2b18, 0.85));

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(8, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-10, 6, -8);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.18 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  function makeLetterTextures(){
    // Color texture (gold-ish band + printed letters)
    const canvas = document.createElement("canvas");
    const W = 2048, H = 256;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#f6e9c2");
    grad.addColorStop(0.45, "#caa35b");
    grad.addColorStop(1, "#fff3d6");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    // cell dividers (visible borders)
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    const cellW = W / ALPHABET.length;
    for (let i=0;i<ALPHABET.length;i++){
      const x = Math.round(i*cellW);
      ctx.beginPath();
      ctx.moveTo(x, 22);
      ctx.lineTo(x, H-22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1208";

    for (let i=0;i<ALPHABET.length;i++){
      const x = (i + 0.5) * cellW;
      const y = H/2 + 8;
      ctx.shadowColor = "rgba(255,255,255,0.35)";
      ctx.shadowOffsetY = 2;
      ctx.fillText(ALPHABET[i], x, y);
      ctx.shadowColor = "transparent";
    }

    const colorTex = new THREE.CanvasTexture(canvas);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.ClampToEdgeWrapping;
    colorTex.anisotropy = 8;
    colorTex.needsUpdate = true;

    // Bump texture (fake relief): borders + letters become height
    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = W; bumpCanvas.height = H;
    const btx = bumpCanvas.getContext("2d");

    btx.fillStyle = "#000";
    btx.fillRect(0,0,W,H);

    // Slightly blurred "height" makes light catch edges
    btx.filter = "blur(2.2px)";
    btx.globalAlpha = 1.0;

    // Stronger borders in bump so each cell has a visible rim
    btx.strokeStyle = "#fff";
    btx.lineWidth = 10;
    for (let i=0;i<ALPHABET.length;i++){
      const x = Math.round(i*cellW);
      btx.beginPath();
      btx.moveTo(x, 18);
      btx.lineTo(x, H-18);
      btx.stroke();
    }

    // Letters in bump (raised/engraved feel)
    btx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btx.textAlign = "center";
    btx.textBaseline = "middle";
    btx.fillStyle = "#fff";

    for (let i=0;i<ALPHABET.length;i++){
      const x = (i + 0.5) * cellW;
      const y = H/2 + 8;
      // tiny offset to create an "emboss" gradient
      btx.globalAlpha = 0.85;
      btx.fillText(ALPHABET[i], x, y);
      btx.globalAlpha = 0.25;
      btx.fillText(ALPHABET[i], x+2, y+2);
      btx.globalAlpha = 1.0;
    }

    btx.filter = "none";

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.ClampToEdgeWrapping;
    bumpTex.anisotropy = 8;
    bumpTex.needsUpdate = true;

    return { colorTex, bumpTex };
  }

  const { colorTex: letterTex, bumpTex: letterBump } = makeLetterTextures();
  // --- Raised "letter tiles" materials (each letter on its own mini-plate) ---
  const _tileMatCache = new Map();

  function getTileMaterials(ch){
    if (_tileMatCache.has(ch)) return _tileMatCache.get(ch);

    // Outward face (+Z) gets the letter; other faces are plain.
    const letter = makeGlyphTexture(ch);

    const faceMat = new THREE.MeshStandardMaterial({
      map: letter.color,
      bumpMap: letter.bump,
      bumpScale: 0.08,
      metalness: 0.10,
      roughness: 0.55
    });

    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xd8d1c2,
      metalness: 0.06,
      roughness: 0.75
    });

    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
    const mats = [sideMat, sideMat, sideMat, sideMat, faceMat, sideMat];
    _tileMatCache.set(ch, mats);
    return mats;
  }

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, metalness: 0.9, roughness: 0.35 });
  const capMat   = new THREE.MeshStandardMaterial({ color: 0xd6b56b, metalness: 0.98, roughness: 0.22 });
  const lipMat   = new THREE.MeshStandardMaterial({ color: 0xb89345, metalness: 0.98, roughness: 0.20 });
  const ringMat  = new THREE.MeshStandardMaterial({ color: 0xd6b36d, metalness: 0.55, roughness: 0.35 }); // base ring band (no printed strip)
  const hubMat   = new THREE.MeshStandardMaterial({ color: 0x1b140d, metalness: 0.88, roughness: 0.45 });;

  let cryptexGroup = null;
  let rings = [];
  // Readout (the long "window" where current symbols are shown)
  let readoutGroup = null;
  let readoutTiles = [];
  let ringsCount = 8;
  let progress = 0;

  // Camera orbit + zoom
  let orbiting = false;
  let orbitStart = { x:0, y:0, ry:0, rx:0 };
  const zoom = { dist: 10 };

  function updateStatus(){
    statusEl.textContent = `Ievadi kodu: ${progress}/${ringsCount}`;
    checkBtn.disabled = progress < ringsCount;
  }
  function setProgress(n){
    progress = Math.max(0, Math.min(ringsCount, n|0));
    updateStatus();
  }
  function codeFromRings(){
    return rings.map(r => ALPHABET[r.userData.index]).join("");
  }

  function updateReadout(){
    if (!readoutTiles || readoutTiles.length === 0) return;

    // Cast a ray from each readout tile back toward the rings and pick the
    // real raised tile that sits "under" the window. This guarantees the
    // readout matches what the player sees on the rotating ring.
    const dir = new THREE.Vector3(0, 0, -1);
    const q = new THREE.Quaternion();

    // Window faces +Z in cryptexGroup local space, so ray goes -Z
    cryptexGroup.getWorldQuaternion(q);
    dir.applyQuaternion(q).normalize();

    const from = new THREE.Vector3();

    for (let i = 0; i < readoutTiles.length; i++){
      const ring = rings[i];
      if (!ring) continue;

      const tile = readoutTiles[i];
      tile.getWorldPosition(from);

      let ch = null;

      const candidates = ring.userData.tileMeshes || [];
      if (candidates.length){
        raycaster.set(from, dir);
        const hits = raycaster.intersectObjects(candidates, true);
        if (hits && hits.length){
          const obj = hits[0].object;
          if (obj && obj.userData && obj.userData.ch) ch = obj.userData.ch;
        }
      }

      // Fallback (should rarely happen)
      if (!ch) ch = ALPHABET[ring.userData.index] || "?";

      const idx = ALPHABET.indexOf(ch);
      if (idx >= 0) ring.userData.index = idx;

      const tex = makeGlyphTexture(ch);
      const mat = tile.material;
      mat.map = tex.color;
      mat.needsUpdate = true;
    }
  }

  function applyRingIndex(ring, idx){
    const n = ring.userData.count || ALPHABET.length;
    idx = ((idx % n) + n) % n;
    const now = performance.now();
    // Small cooldown so symbols cannot "fly through" the window
    if (ring.userData.lockUntil && now < ring.userData.lockUntil) return;
    ring.userData.lockUntil = now + 120; // ms (click, click, click)

    const from = ring.rotation.x;
    const step = ring.userData.step || ((Math.PI*2)/(ring.userData.count||ALPHABET.length));
    let to = -idx * step;
    // Avoid the "fast reroll" when wrapping last↔first by choosing
    // the equivalent angle closest to the current rotation.
    const TWO_PI = Math.PI * 2;
    const k = Math.round((from - to) / TWO_PI);
    to += k * TWO_PI;
    ring.userData.targetIndex = idx;
    ring.userData.index = idx; // logical index
    ring.userData.anim = { from, to, t0: now, dur: 180 };
    // One immediate update so readout reacts fast, then per-frame updates while animating
    updateReadout();
  }

  function fitCameraToObject(obj){
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    obj.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);
    dist *= 1.35;

    zoom.dist = dist;
    camera.position.set(dist * 0.85, dist * 0.40, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    ground.position.y = -(size.y/2) - 0.8;
  }

  function buildCryptex(){
    if (cryptexGroup) scene.remove(cryptexGroup);
    readoutGroup = null;
    readoutTiles = [];

    ringsCount = Math.max(1, Math.min(30, Number(ringsCountEl.value)||8));
    ringsCountEl.value = String(ringsCount);
    normalizeSolution(ringsCount);

    // Build per-ring character sets based on the solution pattern
    const sol = (solutionEl.value || "").toUpperCase();
    const ringCharSets = [];
    for (let i=0;i<ringsCount;i++){
      const c = sol[i] || "A";
      ringCharSets.push((c >= "0" && c <= "9") ? DIGITS : LETTERS);
    }

    progress = 0;
    rings = [];
    cryptexGroup = new THREE.Group();

    const ringRadius = 1.52; // larger rings to match caps
    const ringHeight = 0.55;
    const ringGap = 0.07; // visible micro gap (so rings don't merge into one block)
    const bodyLen = ringsCount * (ringHeight + ringGap) + 1.3;
    // Mechanical core (inner rod) instead of a full outer tube
    const coreRod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, bodyLen + 2.2, 32, 1, false), hubMat);
    coreRod.rotation.z = Math.PI/2;
    coreRod.castShadow = true;
    cryptexGroup.add(coreRod);

    
    // ===== Window / Readout =====
    // This used to be a filled black plate; now it's a "frame" (no fill),
    // so we can show the currently selected symbol from each ring inside it.
    const windowW = bodyLen * 0.86;
    const windowH = 0.62;
    const windowZ = ringRadius + 0.50;

    // Border only (no fill)
    const windowFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(windowW, windowH)),
      new THREE.LineBasicMaterial({ color: 0x111111 })
    );
    windowFrame.position.set(0, 0, windowZ);
    cryptexGroup.add(windowFrame);

    // Per-ring "readout tiles" (small plates with the current glyph texture)
    readoutGroup = new THREE.Group();
    readoutGroup.position.set(0, 0, windowZ + 0.012); // slightly in front of frame
    readoutTiles = [];

    const tileW = ringHeight * 0.88;
    const tileH = windowH * 0.80;
    const tileGeo = new THREE.PlaneGeometry(tileW, tileH);

    for (let i = 0; i < ringsCount; i++){
      const x = -bodyLen/2 + 0.82 + i*(ringHeight + ringGap);

      const tex = makeGlyphTexture(ALPHABET[0]);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.color,
        metalness: 0.05,
        roughness: 0.55
      });

      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.set(x, 0, 0);
      readoutGroup.add(tile);
      readoutTiles.push(tile);
    }

    cryptexGroup.add(readoutGroup);

    const capGeo = new THREE.CylinderGeometry(1.68, 1.68, 0.85, 56);
    const capL = new THREE.Mesh(capGeo, capMat);
    capL.rotation.z = Math.PI/2;
    capL.position.x = -bodyLen/2 - 0.7;
    capL.castShadow = true;
    cryptexGroup.add(capL);

    const capR = new THREE.Mesh(capGeo, capMat);
    capR.rotation.z = Math.PI/2;
    capR.position.x = bodyLen/2 + 0.7;
    capR.castShadow = true;
    cryptexGroup.add(capR);

    const ringMidH = ringHeight - 0.10;   // the textured band is slightly inset
    const lipT = 0.05;                   // lip thickness per side (total ~0.10)
    const midR = ringRadius * 0.985;     // slightly smaller so lips read as edges
    const lipR = ringRadius * 1.02;      // proud edge catches highlights

    const midGeo = new THREE.CylinderGeometry(midR, midR, ringMidH, 64, 1, true);
    const lipGeo = new THREE.CylinderGeometry(lipR, lipR, lipT, 64, 1, false);

    // Spacer rings between symbol-rings (physical separators)
    const spacerT = Math.max(0.03, ringGap * 0.7);
    const spacerR = ringRadius * 1.01;
    const spacerMat = new THREE.MeshStandardMaterial({ color: 0x070707, metalness: 0.15, roughness: 0.9 }); // matte separators to emphasize splits

    for (let i = 0; i < ringsCount - 1; i++) {
      const spacer = new THREE.Mesh(
        new THREE.CylinderGeometry(spacerR, spacerR, spacerT, 56, 1, false),
        spacerMat
      );
      spacer.rotation.z = Math.PI/2;
      const ringCenterX = -bodyLen/2 + 0.82 + i*(ringHeight + ringGap);
      spacer.position.set(ringCenterX + (ringHeight + ringGap)/2, 0, 0);
      spacer.castShadow = true;
      cryptexGroup.add(spacer);
    }

    for (let i=0;i<ringsCount;i++){
      // Use a Group so we can build a "real" ring: mid band + 2 lips + hub
      const g = new THREE.Group();
      const x = -bodyLen/2 + 0.82 + i*(ringHeight + ringGap);
      g.position.set(x, 0, 0);
      g.rotation.z = Math.PI/2;

      // Textured mid band (this is where letters live)
      const mid = new THREE.Mesh(midGeo, ringMat);
      mid.castShadow = true;
      mid.userData.parentRing = g;
      g.add(mid);
      mid.visible = false; // hide rotating band under tiles

      // Edge lips (metal) — makes each ring clearly separate
      const lipA = new THREE.Mesh(lipGeo, lipMat);
      lipA.rotation.z = Math.PI/2;
      lipA.position.x = -(ringHeight/2 - lipT/2);
      lipA.castShadow = true;
      lipA.userData.parentRing = g;

      const lipB = new THREE.Mesh(lipGeo, lipMat);
      lipB.rotation.z = Math.PI/2;
      lipB.position.x = +(ringHeight/2 - lipT/2);
      lipB.castShadow = true;
      lipB.userData.parentRing = g;

      g.add(lipA);
      lipA.visible = false;
      g.add(lipB);
      lipB.visible = false;

      // Inner hub (bushing)
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(ringRadius * 0.58, ringRadius * 0.58, ringHeight * 0.96, 32, 1, false),
        hubMat
      );
      hub.castShadow = true;
      hub.rotation.z = Math.PI/2;
      hub.userData.parentRing = g;
      g.add(hub);

      // Hide dark hub disk (it was visually distracting when rings rotate)
      hub.visible = false;


      // Raised letter tiles around the ring (each letter on its own mini-plate)
      const charset = ringCharSets[i] || ALPHABET;
      const tileCount = charset.length;
      const tileStep = (Math.PI * 2) / tileCount;
      g.userData.charset = charset;
      g.userData.count = tileCount;
      g.userData.step = tileStep;

      const tileBandR = ringRadius * 1.015;     // tiles sit slightly above the band
      const tileLift  = 0.030;
      const tileT     = 0.070;                 // plate thickness (radial)
      const tileH     = ringMidH * 0.92;       // along ring axis (x)
      const tileW     = (2 * Math.PI * tileBandR) / tileCount * 0.92; // around circumference

      const tileGeo = new THREE.BoxGeometry(tileW, tileH, tileT); // (axial, tangential, radial)

      const tileMeshes = [];
      for (let j = 0; j < tileCount; j++) {
        const ch = charset[j];
        const tile = new THREE.Mesh(tileGeo, getTileMaterials(ch));
        tile.castShadow = true;

        // Keep reference so we can "read" the tile that is under the window
        tile.userData.ch = ch;

        // Wrap tile around the ring: use a pivot rotated around X (ring axis)
        const a = j * tileStep;
        const pivot = new THREE.Object3D();
        pivot.rotation.y = a;

        // Put the tile above the ring surface in pivot local space (radial = +Z)
        // This way pivot.rotation.x wraps tiles around the ring correctly.
        tile.position.set(0, 0, tileBandR + tileT/2 + tileLift);

        // Face outward: BoxGeometry's +Z face is the "front", so no extra rotation is needed.

        pivot.add(tile);
        g.add(pivot);

        // Allow raycast to select ring group from tiles too
        tile.userData.parentRing = g;
        tileMeshes.push(tile);
      }

      g.userData.tileMeshes = tileMeshes;

      g.userData.index = 0;
      g.userData.ringIndex = i;

      cryptexGroup.add(g);
      rings.push(g);
    }

    cryptexGroup.rotation.y = -0.35;
    cryptexGroup.rotation.x = -0.10;

    scene.add(cryptexGroup);
    fitCameraToObject(cryptexGroup);
    updateReadout();
    updateStatus();
  }

  // Raycast
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let activeRing = null;
  let dragStartY = 0;
  let dragStartIndex = 0;

  function setPointerFromEvent(e){
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }
  function pickRing(e){
    setPointerFromEvent(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(rings, true); // recursive = true
    if (!hits.length) return null;

    const obj = hits[0].object;
    return obj.userData.parentRing || obj;}

  // Pointer
  const DRAG_PX_PER_STEP = 42;   // bigger = slower
  const DRAG_DEADZONE = 6;       // ignore tiny jitter

  let lastSelectedRing = null;
  let dragAccum = 0;

  renderer.domElement.addEventListener("pointerdown", (e) => {
    e.preventDefault();

    const r = pickRing(e);

    // If click hits a ring -> ring drag
    if (r){
      activeRing = r;
      lastSelectedRing = r;
      dragStartY = e.clientY;
      dragStartIndex = (typeof r.userData.targetIndex === "number") ? r.userData.targetIndex : (r.userData.index || 0);
      dragAccum = 0;
      return;
    }

    // Otherwise orbit whole object
    if (cryptexGroup){
      orbiting = true;
      orbitStart.x = e.clientX;
      orbitStart.y = e.clientY;
      orbitStart.ry = cryptexGroup.rotation.y;
      orbitStart.rx = cryptexGroup.rotation.x;
    }
  }, { passive:false });

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (activeRing){
      // If pointer leaves the ring, stop dragging (prevents "ghost" dragging outside)
      const hovered = pickRing(e);
      if (hovered !== activeRing){
        activeRing = null;
        return;
      }

      const dy = e.clientY - dragStartY;

      // Deadzone to prevent instant jump on click/tap jitter
      if (Math.abs(dy) < DRAG_DEADZONE) return;

      // Convert movement to stepped detents
      const desiredSteps = Math.trunc((dy + (dy>0?DRAG_DEADZONE:-DRAG_DEADZONE)) / DRAG_PX_PER_STEP);

      // Apply only when step count changes
      const newIdx = dragStartIndex - desiredSteps;
      if (newIdx !== activeRing.userData.index){
        applyRingIndex(activeRing, newIdx);
      }
      return;
    }

    if (orbiting && cryptexGroup){
      const dx = e.clientX - orbitStart.x;
      const dy = e.clientY - orbitStart.y;
      cryptexGroup.rotation.y = orbitStart.ry + dx * 0.006;
      cryptexGroup.rotation.x = orbitStart.rx + dy * 0.004;
    }
  });

  renderer.domElement.addEventListener("pointerup", () => { activeRing = null; orbiting = false; });
  renderer.domElement.addEventListener("pointercancel", () => { activeRing = null; orbiting = false; });

  // Keyboard: control the last selected ring
  window.addEventListener("keydown", (e) => {
    if (!lastSelectedRing) return;

    // Ignore key repeat so each press = exactly one detent
    if (e.repeat) return;

    if (e.key === "ArrowUp"){
      e.preventDefault();
      const base = (typeof lastSelectedRing.userData.targetIndex === "number")
        ? lastSelectedRing.userData.targetIndex
        : (lastSelectedRing.userData.index || 0);
      applyRingIndex(lastSelectedRing, base + 1);
    } else if (e.key === "ArrowDown"){
      e.preventDefault();
      const base = (typeof lastSelectedRing.userData.targetIndex === "number")
        ? lastSelectedRing.userData.targetIndex
        : (lastSelectedRing.userData.index || 0);
      applyRingIndex(lastSelectedRing, base - 1);
    }
  }, { passive:false });


  // Wheel: if over ring -> rotate it, else zoom camera
  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = pickRing(e);
    if (r){
      applyRingIndex(r, r.userData.index + (e.deltaY > 0 ? 1 : -1));
      return;
    }
    // zoom
    zoom.dist *= (e.deltaY > 0 ? 1.06 : 0.94);
    zoom.dist = Math.max(3.5, Math.min(40, zoom.dist));
    camera.position.set(zoom.dist * 0.85, zoom.dist * 0.40, zoom.dist);
    camera.lookAt(0,0,0);
  }, { passive:false });

  // UI
  rebuildBtn.addEventListener("click", buildCryptex);
  levelDoneBtn.addEventListener("click", () => setProgress(progress + 1));
  ringsCountEl.addEventListener("change", () => normalizeSolution(Math.max(1, Math.min(30, Number(ringsCountEl.value)||8))));
  checkBtn.addEventListener("click", () => {
    const sol = normalizeSolution(ringsCount);
    const code = codeFromRings();
    alert(code === sol ? ("Atvērts ✅\n"+code) : ("Nepareizi ❌\n"+code));
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
  });

  function animate(){
    requestAnimationFrame(animate);

    let anyAnimating = false;

    if (rings && rings.length){
      const now = performance.now();
      for (const r of rings){
        const a = r?.userData?.anim;
        if (!a) continue;

        const u = Math.min(1, (now - a.t0) / a.dur);
        // easeOutCubic
        const t = 1 - Math.pow(1 - u, 3);
        r.rotation.x = a.from + (a.to - a.from) * t;

        if (u >= 1){
          r.rotation.x = a.to;
          r.userData.anim = null;
        } else {
          anyAnimating = true;
        }
      }
    }

    // Keep readout in sync with what is visually under the frame while dragging/animating
    if (activeRing || anyAnimating){
      updateReadout();
    }

    renderer.render(scene, camera);
  }



  buildCryptex();
  animate();
})();
