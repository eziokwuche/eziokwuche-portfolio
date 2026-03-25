import { useState, useRef, useEffect, useCallback } from "react";
import albums from "@/data/albums";

/** Single shared engine — avoids extra `Audio` instances (e.g. React Strict Mode remounts). */
const MUSIC_CAROUSEL_AUDIO_ENGINE = new Audio();
MUSIC_CAROUSEL_AUDIO_ENGINE.preload = "auto";

const TILT = 0.9;
const SPACING = 0.25;
const PERSPECTIVE = -1 / 500;
const ITEM_SIZE = 200;
const DECEL_RATE = 0.95;
const DECEL_MULTIPLIER = 30;
const SCROLL_SPEED = 1.0;
const OFFSET_MULTIPLIER = 2.0;
const AUTO_SCROLL = 0.00;
const SNAP_DURATION = 400;
const SCROLL_RENDER_EPS = 1e-5;
/** Movement below this (px) counts as a tap for sync mobile audio (fat-finger friendly). */
const TAP_MAX_MOVE_PX = 15;
/** Delay to distinguish single tap (play/pause) from double tap (skip track). */
const TAP_DELAY_MS = 300;

function parseAudioTracks(audioSrc) {
  if (audioSrc == null || audioSrc === "") return [];
  return audioSrc.split(";").map((s) => s.trim()).filter(Boolean);
}

function easeInOut(t) {
  return t < 0.5
    ? 0.5 * Math.pow(t * 2, 3)
    : 0.5 * Math.pow(t * 2 - 2, 3) + 1;
}

function clampOffset(offset, count, wrap) {
  if (wrap) {
    return offset - Math.floor(offset / count) * count;
  }
  return Math.max(0, Math.min(count - 1, offset));
}

function itemOffset(index, scrollOffset, count, wrap) {
  let off = index - scrollOffset;
  if (wrap) {
    if (off > count / 2) off -= count;
    else if (off < -count / 2) off += count;
  }
  return off;
}

function coverFlowTransform(offset) {
  const clamped = Math.max(-1, Math.min(1, offset));
  const x = (clamped * 0.5 * TILT + offset * SPACING) * ITEM_SIZE;
  const z = Math.abs(clamped) * ITEM_SIZE * 0.5;
  const rotateY = clamped * 90 * TILT;
  return { x, z, rotateY };
}

export default function MusicCarousel() {
  const count = albums.length;
  const sectionRef = useRef(null);
  const wrapperRef = useRef(null);
  const scrollRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const dragRef = useRef({ down: false, startX: 0, prevX: 0, prevTime: 0, startOffset: 0 });
  const snapRef = useRef(null);
  const autoRef = useRef(true);
  const hoveredRef = useRef(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, tick] = useState(0);
  const audioRef = useRef(MUSIC_CAROUSEL_AUDIO_ENGINE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const currentTrackIdxRef = useRef(0);
  const isPlayingRef = useRef(false);
  const clickTimeoutRef = useRef(null);
  const activeIdxRef = useRef(0);
  const lastRenderedScrollRef = useRef(0);
  const onPointerDownRef = useRef(null);
  const onPointerMoveRef = useRef(null);
  const onPointerUpRef = useRef(null);
  const handleNativeCenterTapRef = useRef(null);
  /** Touchstart/mousedown target .cf-item — touchend target is unreliable on iOS Safari. */
  const touchedCfItemRef = useRef(null);
  /** Mounted for centered album w/ .mp4 so play() can run in the same touch gesture as audio. */
  const activeAnimatedVideoRef = useRef(null);
  const touchGestureRef = useRef({ startX: 0, startY: 0, maxDist: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const wrap = count > 5;

  currentTrackIdxRef.current = currentTrackIdx;
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const audio = audioRef.current;
    const onEnded = () => {
      setIsPlaying(false);
      activeAnimatedVideoRef.current?.pause?.();
    };
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      if (clickTimeoutRef.current != null) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  /** Swipe / scroll to another album: stop playback immediately. */
  useEffect(() => {
    if (clickTimeoutRef.current != null) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    MUSIC_CAROUSEL_AUDIO_ENGINE.pause();
    setIsPlaying(false);
  }, [activeIdx]);

  useEffect(() => {
    currentTrackIdxRef.current = 0;
    setCurrentTrackIdx(0);
    const audio = audioRef.current;
    const tracks = parseAudioTracks(albums[activeIdx]?.audioSrc);
    const first = tracks[0];
    if (first) {
      audio.src = first;
    } else {
      audio.removeAttribute("src");
    }
    audio.load();
  }, [activeIdx]);

  const decelDistance = useCallback((v0) => {
    const a = -v0 * DECEL_MULTIPLIER * (1 - DECEL_RATE);
    if (Math.abs(a) < 0.0001) return 0;
    return -Math.pow(v0, 2) / (2 * a);
  }, []);

  const snapToNearest = useCallback(() => {
    const current = scrollRef.current;
    const target = Math.round(current);
    const clamped = wrap ? target : Math.max(0, Math.min(count - 1, target));
    if (Math.abs(current - clamped) < 0.001) {
      scrollRef.current = clamped;
      return;
    }
    const startOff = current;
    const startTime = performance.now();
    function animate() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / SNAP_DURATION);
      const eased = easeInOut(t);
      scrollRef.current = startOff + (clamped - startOff) * eased;
      if (t < 1) {
        snapRef.current = requestAnimationFrame(animate);
      } else {
        scrollRef.current = clamped;
        snapRef.current = null;
      }
    }
    if (snapRef.current) cancelAnimationFrame(snapRef.current);
    snapRef.current = requestAnimationFrame(animate);
  }, [count, wrap]);

  useEffect(() => {
    function loop(now) {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastTimeRef.current) { lastTimeRef.current = now; return; }
      const dt = Math.min(now - lastTimeRef.current, 50) / 1000;
      lastTimeRef.current = now;

      if (!dragRef.current.down && !snapRef.current) {
        if (Math.abs(velocityRef.current) > 0.01) {
          const a = -velocityRef.current * DECEL_MULTIPLIER * (1 - DECEL_RATE);
          velocityRef.current += a * dt;
          scrollRef.current += velocityRef.current * dt;
          if (Math.abs(velocityRef.current) <= 0.01) {
            velocityRef.current = 0;
            snapToNearest();
          }
        } else if (autoRef.current && !hoveredRef.current) {
          scrollRef.current += AUTO_SCROLL * dt;
        }
      }

      if (wrap) {
        scrollRef.current = clampOffset(scrollRef.current, count, true);
      }

      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < count; i++) {
        const off = itemOffset(i, scrollRef.current, count, wrap);
        const dist = Math.abs(off);
        if (dist < minDist) { minDist = dist; closest = i; }
      }

      let needsTick = false;
      if (closest !== activeIdxRef.current) {
        activeIdxRef.current = closest;
        setActiveIdx(closest);
        needsTick = true;
      }
      const s = scrollRef.current;
      if (Math.abs(s - lastRenderedScrollRef.current) > SCROLL_RENDER_EPS) {
        lastRenderedScrollRef.current = s;
        needsTick = true;
      }
      if (needsTick) tick((n) => n + 1);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [count, wrap, snapToNearest, decelDistance]);

  function onPointerDown(e) {
    e.preventDefault();
    touchedCfItemRef.current = e.target?.closest?.(".cf-item") ?? null;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    touchGestureRef.current = { startX: x, startY: y, maxDist: 0 };
    setIsDragging(true);
    dragRef.current = { down: true, startX: x, prevX: x, prevTime: performance.now(), startOffset: scrollRef.current };
    velocityRef.current = 0;
    autoRef.current = false;
    if (snapRef.current) { cancelAnimationFrame(snapRef.current); snapRef.current = null; }
  }

  function onPointerMove(e) {
    if (!dragRef.current.down) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const g = touchGestureRef.current;
    const d = Math.hypot(x - g.startX, y - g.startY);
    g.maxDist = Math.max(g.maxDist, d);
    const dx = x - dragRef.current.prevX;
    const now = performance.now();
    const dtMs = now - dragRef.current.prevTime;

    scrollRef.current -= (dx * OFFSET_MULTIPLIER * SCROLL_SPEED) / ITEM_SIZE;

    if (dtMs > 0) {
      const instantVel = -(dx / ITEM_SIZE) * OFFSET_MULTIPLIER * SCROLL_SPEED * (1000 / dtMs);
      velocityRef.current = velocityRef.current * 0.5 + instantVel * 0.5;
    }

    dragRef.current.prevX = x;
    dragRef.current.prevTime = now;
  }

  function onPointerUp() {
    setIsDragging(false);
    if (!dragRef.current.down) return;
    dragRef.current.down = false;

    const absV = Math.abs(velocityRef.current);
    if (absV > 2) {
      const dist = decelDistance(velocityRef.current);
      const endOff = scrollRef.current + dist;
      const endIdx = Math.round(endOff);
      const clamped = wrap ? endIdx : Math.max(0, Math.min(count - 1, endIdx));

      const startOff = scrollRef.current;
      const startTime = performance.now();
      const duration = Math.max(200, Math.min(600, Math.abs(dist) * 150));
      velocityRef.current = 0;

      function animate() {
        const t = Math.min(1, (performance.now() - startTime) / duration);
        scrollRef.current = startOff + (clamped - startOff) * easeInOut(t);
        if (t < 1) {
          snapRef.current = requestAnimationFrame(animate);
        } else {
          scrollRef.current = clamped;
          snapRef.current = null;
        }
      }
      if (snapRef.current) cancelAnimationFrame(snapRef.current);
      snapRef.current = requestAnimationFrame(animate);
    } else {
      velocityRef.current = 0;
      snapToNearest();
    }
  }

  function onItemClick(i) {
    if (i === activeIdx) return;

    autoRef.current = false;
    velocityRef.current = 0;
    if (snapRef.current) { cancelAnimationFrame(snapRef.current); snapRef.current = null; }

    let target = i;
    if (wrap) {
      const diff = itemOffset(i, scrollRef.current, count, true);
      target = scrollRef.current + diff;
    }

    const startOff = scrollRef.current;
    const startTime = performance.now();
    function animate() {
      const t = Math.min(1, (performance.now() - startTime) / SNAP_DURATION);
      scrollRef.current = startOff + (target - startOff) * easeInOut(t);
      if (t < 1) {
        snapRef.current = requestAnimationFrame(animate);
      } else {
        scrollRef.current = target;
        snapRef.current = null;
      }
    }
    if (snapRef.current) cancelAnimationFrame(snapRef.current);
    snapRef.current = requestAnimationFrame(animate);
  }

  function onMouseEnter() {
    hoveredRef.current = true;
    autoRef.current = false;
  }

  function onMouseLeave() {
    hoveredRef.current = false;
    if (!dragRef.current.down && Math.abs(velocityRef.current) < 0.01 && !snapRef.current) {
      autoRef.current = true;
    }
    onPointerUp();
  }

  onPointerDownRef.current = onPointerDown;
  onPointerMoveRef.current = onPointerMove;
  onPointerUpRef.current = onPointerUp;

  handleNativeCenterTapRef.current = (e) => {
    if (touchGestureRef.current.maxDist >= TAP_MAX_MOVE_PX) {
      touchedCfItemRef.current = null;
      return;
    }
    const root = wrapperRef.current;
    const tappedItem =
      touchedCfItemRef.current ?? e?.target?.closest?.(".cf-item");
    touchedCfItemRef.current = null;
    if (!tappedItem || !root?.contains(tappedItem)) return;
    const raw = tappedItem.dataset?.albumIndex;
    if (raw === undefined) return;
    const idx = Number(raw);

    let closest = 0;
    let minOff = Infinity;
    for (let i = 0; i < count; i++) {
      const off = itemOffset(i, scrollRef.current, count, wrap);
      const d = Math.abs(off);
      if (d < minOff) {
        minOff = d;
        closest = i;
      }
    }
    if (idx !== closest) return;

    const rawSrc = albums[idx]?.audioSrc;
    if (rawSrc == null || rawSrc === "") {
      touchGestureRef.current.maxDist = TAP_MAX_MOVE_PX;
      return;
    }
    const tracks = parseAudioTracks(rawSrc);
    if (tracks.length === 0) {
      touchGestureRef.current.maxDist = TAP_MAX_MOVE_PX;
      return;
    }

    const audio = MUSIC_CAROUSEL_AUDIO_ENGINE;

    function assignSrcAndPlaySync(url) {
      try {
        const resolved = new URL(url, window.location.href).href;
        if (audio.src !== resolved) audio.src = url;
      } catch {
        audio.src = url;
      }
      audio.load();
      audio.volume = 1;
      setIsPlaying(true);
      const p = audio.play();
      if (p !== undefined) {
        void p.catch(() => {
          setIsPlaying(false);
          activeAnimatedVideoRef.current?.pause?.();
        });
      }
    }

    function tryPlayAnimatedVideo() {
      const v = activeAnimatedVideoRef.current;
      if (v && albums[idx]?.animatedCover) {
        v.muted = true;
        v.setAttribute("playsinline", "");
        v.setAttribute("webkit-playsinline", "");
        const vp = v.play();
        if (vp !== undefined) void vp.catch(() => {});
      }
    }

    if (clickTimeoutRef.current != null) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      const next = (currentTrackIdxRef.current + 1) % tracks.length;
      currentTrackIdxRef.current = next;
      setCurrentTrackIdx(next);
      assignSrcAndPlaySync(tracks[next]);
      tryPlayAnimatedVideo();
      touchGestureRef.current.maxDist = TAP_MAX_MOVE_PX;
      return;
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      const tIdx = Math.min(currentTrackIdxRef.current, tracks.length - 1);
      const url = tracks[tIdx];
      if (isPlayingRef.current) {
        audio.pause();
        setIsPlaying(false);
        activeAnimatedVideoRef.current?.pause?.();
      } else {
        assignSrcAndPlaySync(url);
        tryPlayAnimatedVideo();
      }
    }, TAP_DELAY_MS);

    touchGestureRef.current.maxDist = TAP_MAX_MOVE_PX;
  };

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      onPointerDownRef.current?.(e);
    };
    const onTouchMove = (e) => {
      onPointerMoveRef.current?.(e);
    };
    const onTouchEnd = (e) => {
      handleNativeCenterTapRef.current?.(e);
      onPointerUpRef.current?.();
    };
    const onTouchCancel = () => {
      touchedCfItemRef.current = null;
      onPointerUpRef.current?.();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  const bgColor = albums[activeIdx]?.dominantColor || "#000";

  const visible = [];
  for (let i = 0; i < count; i++) {
    const off = itemOffset(i, scrollRef.current, count, wrap);
    if (Math.abs(off) > 6) continue;
    const { x, z, rotateY } = coverFlowTransform(off);
    const absClamped = Math.abs(Math.max(-1, Math.min(1, off)));
    const zIndex = Math.round((1 - Math.abs(off) / 6) * 100);

    visible.push({
      album: albums[i],
      index: i,
      off,
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: ITEM_SIZE,
        marginLeft: -ITEM_SIZE / 2,
        marginTop: -ITEM_SIZE / 2 - 20,
        transform: `translateX(${x}px) translateZ(${-z}px) rotateY(${-rotateY}deg)`,
        zIndex,
        opacity: Math.abs(off) > 4 ? 0 : 1 - absClamped * 0.3,
        pointerEvents: Math.abs(off) < 2 ? "auto" : "none",
      },
    });
  }

  return (
    <section className="music-section" ref={sectionRef}>
      <div className="container">
        <h2 className="section-title music-title">Music</h2>
      </div>

      <div
        className="coverflow-stage"
        ref={wrapperRef}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={(e) => {
          handleNativeCenterTapRef.current?.(e.nativeEvent);
          onPointerUp();
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="coverflow-perspective">
          {visible.map(({ album, index, style }) => (
            <div
              key={index}
              className={`cf-item${index === activeIdx ? " cf-item--active" : ""}`}
              style={{
                ...style,
                cursor: isDragging
                  ? "grabbing"
                  : index === activeIdx
                    ? "pointer"
                    : "grab",
              }}
              data-album-index={String(index)}
              onClick={() => onItemClick(index)}
            >
              <div className="album-cover">
                <img
                  src={album.cover}
                  alt={`${album.title} by ${album.artist}`}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.target.style.display = "none"; }}
                  draggable={false}
                />
                <div className="album-cover-fallback" style={{ backgroundColor: album.dominantColor }} />
                {index === activeIdx && album.animatedCover ? (
                  <video
                    ref={activeAnimatedVideoRef}
                    className={`animated-cover-video${isPlaying ? " animated-cover-video--playing" : ""}`}
                    src={album.animatedCover}
                    poster={album.cover}
                    muted
                    playsInline
                    preload="metadata"
                    loop
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : null}
              </div>
              <div className="cf-label">
                <p className="album-title">{album.title}</p>
                <p className="album-artist">{album.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
