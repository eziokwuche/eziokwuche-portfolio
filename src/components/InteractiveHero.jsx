import { useEffect, useRef, useCallback } from "react";
import { useMusicPlayback } from "@/context/MusicPlaybackContext";

const SIN_SIZE = 256;
const SIN_TABLE = new Float32Array(SIN_SIZE);
for (let i = 0; i < SIN_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_SIZE) * Math.PI * 2);
}

const MAX_PARTICLES = 8500;
const PROX_RAD_SQ = 180 * 180;
const ALPHA_LEVELS = 16;

const HERO_DESKTOP = "/assets/hero-desktop.png";
const HERO_MOBILE = "/assets/hero-mobile.png";

const HERO_VERTICAL_NUDGE_PX = 6;

function getBreakpoint() {
  const w = window.innerWidth;
  if (w < 768) return { asset: HERO_MOBILE, zoom: 1.0 };
  if (w <= 1366) return { asset: HERO_DESKTOP, zoom: 1.15 };
  return { asset: HERO_DESKTOP, zoom: 1.0 };
}

export default function InteractiveHero() {
  const { registerHeroSection } = useMusicPlayback();
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);

  const setSectionRef = useCallback(
    (node) => {
      sectionRef.current = node;
      registerHeroSection(node);
    },
    [registerHeroSection]
  );

  useEffect(() => {
    let lockedHeroHeightPx = 0;
    const setHeroVh = () => {
      const vh = window.innerHeight * 0.01;
      lockedHeroHeightPx = vh * 100;
      document.documentElement.style.setProperty("--hero-vh", `${vh}px`);
    };
    setHeroVh();
    window.addEventListener("orientationchange", setHeroVh);

    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let particles = [];
    let mouseX = -1000;
    let mouseY = -1000;
    let rafId = null;
    let resizeTimer = null;
    let loadedImg = null;
    let currentAsset = null;
    let currentZoom = 1.0;
    let startTime = 0;
    let revealDone = false;
    let targetH = 0;
    let offY = 0;
    let cw = 0;
    let ch = 0;
    let dotSize = 6;
    let dotSprite = null;

    let tabVisible = !document.hidden;
    let inViewport = false;
    let loopRunning = false;
    let pausedAt = 0;
    let pointersBound = false;
    let destroyed = false;
    let bufW = 0;
    let bufH = 0;

    const buckets = new Array(ALPHA_LEVELS);
    for (let i = 0; i < ALPHA_LEVELS; i++) buckets[i] = [];

    function sizeCanvas() {
      const w = window.innerWidth;
      const h = lockedHeroHeightPx || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const newBufW = (w * dpr) | 0;
      const newBufH = (h * dpr) | 0;
      cw = w;
      ch = h;
      if (newBufW !== bufW || newBufH !== bufH) {
        bufW = newBufW;
        bufH = newBufH;
        canvas.width = bufW;
        canvas.height = bufH;
      }
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    sizeCanvas();

    function getPointerCoords(e) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseX = (e.clientX - rect.left) * (cw / rect.width);
      mouseY = (e.clientY - rect.top) * (ch / rect.height);
    }

    function clearPointer() {
      mouseX = -1000;
      mouseY = -1000;
    }

    function onPointerLeave(e) {
      if (e.pointerType === "mouse") clearPointer();
    }

    function onPointerDownCapture(e) {
      getPointerCoords(e);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* unsupported */
      }
    }

    function onPointerUpCapture(e) {
      getPointerCoords(e);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }

    function onPointerCancelCapture(e) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      clearPointer();
    }

    function bindPointers() {
      if (pointersBound) return;
      pointersBound = true;
      canvas.addEventListener("pointermove", getPointerCoords);
      canvas.addEventListener("pointerdown", onPointerDownCapture);
      canvas.addEventListener("pointerup", onPointerUpCapture);
      canvas.addEventListener("pointercancel", onPointerCancelCapture);
      canvas.addEventListener("pointerleave", onPointerLeave);
    }

    function unbindPointers() {
      if (!pointersBound) return;
      pointersBound = false;
      canvas.removeEventListener("pointermove", getPointerCoords);
      canvas.removeEventListener("pointerdown", onPointerDownCapture);
      canvas.removeEventListener("pointerup", onPointerUpCapture);
      canvas.removeEventListener("pointercancel", onPointerCancelCapture);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      clearPointer();
    }

    function makeDotSprite(size) {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
      g.fill();
      return c;
    }

    /**
     * @param {{ preserveReveal?: boolean }} opts - If true (e.g. viewport resize, same asset), skip replaying the intro wipe so mobile URL-bar resizes don't "reload" the hero.
     */
    function buildParticles(img, opts = {}) {
      const preserveReveal = opts.preserveReveal === true;
      if (!img.naturalWidth || !img.naturalHeight) return;

      sizeCanvas();

      const vMin = Math.min(cw, ch);
      dotSize = vMin < 500 ? 4 : vMin < 800 ? 5 : vMin < 1200 ? 6 : 7;
      dotSprite = makeDotSprite(dotSize);

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const viewRatio = cw / ch;

      const baseScale = imgRatio > viewRatio
        ? ch / img.naturalHeight
        : cw / img.naturalWidth;
      const scale = baseScale * currentZoom;

      const tw = img.naturalWidth * scale;
      const th = img.naturalHeight * scale;
      const ox = (cw - tw) / 2;
      offY = (ch - th) / 2 + HERO_VERTICAL_NUDGE_PX;
      targetH = th;

      let step = vMin < 500 ? 7 : vMin < 800 ? 8 : vMin < 1200 ? 9 : 10;
      let cols = Math.max(1, Math.floor(tw / step));
      let rows = Math.max(1, Math.floor(th / step));
      while (cols * rows > MAX_PARTICLES * 1.4 && step < 20) {
        step += 1;
        cols = Math.max(1, Math.floor(tw / step));
        rows = Math.max(1, Math.floor(th / step));
      }

      const stepX = tw / cols;
      const stepY = th / rows;

      const sampleMax = 320;
      const sampleW =
        img.naturalWidth >= img.naturalHeight
          ? sampleMax
          : Math.round(sampleMax * (img.naturalWidth / img.naturalHeight));
      const sampleH =
        img.naturalHeight >= img.naturalWidth
          ? sampleMax
          : Math.round(sampleMax * (img.naturalHeight / img.naturalWidth));

      const tmp = document.createElement("canvas");
      tmp.width = sampleW;
      tmp.height = sampleH;
      const tctx = tmp.getContext("2d", { willReadFrequently: true });
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(img, 0, 0, sampleW, sampleH);
      const px = tctx.getImageData(0, 0, sampleW, sampleH).data;
      tmp.width = 0;
      tmp.height = 0;

      particles = [];
      const halfDot = dotSize * 0.5;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sx = Math.min(
            sampleW - 1,
            Math.floor((col / cols) * sampleW)
          );
          const sy = Math.min(
            sampleH - 1,
            Math.floor((row / rows) * sampleH)
          );
          const idx = (sy * sampleW + sx) * 4;
          const brightness = (px[idx] + px[idx + 1] + px[idx + 2]) / 3;
          if (brightness > 30) {
            const dotX = ox + (col + 0.5) * stepX;
            const dotY = offY + (row + 0.5) * stepY;
            const pxVal = (dotX - halfDot) | 0;
            const pyVal = (dotY - halfDot) | 0;
            if (
              pxVal + dotSize <= 0 ||
              pxVal >= cw ||
              pyVal + dotSize <= 0 ||
              pyVal >= ch
            )
              continue;
            particles.push({
              px: pxVal,
              py: pyVal,
              x: dotX,
              y: dotY,
              b: Math.min(brightness / 255, 1),
              active: false,
              t: 0,
              phase: (Math.random() * SIN_SIZE) | 0,
            });
          }
        }
      }

      startTime = performance.now();
      revealDone = false;
      pausedAt = 0;

      if (preserveReveal && particles.length > 0) {
        revealDone = true;
        const now = performance.now();
        for (let i = 0, len = particles.length; i < len; i++) {
          particles[i].active = true;
          particles[i].t = now;
        }
      }
    }

    function rebaseTimestamps() {
      if (pausedAt <= 0) return;
      const gap = performance.now() - pausedAt;
      if (gap <= 0) {
        pausedAt = 0;
        return;
      }
      startTime += gap;
      for (let i = 0, len = particles.length; i < len; i++) {
        if (particles[i].active) particles[i].t += gap;
      }
      pausedAt = 0;
    }

    function draw() {
      if (destroyed || !tabVisible || !inViewport) {
        loopRunning = false;
        return;
      }
      rafId = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, cw, ch);

      const now = performance.now();
      const rp = Math.min(1, (now - startTime) / 1500);
      const revealY = offY + rp * targetH;
      if (rp >= 1) revealDone = true;

      const mx = mouseX;
      const my = mouseY;
      const len = particles.length;

      for (let b = 0; b < ALPHA_LEVELS; b++) buckets[b].length = 0;

      for (let i = 0; i < len; i++) {
        const p = particles[i];
        const dx = p.x - mx;
        const dy = p.y - my;
        const dSq = dx * dx + dy * dy;

        if (!p.active) {
          if (!revealDone && p.y <= revealY) {
            p.active = true;
            p.t = now;
          } else if (dSq < PROX_RAD_SQ) {
            const r = Math.random();
            if (
              (dSq < 10000 && r < 0.45) ||
              (dSq < 40000 && r < 0.12)
            ) {
              p.active = true;
              p.t = now;
            }
          }
        }

        if (!p.active) continue;

        let el = now - p.t;
        if (el > 2000 && dSq < 10000) {
          p.t = now;
          el = 0;
        }

        let mul = 1;
        if (el > 2000) mul = Math.max(0, 1 - (el - 2000) / 3000);

        const baseA = p.b * mul;
        if (baseA <= 0) {
          p.active = false;
          continue;
        }

        const sinIdx =
          (((((el + p.phase) % 300) / 300) * SIN_SIZE) | 0) &
          (SIN_SIZE - 1);
        const phaseMod = 0.5 + 0.5 * SIN_TABLE[sinIdx];
        const a = baseA * phaseMod;
        if (a < 0.01) continue;

        const bi = Math.min(ALPHA_LEVELS - 1, (a * ALPHA_LEVELS) | 0);
        buckets[bi].push(p);
      }

      if (dotSprite) {
        for (let b = 0; b < ALPHA_LEVELS; b++) {
          const bk = buckets[b];
          if (bk.length === 0) continue;
          ctx.globalAlpha = (b + 0.5) / ALPHA_LEVELS;
          for (let j = 0; j < bk.length; j++) {
            ctx.drawImage(dotSprite, bk[j].px, bk[j].py);
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    function startLoop() {
      if (loopRunning || destroyed) return;
      rebaseTimestamps();
      bindPointers();
      loopRunning = true;
      rafId = requestAnimationFrame(draw);
    }

    function stopLoop() {
      if (!loopRunning) return;
      pausedAt = performance.now();
      loopRunning = false;
      unbindPointers();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function evaluate() {
      if (tabVisible && inViewport) startLoop();
      else stopLoop();
    }

    function onVisibilityChange() {
      tabVisible = !document.hidden;
      evaluate();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        evaluate();
      },
      { threshold: 0 }
    );
    observer.observe(section);

    const heroImg = new Image();
    heroImg.crossOrigin = "anonymous";
    heroImg.onload = () => {
      if (destroyed) return;
      loadedImg = heroImg;
      buildParticles(heroImg);
    };
    heroImg.onerror = () => {
      if (destroyed) return;
      sizeCanvas();
      ctx.font = '24px "Inter", system-ui, sans-serif';
      ctx.fillStyle = "#fff";
      ctx.fillText("Could not load hero image", 20, 40);
    };

    function applyBreakpoint() {
      const bp = getBreakpoint();
      currentZoom = bp.zoom;
      if (bp.asset !== currentAsset) {
        currentAsset = bp.asset;
        heroImg.src = bp.asset;
      } else if (loadedImg) {
        buildParticles(loadedImg, { preserveReveal: true });
      }
    }

    const resizeDebounceMs =
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: coarse)")?.matches
        ? 450
        : 220;

    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (destroyed) return;
        applyBreakpoint();
      }, resizeDebounceMs);
    }
    window.addEventListener("resize", handleResize);

    function handleClick() {
      const el = document.getElementById("content");
      if (!el) return;
      const smoother = window.__scrollSmoother;
      if (smoother) {
        smoother.scrollTo(el, true, "top top");
      } else {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
    canvas.addEventListener("click", handleClick);

    evaluate();
    applyBreakpoint();

    return () => {
      window.removeEventListener("orientationchange", setHeroVh);
      destroyed = true;
      stopLoop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("click", handleClick);
      unbindPointers();
      clearTimeout(resizeTimer);
      heroImg.onload = null;
      heroImg.onerror = null;
      heroImg.src = "";
      loadedImg = null;
      particles = [];
      if (dotSprite) { dotSprite.width = 0; dotSprite.height = 0; dotSprite = null; }
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastState = null;

    const getScrollY = () => {
      const smoother = window.__scrollSmoother;
      if (smoother && typeof smoother.scrollTop === "function") {
        return smoother.scrollTop();
      }
      return window.scrollY || window.pageYOffset || 0;
    };

    const tick = () => {
      const section = sectionRef.current;
      if (section) {
        const isScrolled = getScrollY() > 10;
        if (isScrolled !== lastState) {
          section.classList.toggle("hero--scrolled", isScrolled);
          lastState = isScrolled;
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <section ref={setSectionRef} className="hero">
      <canvas ref={canvasRef} />
      <span className="hero-scroll-indicator" aria-hidden="true">
        ↓
      </span>
    </section>
  );
}
