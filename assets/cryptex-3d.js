/* ============================================================
   Cryptex 3D – FINAL STABLE VERSION
   ============================================================ */

(() => {

  /* ================== BASIC SETUP ================== */

  const canvas = document.getElementById("c");
  if (!canvas) {
    console.error("Canvas #c not found");
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  camera.position.set(0, 2.2, 10);
  camera.lookAt(0, 0, 0);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ================== LIGHTS ================== */

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(6, 10, 8);
  scene.add(dir);

  /* ================== DATA ================== */

  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGIT = "0123456789";

  const rings = [];
  let lastSelectedRing = null;

  const ringsCountEl = document.getElementById("ringsCount");
  const solutionEl   = document.getElementById("solution");

  /* ================== GEOMETRY PARAMS ================== */

  const ringHeight = 1.10;     // 2x platāki riņķi
  const ringGap    = 0.08;
  const ringRadius = 1.15;

  const cryptexGroup = new THREE.Group();
  scene.add(cryptexGroup);

  /* ================== BUILD ================== */

  function buildCryptex() {
    while (cryptexGroup.children.length) {
      cryptexGroup.remove(cryptexGroup.children[0]);
    }
    rings.length = 0;

    const count = Number(ringsCountEl?.value) || 4;
    const solution = (solutionEl?.value || "").toUpperCase();

    const totalLen = count * ringHeight + (count - 1) * ringGap;
    const startX = -totalLen / 2 + ringHeight / 2;

    for (let i = 0; i < count; i++) {
      const charset = DIGIT.includes(solution[i])
        ? DIGIT
        : ALPHA;

      const group = new THREE.Group();
      group.userData.charset = charset;
      group.userData.index = 0;
      group.userData.targetIndex = 0;

      const step = (Math.PI * 2) / charset.length;
      group.userData.step = step;

      for (let j = 0; j < charset.length; j++) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.55, 0.18),
          new THREE.MeshStandardMaterial({
            color: 0xe5e1db,
            roughness: 0.4
          })
        );

        const a = j * step;
        tile.position.set(
          Math.cos(a) * ringRadius,
          Math.sin(a) * ringRadius,
          0
        );
        tile.rotation.z = a;
        group.add(tile);
      }

      const x = startX + i * (ringHeight + ringGap);
      group.position.set(x, 0, 0);

      rings.push(group);
      cryptexGroup.add(group);
    }
  }

  /* ================== ROTATION ================== */

  function applyRingIndex(ring, idx) {
    const len = ring.userData.charset.length;
    const step = ring.userData.step;

    const wrapped = ((idx % len) + len) % len;
    ring.userData.index = wrapped;
    ring.userData.targetIndex = wrapped;

    const targetAngle = -wrapped * step;

    // no reroll – choose nearest equivalent angle
    const cur = ring.rotation.z;
    const k = Math.round((cur - targetAngle) / (Math.PI * 2));
    ring.rotation.z = targetAngle + k * Math.PI * 2;
  }

  /* ================== + / − CONTROLS ================== */

  const ringControls = document.getElementById("ringControls");

  function buildControls() {
    ringControls.innerHTML = "";

    rings.forEach((ring, i) => {
      const wrap = document.createElement("div");
      wrap.style.position = "absolute";
      wrap.style.pointerEvents = "none";

      const plus = document.createElement("button");
      plus.textContent = "+";
      plus.style.pointerEvents = "auto";

      const minus = document.createElement("button");
      minus.textContent = "−";
      minus.style.pointerEvents = "auto";

      plus.onclick = () => {
        lastSelectedRing = ring;
        applyRingIndex(ring, ring.userData.index + 1);
      };

      minus.onclick = () => {
        lastSelectedRing = ring;
        applyRingIndex(ring, ring.userData.index - 1);
      };

      wrap.appendChild(plus);
      wrap.appendChild(minus);
      ringControls.appendChild(wrap);
      ring.userData.ctrl = wrap;
    });
  }

  function updateControls() {
    const rect = renderer.domElement.getBoundingClientRect();

    rings.forEach(ring => {
      const v = new THREE.Vector3();
      ring.getWorldPosition(v);
      v.project(camera);

      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;

      const el = ring.userData.ctrl;
      if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    });
  }

  /* ================== KEYBOARD ================== */

  window.addEventListener("keydown", e => {
    if (!lastSelectedRing) return;

    if (e.key === "ArrowUp") {
      applyRingIndex(lastSelectedRing, lastSelectedRing.userData.index + 1);
    }
    if (e.key === "ArrowDown") {
      applyRingIndex(lastSelectedRing, lastSelectedRing.userData.index - 1);
    }
  });

  /* ================== INIT ================== */

  buildCryptex();
  buildControls();

  /* ================== LOOP ================== */

  function animate() {
    requestAnimationFrame(animate);
    updateControls();
    renderer.render(scene, camera);
  }

  animate();

})();