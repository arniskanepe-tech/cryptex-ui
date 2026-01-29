(() => {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const STEP = (Math.PI * 2) / ALPHABET.length;

  // UI
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

  // Renderer / Scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 200);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2b18, 0.85));

  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(8, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-10, 6, -8);
  scene.add(fill);

  // Ground shadow
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.18 })
  );
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -2.1;
  ground.receiveShadow = true;
  scene.add(ground);

  // Letter texture
  function makeLetterTexture(){
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

    // separators
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    const cellW = W / ALPHABET.length;
    for (let i=0;i<ALPHABET.length;i++){
      const x = Math.round(i*cellW);
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x, H-26);
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  const letterTex = makeLetterTexture();

  // Materials
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2a1f14,
    metalness: 0.9,
    roughness: 0.35
  });

  const capMat = new THREE.MeshStandardMaterial({
    color: 0xd6b56b,
    metalness: 0.98,
    roughness: 0.22
  });

  const ringMat = new THREE.MeshStandardMaterial({
    map: letterTex,
    metalness: 0.55,
    roughness: 0.35
  });

  // State
  let cryptexGroup = null;
  let rings = [];
  let ringsCount = 8;
  let progress = 0;

  // For whole-object orbit (Shift+drag)
  let orbiting = false;
  let orbitStart = {x:0,y:0, ry:0, rx:0};

  function codeFromRings(){
    return rings.map(r => ALPHABET[r.userData.index]).join("");
  }

  function updateStatus(){
    statusEl.textContent = `Ievadi kodu: ${progress}/${ringsCount}`;
    checkBtn.disabled = progress < ringsCount;
  }

  function setProgress(n){
    progress = Math.max(0, Math.min(ringsCount, n|0));
    updateStatus();
  }

  function applyRingIndex(ring, idx){
    idx = ((idx % ALPHABET.length) + ALPHABET.length) % ALPHABET.length;
    ring.userData.index = idx;
    // rotate around local X; ring is aligned along X (we rotate Z to align), so use rotation.x
    ring.rotation.x = -idx * STEP;
  }

  function fitCameraToObject(obj){
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // center object at origin
    obj.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let dist = (maxDim / 2) / Math.tan(fov / 2);

    dist *= 1.35; // padding

    camera.position.set(dist * 0.85, dist * 0.40, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // keep ground under object
    ground.position.y = -(size.y/2) - 0.8;
  }

  // Build cryptex 3D
  function buildCryptex(){
    if (cryptexGroup){
      scene.remove(cryptexGroup);
    }

    ringsCount = Math.max(1, Math.min(30, Number(ringsCountEl.value)||8));
    ringsCountEl.value = String(ringsCount);
    normalizeSolution(ringsCount);

    progress = 0;
    rings = [];

    cryptexGroup = new THREE.Group();

    const ringRadius = 1.05;
    const ringHeight = 0.55;
    const ringGap = 0.18;

    const bodyLen = ringsCount * (ringHeight + ringGap) + 1.3;

    // Main tube
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, bodyLen, 56, 1, false),
      metalMat
    );
    tube.rotation.z = Math.PI/2;
    tube.castShadow = true;
    cryptexGroup.add(tube);

    // Window plate
    const windowPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyLen*0.86, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x17110a, metalness: 0.2, roughness: 0.9 })
    );
    windowPlate.position.set(0, 0, ringRadius + 0.50);
    cryptexGroup.add(windowPlate);

    // Caps
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

    // Rings
    const ringGeo = new THREE.CylinderGeometry(ringRadius, ringRadius, ringHeight, 56, 1, true);
    for (let i=0;i<ringsCount;i++){
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.castShadow = true;

      const x = -bodyLen/2 + 0.82 + i*(ringHeight + ringGap);
      r.position.set(x, 0, 0);
      r.rotation.z = Math.PI/2;

      r.userData.index = 0;
      r.userData.ringIndex = i;

      cryptexGroup.add(r);
      rings.push(r);
    }

    // Default product-like pose
    cryptexGroup.rotation.y = -0.35;
    cryptexGroup.rotation.x = -0.10;

    scene.add(cryptexGroup);
    fitCameraToObject(cryptexGroup);
    updateStatus();
  }

  // Interaction: raycast pick ring
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
    const hits = raycaster.intersectObjects(rings, false);
    return hits.length ? hits[0].object : null;
  }

  renderer.domElement.addEventListener("pointerdown", (e) => {
    // Shift+drag = orbit whole object
    if (e.shiftKey && cryptexGroup){
      orbiting = true;
      orbitStart.x = e.clientX;
      orbitStart.y = e.clientY;
      orbitStart.ry = cryptexGroup.rotation.y;
      orbitStart.rx = cryptexGroup.rotation.x;
      renderer.domElement.setPointerCapture?.(e.pointerId);
      return;
    }

    const r = pickRing(e);
    if (!r) return;
    if (r.userData.ringIndex >= progress) return; // locked

    activeRing = r;
    dragStartY = e.clientY;
    dragStartIndex = r.userData.index;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (orbiting && cryptexGroup){
      const dx = e.clientX - orbitStart.x;
      const dy = e.clientY - orbitStart.y;
      cryptexGroup.rotation.y = orbitStart.ry + dx * 0.006;
      cryptexGroup.rotation.x = orbitStart.rx + dy * 0.004;
      return;
    }
    if (!activeRing) return;
    const dy = e.clientY - dragStartY;
    const steps = Math.round(dy / 18);
    applyRingIndex(activeRing, dragStartIndex - steps);
  });

  renderer.domElement.addEventListener("pointerup", () => { activeRing = null; orbiting = false; });
  renderer.domElement.addEventListener("pointercancel", () => { activeRing = null; orbiting = false; });

  renderer.domElement.addEventListener("wheel", (e) => {
    const r = pickRing(e);
    if (!r) return;
    if (r.userData.ringIndex >= progress) return;
    e.preventDefault();
    applyRingIndex(r, r.userData.index + (e.deltaY > 0 ? 1 : -1));
  }, { passive:false });

  // UI wiring
  rebuildBtn.addEventListener("click", buildCryptex);
  levelDoneBtn.addEventListener("click", () => setProgress(progress + 1));
  ringsCountEl.addEventListener("change", () => normalizeSolution(Math.max(1, Math.min(30, Number(ringsCountEl.value)||8))));

  checkBtn.addEventListener("click", () => {
    const sol = normalizeSolution(ringsCount);
    const code = codeFromRings();
    if (code === sol) alert("Atvērts ✅\n" + code);
    else alert("Nepareizi ❌\n" + code);
  });

  // Resize
  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // Render loop
  function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  // Init
  buildCryptex();
  animate();
})();
