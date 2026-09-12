export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  buttons = new Set<number>();
  private buttonPressed = new Set<number>();
  private canvas: HTMLCanvasElement;
  locked = false;
  blocked = true;
  sensitivity = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener("auxclick", e => e.preventDefault());
    window.addEventListener("keydown", (e) => {
      if (this.blocked || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement).tagName)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (["Tab", "Space", "KeyH"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.buttons.clear(); });
    window.addEventListener("mousedown", (e) => {
      if (this.blocked) return;
      this.buttons.add(e.button);
      this.buttonPressed.add(e.button);
    });
    window.addEventListener("mouseup", (e) => this.buttons.delete(e.button));
    document.addEventListener("mousemove", (e) => {
      if (this.locked && !this.blocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  requestLock() {
    try {
      const p: unknown = this.canvas.requestPointerLock?.();
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
    } catch { /* ignore (headless/unsupported) */ }
  }

  reset() {
    this.keys.clear(); this.pressed.clear(); this.buttons.clear(); this.buttonPressed.clear();
    this.mouseDX = this.mouseDY = 0;
  }
  setLocked(v: boolean) { this.locked = v; if (!v) this.reset(); }

  down(code: string) { return this.keys.has(code); }
  /** Non-consuming press query: all readers see the same state until endFrame(). */
  wasPressed(code: string) { return this.pressed.has(code); }
  mouseDown(button: number) { return this.buttons.has(button); }
  wasMousePressed(button: number) { return this.buttonPressed.has(button); }

  /** consume dx/dy since last call */
  takeMouse(): [number, number] {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame() {
    this.pressed.clear();
    this.buttonPressed.clear();
  }
}
