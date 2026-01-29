// assets/cryptex.js
// Cryptex UI component (TRUE 3D rings)
// Sequential unlock + final check only

(function () {
  class Cryptex {
    constructor(rootEl, opts = {}) {
      if (!rootEl) throw new Error("Cryptex: rootEl is required");

      this.root = rootEl;

      this.opts = {
        ringsCount: opts.ringsCount ?? 6,
        alphabet: opts.alphabet ?? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        solution: opts.solution ?? "",
        requireFinalCheckButton: opts.requireFinalCheckButton ?? true,
        onUnlock: typeof opts.onUnlock === "function" ? opts.onUnlock : null,
        onFail: typeof opts.onFail === "function" ? opts.onFail : null,
        onProgress: typeof opts.onProgress === "function" ? opts.onProgress : null,
      };

      this.n = this.opts.alphabet.length;      // faces per ring
      this.stepDeg = 360 / this.n;

      this.state = {
        indices: Array(this.opts.ringsCount).fill(0),
        progress: 0,
        isFinalChecked: false,
      };

      this._build();
      this._bind();
      this._renderAll();
      this._updateLocks();
      this._emitProgress();
      this._updateFinalControls();
    }

    _build() {
      this.root.classList.add("cryptex");

      this.root.innerHTML = `
        <div class="cryptex-shell">
          <div class="cryptex-cap left"><div class="marker"></div></div>

          <div class="cryptex-body" aria-label="Cryptex">
            ${Array.from({ length: this.opts.ringsCount })
              .map((_, i) => this._ringHtml(i))
              .join("")}
          </div>

          <div class="cryptex-cap right"><div class="marker"></div></div>
        </div>

        <div class="cryptex-actions">
          ${
            this.opts.requireFinalCheckButton
              ? `<button class="cryptex-check" type="button" disabled>Pārbaudīt</button>`
              : ``
          }
        </div>

        <div class="cryptex-status" aria-live="polite"></div>
      `;

      this.ringEls = Array.from(this.root.querySelectorAll(".cryptex-ring"));
      this.statusEl = this.root.querySelector(".cryptex-status");
      this.checkBtn = this.root.querySelector(".cryptex-check");
    }

    _ringHtml(i) {
      const letters = this.opts.alphabet.split("");

      // build faces around cylinder
      const faces = letters
        .map((ch, idx) => {
          // rotateY by idx*step, push outward by radius
          // radius comes from CSS var (--radius)
          const a = idx * this.stepDeg;
          return `
            <div class="cryptex-face" style="transform: rotateY(${a}deg) translateZ(var(--radius));">
              <span>${ch}</span>
            </div>
          `;
        })
        .join("");

      return `
        <div class="cryptex-ring" data-ring="${i}" role="group" aria-label="Ring ${i + 1}">
          <div class="cryptex-cylinder"></div>
          <div class="cryptex-window"></div>
          <div class="cryptex-shade"></div>
          <div class="cryptex-highlight"></div>
          <div class="cryptex-lock-overlay" aria-hidden="true"></div>

          <!-- faces -->
          <div class="cryptex-cylinder" data-cylinder="${i}">
            ${faces}
          </div>
        </div>
      `;
    }

    _bind() {
      this.ringEls.forEach((ringEl) => {
        const ringIndex = Number(ringEl.dataset.ring);
        const cylinder = ringEl.querySelector(`[data-cylinder="${ringIndex}"]`);

        let startY = 0;
        let startIdx = 0;
        let dragging = false;

        const onDown = (e) => {
          if (!this._isRingUnlocked(ringIndex)) return;
          e.preventDefault();

          dragging = true;
          ringEl.setPointerCapture?.(e.pointerId);
          startY = e.clientY;
          startIdx = this.state.indices[ringIndex];

          ringEl.classList.add("dragging");
          ringEl.style.setProperty("--tilt", "10deg");
        };

        const onMove = (e) => {
          if (!dragging) return;
          const dy = e.clientY - startY;

          const tilt = Math.max(-16, Math.min(16, -dy / 14));
          ringEl.style.setProperty("--tilt", `${tilt}deg`);

          // convert drag to steps: ~22px per step feels ok
          const stepPx = 22;
          const deltaSteps = Math.round(dy / stepPx);

          const newIdx = this._wrapIndex(startIdx - deltaSteps);
          this.state.indices[ringIndex] = newIdx;
          this._renderRing(ringIndex);
        };

        const onUp = () => {
          if (!dragging) return;
          dragging = false;
          ringEl.classList.remove("dragging");
          ringEl.style.setProperty("--tilt", "0deg");
        };

        ringEl.addEventListener("pointerdown", onDown);
        ringEl.addEventListener("pointermove", onMove);
        ringEl.addEventListener("pointerup", onUp);
        ringEl.addEventListener("pointercancel", onUp);

        ringEl.addEventListener(
          "wheel",
          (e) => {
            if (!this._isRingUnlocked(ringIndex)) return;
            e.preventDefault();
            const dir = e.deltaY > 0 ? 1 : -1;
            this.rotate(ringIndex, dir);
          },
          { passive: false }
        );
      });

      if (this.checkBtn) {
        this.checkBtn.addEventListener("click", () => this.checkFinal());
      }
    }

    _wrapIndex(idx) {
      const n = this.n;
      return ((idx % n) + n) % n;
    }

    _isRingUnlocked(ringIndex) {
      return ringIndex < this.state.progress;
    }

    _renderAll() {
      for (let i = 0; i < this.opts.ringsCount; i++) this._renderRing(i);
    }

    _renderRing(i) {
      const ringEl = this.ringEls[i];
      const idx = this.state.indices[i];

      // To show character idx in the window (front), rotate cylinder opposite direction:
      const spin = -(idx * this.stepDeg);
      ringEl.style.setProperty("--spin", `${spin}deg`);
    }

    _updateLocks() {
      this.ringEls.forEach((el, idx) => {
        const unlocked = this._isRingUnlocked(idx);
        el.classList.toggle("locked", !unlocked);
        el.setAttribute("aria-disabled", unlocked ? "false" : "true");
      });
    }

    _updateFinalControls() {
      const ready = this.state.progress >= this.opts.ringsCount;
      if (this.checkBtn) this.checkBtn.disabled = !ready;

      if (!ready) this._setStatus(`Ievadi kodu: ${this.state.progress}/${this.opts.ringsCount}`);
      else this._setStatus(`Kods ievadīts. Spied "Pārbaudīt".`);
    }

    _setStatus(msg) {
      if (this.statusEl) this.statusEl.textContent = msg;
    }

    _emitProgress() {
      if (this.opts.onProgress) this.opts.onProgress(this.state.progress, this.opts.ringsCount);
    }

    // Public API
    getCode() {
      const letters = this.opts.alphabet;
      return this.state.indices.map((i) => letters[i]).join("");
    }

    setSolution(solution) {
      this.opts.solution = String(solution ?? "");
    }

    setProgress(n) {
      const nn = Math.max(0, Math.min(this.opts.ringsCount, Number(n) || 0));
      this.state.progress = nn;
      this._updateLocks();
      this._emitProgress();
      this._updateFinalControls();
    }

    unlockNextRing() {
      if (this.state.progress >= this.opts.ringsCount) return this.state.progress;
      this.state.progress += 1;
      this._updateLocks();
      this._emitProgress();
      this._updateFinalControls();
      return this.state.progress;
    }

    rotate(ringIndex, dir) {
      if (!this._isRingUnlocked(ringIndex)) return;
      this.state.indices[ringIndex] = this._wrapIndex(this.state.indices[ringIndex] + dir);
      this._renderRing(ringIndex);
    }

    checkFinal() {
      const ready = this.state.progress >= this.opts.ringsCount;
      if (!ready) return false;

      const code = this.getCode();
      const ok = (this.opts.solution || "") === code;

      this.state.isFinalChecked = true;

      if (ok) {
        this.root.classList.remove("failed");
        this.root.classList.add("unlocked");
        this._setStatus("Atvērts ✅");
        if (this.opts.onUnlock) this.opts.onUnlock(code);
      } else {
        this.root.classList.remove("unlocked");
        this.root.classList.add("failed");
        this._setStatus("Nepareizi ❌");
        if (this.opts.onFail) this.opts.onFail(code);
      }
      return ok;
    }
  }

  window.Cryptex = Cryptex;
})();
