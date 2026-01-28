// assets/cryptex.js
// Cryptex UI component (DOM-based)
// Sequential unlock + final check only (no intermediate correctness feedback)
//
// Public API:
//   const c = new Cryptex(el, { ringsCount, alphabet, solution, requireFinalCheckButton, onUnlock, onFail, onProgress });
//   c.unlockNextRing();          // +1 unlocked ring (progress)
//   c.setProgress(n);            // set unlocked count directly
//   c.checkFinal();              // only meaningful when progress === ringsCount
//   c.getCode();                 // current code
//   c.setSolution(str);          // change final solution
//
// Notes:
// - No correctness feedback until final check.
// - Locked rings cannot be rotated by the user.

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

      this.state = {
        indices: Array(this.opts.ringsCount).fill(0),
        progress: 0, // how many rings are unlocked from left to right
        isFinalChecked: false,
      };

      this._build();
      this._bind();
      this._renderAll();
      this._updateLocks();
      this._emitProgress();
      this._updateFinalControls();
    }

    // ---------- DOM ----------
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

      this.body = this.root.querySelector(".cryptex-body");
      this.ringEls = Array.from(this.root.querySelectorAll(".cryptex-ring"));
      this.statusEl = this.root.querySelector(".cryptex-status");
      this.checkBtn = this.root.querySelector(".cryptex-check");
    }

    _ringHtml(i) {
      const letters = this.opts.alphabet.split("");
      return `
        <div class="cryptex-ring" data-ring="${i}" role="group" aria-label="Ring ${i + 1}">
          <div class="cryptex-window"></div>
          <div class="cryptex-track">
            ${letters.map((ch) => `<div class="cryptex-letter">${ch}</div>`).join("")}
          </div>
          <div class="cryptex-lock-overlay" aria-hidden="true"></div>
        </div>
      `;
    }

    _bind() {
      this.ringEls.forEach((ringEl) => {
        const ringIndex = Number(ringEl.dataset.ring);

        let startY = 0;
        let startIdx = 0;
        let dragging = false;

        const onDown = (e) => {
          // only unlocked rings can be manipulated
          if (!this._isRingUnlocked(ringIndex)) return;

          e.preventDefault();
          dragging = true;
          ringEl.setPointerCapture?.(e.pointerId);
          startY = e.clientY;
          startIdx = this.state.indices[ringIndex];
          ringEl.classList.add("dragging");
        };

        const onMove = (e) => {
          if (!dragging) return;
          const dy = e.clientY - startY;

          const stepPx = this._letterHeight(ringEl);
          if (!stepPx) return;

          const deltaSteps = Math.round(dy / stepPx);
          const newIdx = this._wrapIndex(startIdx - deltaSteps);
          this.state.indices[ringIndex] = newIdx;

          this._renderRing(ringIndex);
          // no correctness check here by design
        };

        const onUp = () => {
          if (!dragging) return;
          dragging = false;
          ringEl.classList.remove("dragging");
        };

        ringEl.addEventListener("pointerdown", onDown);
        ringEl.addEventListener("pointermove", onMove);
        ringEl.addEventListener("pointerup", onUp);
        ringEl.addEventListener("pointercancel", onUp);

        // wheel support (desktop)
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

    // ---------- Helpers ----------
    _letterHeight(ringEl) {
      const letter = ringEl.querySelector(".cryptex-letter");
      if (!letter) return 0;
      return letter.getBoundingClientRect().height;
    }

    _wrapIndex(idx) {
      const n = this.opts.alphabet.length;
      return ((idx % n) + n) % n;
    }

    _isRingUnlocked(ringIndex) {
      return ringIndex < this.state.progress;
    }

    // ---------- Render ----------
    _renderAll() {
      for (let i = 0; i < this.opts.ringsCount; i++) this._renderRing(i);
    }

    _renderRing(i) {
      const ringEl = this.ringEls[i];
      const track = ringEl.querySelector(".cryptex-track");
      const h = this._letterHeight(ringEl);
      if (!h) return;

      const idx = this.state.indices[i];
      const y = -(idx * h);
      track.style.transform = `translateY(${y}px)`;
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

      // no status spam; keep it minimal
      if (!ready) {
        this._setStatus(`Ievadi kodu: ${this.state.progress}/${this.opts.ringsCount}`);
      } else {
        this._setStatus(`Kods ievadīts. Spied "Pārbaudīt".`);
      }
    }

    _setStatus(msg) {
      if (this.statusEl) this.statusEl.textContent = msg;
    }

    _emitProgress() {
      if (this.opts.onProgress) {
        this.opts.onProgress(this.state.progress, this.opts.ringsCount);
      }
    }

    // ---------- Public API ----------
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

    rotate(ringIndex, dir /* 1 down, -1 up */) {
      if (!this._isRingUnlocked(ringIndex)) return;
      const cur = this.state.indices[ringIndex];
      this.state.indices[ringIndex] = this._wrapIndex(cur + dir);
      this._renderRing(ringIndex);
    }

    // FINAL check only
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
