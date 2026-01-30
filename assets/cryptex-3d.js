(() => {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const STEP = (Math.PI * 2) / ALPHABET.length;

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
  function getTileMaterial(ch){
    if (_tileMatCache.has(ch)) return _tileMatCache.get(ch);

    const S = 256;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d");

    // brass plate base
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0.0, "#f7e7bf");
    g.addColorStop(0.45, "#c99949");
    g.addColorStop(1.0, "#fff1cf");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,S,S);

    // border + subtle bevel lines
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(16,16,S-32,S-32);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.strokeRect(22,22,S-44,S-44);

    // letter
    ctx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1a1208";
    ctx.shadowColor = "rgba(255,255,255,0.35)";
    ctx.shadowOffsetY = 2;
    ctx.fillText(ch, S/2, S/2 + 8);
    ctx.shadowColor = "transparent";

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.needsUpdate = true;

    // bump: make the border + letter feel raised
    const bc = document.createElement("canvas");
    bc.width = S; bc.height = S;
    const btx = bc.getContext("2d");
    btx.fillStyle = "#000";
    btx.fillRect(0,0,S,S);
    btx.filter = "blur(2.2px)";
    btx.fillStyle = "#fff";
    btx.globalAlpha = 0.9;
    btx.fillRect(18,18,S-36,S-36); // plate body
    btx.globalAlpha = 1.0;

    // raised border
    btx.strokeStyle = "#fff";
    btx.lineWidth = 18;
    btx.strokeRect(18,18,S-36,S-36);

    // raised letter
    btx.font = "900 150px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    btx.textAlign = "center";
    btx.textBaseline = "middle";
    btx.fillStyle = "#fff";
    btx.globalAlpha = 0.85;
    btx.fillText(ch, S/2, S/2 + 8);
    btx.globalAlpha = 0.25;
    btx.fillText(ch, S/2 + 2, S/2 + 10);
    btx.globalAlpha = 1.0;
    btx.filter = "none";

    const bump = new THREE.CanvasTexture(bc);
    bump.anisotropy = 8;
    bump.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: bump,
      bumpScale: 0.12,
      metalness: 0.35,
      roughness: 0.38
    });

    _tileMatCache.set(ch, mat);
    return mat;
  }



  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a1f14, metalness: 0.9, roughness: 0.35 });
  const capMat   = new THREE.MeshStandardMaterial({ color: 0xd6b56b, metalness: 0.98, roughness: 0.22 });
  const lipMat   = new THREE.MeshStandardMaterial({ color: 0xb89345, metalness: 0.98, roughness: 0.20 });
  const ringMat  = new THREE.MeshStandardMaterial({ color: 0xd6b36d, metalness: 0.55, roughness: 0.35 }); // base ring band (no printed strip)
  const hubMat   = new THREE.MeshStandardMaterial({ color: 0x1b140d, metalness: 0.88, roughness: 0.45 });

  let cryptexGroup = null;
  let rings = [];
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
  function applyRingIndex(ring, idx){
    idx = ((idx % ALPHABET.length) + ALPHABET.length) % ALPHABET.length;
    ring.userData.index = idx;
    ring.rotation.x = -idx * STEP;
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

    ringsCount = Math.max(1, Math.min(30, Number(ringsCountEl.value)||8));
    ringsCountEl.value = String(ringsCount);
    normalizeSolution(ringsCount);

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

    const windowPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyLen*0.86, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x17110a, metalness: 0.2, roughness: 0.9 })
    );
    windowPlate.position.set(0, 0, ringRadius + 0.50);
    cryptexGroup.add(windowPlate);

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
      g.add(lipB);

      // Inner hub (bushing)
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(ringRadius * 0.58, ringRadius * 0.58, ringHeight * 0.96, 32, 1, false),
        hubMat
      );
      hub.castShadow = true;
      hub.rotation.z = Math.PI/2;
      hub.userData.parentRing = g;
      g.add(hub);


      // Raised letter tiles around the ring (each letter on its own mini-plate)
      const tileCount = ALPHABET.length;
      const tileStep = (Math.PI * 2) / tileCount;

      const tileBandR = ringRadius * 1.015;     // tiles sit slightly above the band
      const tileLift  = 0.010;
      const tileT     = 0.070;                 // plate thickness (radial)
      const tileH     = ringMidH * 0.92;       // along ring axis (x)
      const tileW     = (2 * Math.PI * tileBandR) / tileCount * 0.92; // around circumference

      const tileGeo = new THREE.BoxGeometry(tileH, tileW, tileT);

      for (let j = 0; j < tileCount; j++) {
        const ch = ALPHABET[j];
        const tile = new THREE.Mesh(tileGeo, getTileMaterial(ch));
        tile.castShadow = true;

        // Place tile on the cylinder surface in the ring's local space (axis = X)
        const a = j * tileStep;

        tile.position.set(
          0,
          (tileBandR + tileT/2 + tileLift) * Math.cos(a),
          (tileBandR + tileT/2 + tileLift) * Math.sin(a)
        );

        // Face outward: look at ring center then flip (so front points out)
        tile.lookAt(0, 0, 0);
        tile.rotateY(Math.PI);        // make the textured face point outward

        // Allow raycast to select ring group from tiles too
        tile.userData.parentRing = g;

        g.add(tile);
      }

      g.userData.index = 0;
      g.userData.ringIndex = i;

      cryptexGroup.add(g);
      rings.push(g);
    }

    cryptexGroup.rotation.y = -0.35;
    cryptexGroup.rotation.x = -0.10;

    scene.add(cryptexGroup);
    fitCameraToObject(cryptexGroup);
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
  renderer.domElement.addEventListener("pointerdown", (e) => {
    e.preventDefault();

    const r = pickRing(e);

    // If click hits an unlocked ring -> ring drag
    if (r && r.userData.ringIndex < progress){
      activeRing = r;
      dragStartY = e.clientY;
      dragStartIndex = r.userData.index;
      renderer.domElement.setPointerCapture?.(e.pointerId);
      return;
    }

    // Otherwise orbit whole object (no Shift needed)
    if (cryptexGroup){
      orbiting = true;
      orbitStart.x = e.clientX;
      orbitStart.y = e.clientY;
      orbitStart.ry = cryptexGroup.rotation.y;
      orbitStart.rx = cryptexGroup.rotation.x;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    }
  }, { passive:false });

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (activeRing){
      const dy = e.clientY - dragStartY;
      const steps = Math.round(dy / 18);
      applyRingIndex(activeRing, dragStartIndex - steps);
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

  // Wheel: if over unlocked ring -> rotate it, else zoom camera
  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = pickRing(e);
    if (r && r.userData.ringIndex < progress){
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
    renderer.render(scene, camera);
  }

  buildCryptex();
  animate();
})();
