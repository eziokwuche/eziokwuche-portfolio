import { useState, useRef, useEffect, useCallback } from "react";
import albums from "@/data/albums";
import { ExplicitIcon } from "@/components/icons/ExplicitIcon";
import { useMusicPlayback } from "@/context/MusicPlaybackContext";
import { resolvedMediaUrl } from "@/utils/resolvedMediaUrl";
import { MUSIC_CAROUSEL_AUDIO_ENGINE } from "@/audio/musicCarouselAudio";

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
/**
 * If coverflow scroll offset moved more than this during the gesture (album-index units), do not
 * treat as a play/pause tap.
 */
const TAP_MAX_SCROLL_OFFSET_DELTA = 0.02;
/** Fine pointer (mouse): max movement from down→up for a tap. */
const TAP_MAX_MOVE_FINE_PX = 18;
/**
 * Touch: horizontal movement beyond this is a carousel drag (coverflow only uses dx), not a tap.
 */
const TOUCH_TAP_MAX_H_PX = 16;
/**
 * Touch: vertical movement beyond this is usually page scroll; combined slop alone would still
 * allow play because scrollRef barely changes.
 */
const TOUCH_TAP_MAX_V_PX = 28;
/** Touch: max total wiggle from touch point for a tap (after axis checks). */
const TOUCH_TAP_MAX_COMBINED_PX = 40;

function tapMaxMovePx() {
  return TAP_MAX_MOVE_FINE_PX;
}

function parseAudioTracks(audioSrc) {
  if (audioSrc == null || audioSrc === "") return [];
  return audioSrc.split(";").map((s) => s.trim()).filter(Boolean);
}

/** Fisher–Yates shuffle of indices 0..n-1 */
function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function easeInOut(t) {
  return t < 0.5
    ? 0.5 * Math.pow(t * 2, 3)
    : 0.5 * Math.pow(t * 2 - 2, 3) + 1;
}

/** Skip carousel arrow keys when the user is typing or editing text. */
function isFocusInsideEditableField(activeEl) {
  if (activeEl == null || typeof activeEl.closest !== "function") return false;
  return Boolean(
    activeEl.closest("input, textarea, select, [contenteditable='true']")
  );
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
  const {
    currentAlbumIndex: activeIdx,
    setCurrentAlbumIndex: setActiveIdx,
    isPlaying,
    setIsPlaying,
  } = useMusicPlayback();
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
  const [, tick] = useState(0);
  const audioRef = useRef(MUSIC_CAROUSEL_AUDIO_ENGINE);
  const [currentTrackIdx, setCurrentTrackIdx] = useState(0);
  const currentTrackIdxRef = useRef(0);
  /** Permutation of track indices for the current “round”; each index appears once per round. */
  const shuffleOrderRef = useRef([]);
  /** Index into shuffleOrderRef (which track in the shuffled order is current). */
  const shufflePosRef = useRef(0);
  const handleTrackEndedRef = useRef(() => {});
  const activeIdxRef = useRef(0);
  const lastRenderedScrollRef = useRef(0);
  const onPointerDownRef = useRef(null);
  const onPointerMoveRef = useRef(null);
  const onPointerUpRef = useRef(null);
  const onItemClickRef = useRef(() => {});
  /** Arrow-key navigation: reset snippets to file order from index 0 (not random shuffle). */
  const keyboardCarouselNavRef = useRef(false);
  /** After keyboard move, auto-play new album if playback was on when the key was pressed. */
  const pendingKeyboardSmartPlayRef = useRef(false);
  const handleNativeCenterTapRef = useRef(null);
  /** Touchstart/mousedown target .cf-item — touchend target is unreliable on iOS Safari. */
  const touchedCfItemRef = useRef(null);
  /** Mounted for centered album w/ .mp4 so play() can run in the same touch gesture as audio. */
  const activeAnimatedVideoRef = useRef(null);
  const touchGestureRef = useRef({
    startX: 0,
    startY: 0,
    maxDist: 0,
    maxAbsDx: 0,
    maxAbsDy: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const sectionInViewRef = useRef(true);
  /** When false (user prefers reduced motion), animated .mp4 covers are not mounted or played. */
  const [allowAnimatedAlbumCovers, setAllowAnimatedAlbumCovers] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  });

  const wrap = count > 5;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowAnimatedAlbumCovers(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!allowAnimatedAlbumCovers) {
      activeAnimatedVideoRef.current?.pause?.();
    }
  }, [allowAnimatedAlbumCovers]);

  currentTrackIdxRef.current = currentTrackIdx;

  useEffect(() => {
    const audio = audioRef.current;
    const onEnded = () => {
      handleTrackEndedRef.current();
    };
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, []);

  /** Swipe / scroll to another album: stop playback immediately. */
  useEffect(() => {
    MUSIC_CAROUSEL_AUDIO_ENGINE.pause();
    setIsPlaying(false);
  }, [activeIdx]);

  useEffect(() => {
    const audio = audioRef.current;
    const tracks = parseAudioTracks(albums[activeIdx]?.audioSrc);
    if (tracks.length === 0) {
      shuffleOrderRef.current = [];
      shufflePosRef.current = 0;
      currentTrackIdxRef.current = 0;
      setCurrentTrackIdx(0);
      audio.removeAttribute("src");
      audio.load();
      keyboardCarouselNavRef.current = false;
      pendingKeyboardSmartPlayRef.current = false;
      return;
    }

    const fromKeyboard = keyboardCarouselNavRef.current;
    if (fromKeyboard) {
      keyboardCarouselNavRef.current = false;
      shuffleOrderRef.current = tracks.map((_, i) => i);
    } else {
      shuffleOrderRef.current = shuffleIndices(tracks.length);
    }
    shufflePosRef.current = 0;
    const firstIdx = shuffleOrderRef.current[0];
    currentTrackIdxRef.current = firstIdx;
    setCurrentTrackIdx(firstIdx);
    audio.src = tracks[firstIdx];
    audio.load();

    const shouldSmartPlay = pendingKeyboardSmartPlayRef.current;
    if (shouldSmartPlay) {
      pendingKeyboardSmartPlayRef.current = false;
      audio.volume = 1;
      setIsPlaying(true);
      const v = activeAnimatedVideoRef.current;
      if (v && albums[activeIdx]?.animatedCover) {
        v.muted = true;
        v.setAttribute("playsinline", "");
        v.setAttribute("webkit-playsinline", "");
        const vp = v.play();
        if (vp !== undefined) void vp.catch(() => {});
      }
      const p = audio.play();
      if (p !== undefined) {
        void p.catch(() => {
          setIsPlaying(false);
          activeAnimatedVideoRef.current?.pause?.();
        });
      }
    }
  }, [activeIdx, setIsPlaying]);

  /**
   * Advance to the next track in the shuffled order (skip or natural end).
   * Returns null once every track has played — playlist stops until the user starts again (new shuffle on album change).
   */
  function advanceToNextInShuffleOrder(tracks) {
    const n = tracks.length;
    if (n === 0) return null;
    const order = shuffleOrderRef.current;
    if (order.length !== n) {
      shuffleOrderRef.current = shuffleIndices(n);
      shufflePosRef.current = -1;
    }
    const len = shuffleOrderRef.current.length;
    let pos = shufflePosRef.current + 1;
    if (pos >= len) {
      return null;
    }
    shufflePosRef.current = pos;
    return shuffleOrderRef.current[pos];
  }

  handleTrackEndedRef.current = () => {
    const audio = audioRef.current;
    const idx = activeIdxRef.current;
    const tracks = parseAudioTracks(albums[idx]?.audioSrc);
    if (tracks.length === 0) {
      setIsPlaying(false);
      activeAnimatedVideoRef.current?.pause?.();
      return;
    }
    const nextIdx = advanceToNextInShuffleOrder(tracks);
    if (nextIdx == null) {
      setIsPlaying(false);
      activeAnimatedVideoRef.current?.pause?.();
      return;
    }
    currentTrackIdxRef.current = nextIdx;
    setCurrentTrackIdx(nextIdx);
    try {
      const resolved = new URL(tracks[nextIdx], window.location.href).href;
      if (audio.src !== resolved) audio.src = tracks[nextIdx];
    } catch {
      audio.src = tracks[nextIdx];
    }
    audio.load();
    audio.volume = 1;
    setIsPlaying(true);
    const v = activeAnimatedVideoRef.current;
    if (v && albums[idx]?.animatedCover) {
      v.muted = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      const vp = v.play();
      if (vp !== undefined) void vp.catch(() => {});
    }
    const p = audio.play();
    if (p !== undefined) {
      void p.catch(() => {
        setIsPlaying(false);
        activeAnimatedVideoRef.current?.pause?.();
      });
    }
  };

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
    const sectionEl = sectionRef.current;
    const inViewRef = sectionInViewRef;
    inViewRef.current = true;

    const io =
      sectionEl &&
      new IntersectionObserver(
        ([e]) => {
          inViewRef.current = e.isIntersecting;
          if (!e.isIntersecting) {
            MUSIC_CAROUSEL_AUDIO_ENGINE.pause();
            setIsPlaying(false);
            activeAnimatedVideoRef.current?.pause?.();
          }
          if (e.isIntersecting && rafRef.current == null) {
            lastTimeRef.current = 0;
            rafRef.current = requestAnimationFrame(loop);
          }
        },
        { rootMargin: "100px", threshold: 0 }
      );
    if (sectionEl) io.observe(sectionEl);

    function loop(now) {
      const busy =
        dragRef.current.down ||
        snapRef.current != null ||
        Math.abs(velocityRef.current) > 0.01;
      if (!inViewRef.current && !busy) {
        rafRef.current = null;
        lastTimeRef.current = 0;
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
      if (!lastTimeRef.current) {
        lastTimeRef.current = now;
        return;
      }
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
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }

      let needsTick = false;
      if (closest !== activeIdxRef.current) {
        activeIdxRef.current = closest;
        /* Same tick as album index: pause + isPlaying false before paint, so GlobalAmbient
         never binds the new cover while still "playing" (avoids wrong art during fade). */
        MUSIC_CAROUSEL_AUDIO_ENGINE.pause();
        setIsPlaying(false);
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
    return () => {
      io?.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [count, wrap, snapToNearest]);

  function onPointerDown(e) {
    const isTouch =
      e.type === "touchstart" || e.pointerType === "touch";
    if (!isTouch) {
      e.preventDefault();
    }
    touchedCfItemRef.current = e.target?.closest?.(".cf-item") ?? null;
    const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    touchGestureRef.current = { startX: x, startY: y, maxDist: 0, maxAbsDx: 0, maxAbsDy: 0 };
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
    g.maxAbsDx = Math.max(g.maxAbsDx, Math.abs(x - g.startX));
    g.maxAbsDy = Math.max(g.maxAbsDy, Math.abs(y - g.startY));
    const isTouchMove =
      e.type === "touchmove" || e.pointerType === "touch";
    if (
      isTouchMove &&
      g.maxAbsDx > g.maxAbsDy + 6
    ) {
      e.preventDefault();
    }
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
    if (i === activeIdx) {
      // If the user clicks the currently active album, trigger the play/pause logic
      handleNativeCenterTapRef.current?.();
      return;
    }

    autoRef.current = false;
    velocityRef.current = 0;
    if (snapRef.current) { 
      cancelAnimationFrame(snapRef.current); 
      snapRef.current = null; 
    }

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

  onItemClickRef.current = onItemClick;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.defaultPrevented) return;
      if (count < 1) return;
      if (isFocusInsideEditableField(document.activeElement)) return;

      if (e.code === "Space" || e.key === " ") {
        if (!sectionInViewRef.current) return;
        const idx = activeIdxRef.current;
        const tracks = parseAudioTracks(albums[idx]?.audioSrc);
        if (tracks.length === 0) return;
        e.preventDefault();
        const audio = MUSIC_CAROUSEL_AUDIO_ENGINE;
        if (audio.paused) {
          const v = activeAnimatedVideoRef.current;
          if (v && albums[idx]?.animatedCover) {
            v.muted = true;
            v.setAttribute("playsinline", "");
            v.setAttribute("webkit-playsinline", "");
            const vp = v.play();
            if (vp !== undefined) void vp.catch(() => {});
          }
          audio.volume = 1;
          setIsPlaying(true);
          const p = audio.play();
          if (p !== undefined) {
            void p.catch(() => {
              setIsPlaying(false);
              activeAnimatedVideoRef.current?.pause?.();
            });
          }
        } else {
          audio.pause();
          setIsPlaying(false);
          activeAnimatedVideoRef.current?.pause?.();
        }
        return;
      }

      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const idx = activeIdxRef.current;
      const nextIndex =
        e.key === "ArrowRight"
          ? wrap
            ? (idx + 1) % count
            : Math.min(idx + 1, count - 1)
          : wrap
            ? (idx - 1 + count) % count
            : Math.max(idx - 1, 0);

      if (nextIndex === idx) return;
      e.preventDefault();
      keyboardCarouselNavRef.current = true;
      if (isPlaying) {
        pendingKeyboardSmartPlayRef.current = true;
      }
      onItemClickRef.current(nextIndex);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, wrap, isPlaying, setIsPlaying]);

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
    const g = touchGestureRef.current;
    const isTouchEnd = e?.type === "touchend";
    if (isTouchEnd) {
      if (g.maxAbsDx > TOUCH_TAP_MAX_H_PX || g.maxAbsDy > TOUCH_TAP_MAX_V_PX) {
        touchedCfItemRef.current = null;
        return;
      }
      if (g.maxDist > TOUCH_TAP_MAX_COMBINED_PX) {
        touchedCfItemRef.current = null;
        return;
      }
    } else if (g.maxDist >= tapMaxMovePx()) {
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

    if (
      Math.abs(scrollRef.current - dragRef.current.startOffset) > TAP_MAX_SCROLL_OFFSET_DELTA
    ) return;

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
      touchGestureRef.current.maxDist = TOUCH_TAP_MAX_COMBINED_PX + 1;
      return;
    }
    const tracks = parseAudioTracks(rawSrc);
    if (tracks.length === 0) {
      touchGestureRef.current.maxDist = TOUCH_TAP_MAX_COMBINED_PX + 1;
      return;
    }

    const audio = MUSIC_CAROUSEL_AUDIO_ENGINE;

    /** Resume: do not touch .src (preserves playhead). */
    function resumeWithoutChangingSrc() {
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

    const shouldPlay = audio.paused;

    // Reset BEFORE async work to prevent double-firing
    touchGestureRef.current.maxDist = TOUCH_TAP_MAX_COMBINED_PX + 1;

    if (shouldPlay) {
      tryPlayAnimatedVideo();
      audio.volume = 1;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.warn("Audio play blocked:", error);
            setIsPlaying(false);
            activeAnimatedVideoRef.current?.pause?.();
          });
      } else {
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(false);
      audio.pause();
      activeAnimatedVideoRef.current?.pause?.();
    }
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
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

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
    <section
      className="music-section"
      ref={sectionRef}
      aria-label="Music. Arrow keys change albums. Space plays or pauses the centered album while this section is on screen."
    >
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
          {visible.map(({ album, index, off, style }) => (
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
                  src={resolvedMediaUrl(album.cover)}
                  alt={`${album.title} by ${album.artist}`}
                  loading={Math.abs(off) <= 2 ? "eager" : "lazy"}
                  decoding="async"
                  fetchPriority={index === activeIdx ? "high" : "low"}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.style.display = "none";
                  }}
                  draggable={false}
                />
                <div
                  className="album-cover-fallback"
                  style={{ backgroundColor: album.dominantColor ?? "#2a2a2a" }}
                />
                {index === activeIdx && album.animatedCover && allowAnimatedAlbumCovers ? (
                  <video
                    key={resolvedMediaUrl(album.animatedCover)}
                    ref={activeAnimatedVideoRef}
                    className={`animated-cover-video${isPlaying ? " animated-cover-video--playing" : ""}`}
                    src={resolvedMediaUrl(album.animatedCover)}
                    poster={resolvedMediaUrl(album.cover)}
                    muted
                    playsInline
                    preload="auto"
                    loop
                    disablePictureInPicture
                    controls={false}
                    controlsList="nodownload nofullscreen noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                    onError={() => {
                      activeAnimatedVideoRef.current?.pause?.();
                    }}
                  />
                ) : null}
              </div>
              <div className="cf-label">
                <p className="album-title">
                  <span className="album-title__text">{album.title}</span>
                  {album.isExplicit ? (
                    <span
                      className="music-explicit-badge"
                      aria-label="Explicit"
                      title="Explicit"
                    >
                      <ExplicitIcon className="music-explicit-icon" />
                    </span>
                  ) : null}
                </p>
                <p className="album-artist">{album.artist}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
