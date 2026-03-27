import { useEffect, useRef } from "react";

const SIN_SIZE = 256;
const SIN_TABLE = new Float32Array(SIN_SIZE);
for (let i = 0; i < SIN_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_SIZE) * Math.PI * 2);
}

const MAX_PARTICLES = 8500;
/** Only run proximity sparkles inside this radius² (avoids ~7k×Math.random per frame). */
const PROX_RAD_SQ = 180 * 180;
const ALPHA_LEVELS = 16;

const HERO_DESKTOP = "/Portfolio Hero-Desktop.png";
const HERO_MOBILE = "/Portfolio Hero-Mobile.png";

/** Nudge the hero down from vertical center so bottom dots sit on the viewport edge. */
const HERO_VERTICAL_NUDGE_PX = 6;

function getBreakpoint() {
  const w = window.innerWidth;
  if (w < 768) return { asset: HERO_MOBILE, zoom: 1.0 };
  if (w <= 1366) return { asset: HERO_DESKTOP, zoom: 1.15 };
  return { asset: HERO_DESKTOP, zoom: 1.0 };
}

export default function InteractiveHero() {
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    if (!canvas || !section) return;

    const ctx = canvas.getContext("2d", { alpha: false });
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
      const h = window.innerHeight;
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

    function getCoords(e) {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseX = (clientX - rect.left) * (cw / rect.width);
      mouseY = (clientY - rect.top) * (ch / rect.height);
    }

    function clearMouse() {
      mouseX = -1000;
      mouseY = -1000;
    }

    function bindPointers() {
      if (pointersBound) return;
      pointersBound = true;
      canvas.addEventListener("mousemove", getCoords);
      canvas.addEventListener("mouseleave", clearMouse);
      canvas.addEventListener("touchstart", getCoords, { passive: true });
      canvas.addEventListener("touchmove", getCoords, { passive: true });
      canvas.addEventListener("touchend", clearMouse, { passive: true });
      canvas.addEventListener("touchcancel", clearMouse, { passive: true });
    }

    function unbindPointers() {
      if (!pointersBound) return;
      pointersBound = false;
      canvas.removeEventListener("mousemove", getCoords);
      canvas.removeEventListener("mouseleave", clearMouse);
      canvas.removeEventListener("touchstart", getCoords);
      canvas.removeEventListener("touchmove", getCoords);
      canvas.removeEventListener("touchend", clearMouse);
      canvas.removeEventListener("touchcancel", clearMouse);
      clearMouse();
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

    function buildParticles(img) {
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

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);

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
        buildParticles(loadedImg);
      }
    }

    function handleResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (destroyed) return;
        applyBreakpoint();
      }, 200);
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

  return (
    <section ref={sectionRef} className="hero">
      <canvas ref={canvasRef} />
    </section>
  );
}
