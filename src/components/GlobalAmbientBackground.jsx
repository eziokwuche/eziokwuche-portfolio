import { useState, useEffect, useRef, useMemo } from "react";
import { useMusicPlayback } from "@/context/MusicPlaybackContext";
import { resolvedMediaUrl } from "@/utils/resolvedMediaUrl";


const BYPASS_HERO_INTERSECTION = false;


const AMBIENT_OPACITY_MS = 800;


const HERO_HIDE_MS = 200;


const HERO_SHOW_MS = 1000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

export default function GlobalAmbientBackground() {
  const { currentAlbum, isPlaying, heroSectionElement } = useMusicPlayback();
  const [isHeroIntersecting, setIsHeroIntersecting] = useState(false);
  const [displayedCoverUrl, setDisplayedCoverUrl] = useState("");
  const [orbFadeOpacity, setOrbFadeOpacity] = useState(1);
  const prevCoverUrlRef = useRef(null);
  const ioRafRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!heroSectionElement) {
      setIsHeroIntersecting(false);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = entry.isIntersecting;
        if (ioRafRef.current != null) {
          cancelAnimationFrame(ioRafRef.current);
        }
        ioRafRef.current = requestAnimationFrame(() => {
          ioRafRef.current = null;
          setIsHeroIntersecting(next);
        });
      },
      {
        root: null,
        rootMargin: "100px 0px 0px 0px",
        threshold: [0],
      }
    );
    io.observe(heroSectionElement);
    return () => {
      if (ioRafRef.current != null) {
        cancelAnimationFrame(ioRafRef.current);
        ioRafRef.current = null;
      }
      io.disconnect();
    };
  }, [heroSectionElement]);

  useEffect(() => {
    if (!isPlaying) return;
    const url = currentAlbum?.cover
      ? resolvedMediaUrl(currentAlbum.cover)
      : "";
    setDisplayedCoverUrl(url);
  }, [isPlaying, currentAlbum]);

  useEffect(() => {
    if (isPlaying) return;
    const id = window.setTimeout(() => {
      setDisplayedCoverUrl(
        currentAlbum?.cover ? resolvedMediaUrl(currentAlbum.cover) : ""
      );
    }, AMBIENT_OPACITY_MS);
    return () => clearTimeout(id);
  }, [isPlaying, currentAlbum]);

  useEffect(() => {
    if (!displayedCoverUrl) {
      prevCoverUrlRef.current = null;
      setOrbFadeOpacity(1);
      return;
    }
    if (prefersReducedMotion) {
      prevCoverUrlRef.current = displayedCoverUrl;
      setOrbFadeOpacity(1);
      return;
    }
    const prev = prevCoverUrlRef.current;
    prevCoverUrlRef.current = displayedCoverUrl;
    if (prev == null || prev === displayedCoverUrl) {
      setOrbFadeOpacity(1);
      return;
    }
    setOrbFadeOpacity(0);
    const t = window.setTimeout(() => setOrbFadeOpacity(1), 24);
    return () => clearTimeout(t);
  }, [displayedCoverUrl, prefersReducedMotion]);

  const heroBlocksAmbient =
    !BYPASS_HERO_INTERSECTION && isHeroIntersecting;

  const layerOpacity =
    displayedCoverUrl && isPlaying && !heroBlocksAmbient ? 1 : 0;

  const { transitionMs, easing } = useMemo(() => {
    if (prefersReducedMotion) {
      return { transitionMs: 0, easing: "linear" };
    }
    if (heroBlocksAmbient) {
      return {
        transitionMs: HERO_HIDE_MS,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
      };
    }
    if (!isPlaying) {
      return {
        transitionMs: AMBIENT_OPACITY_MS,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    return {
      transitionMs: HERO_SHOW_MS,
      easing: "cubic-bezier(0, 0, 0.2, 1)",
    };
  }, [prefersReducedMotion, heroBlocksAmbient, isPlaying]);

  const ambientWrapperStyle = {
    opacity: layerOpacity,
    transition:
      transitionMs === 0
        ? "none"
        : `opacity ${transitionMs}ms ${easing}`,
  };

  const motionClass = prefersReducedMotion
    ? "global-ambient__orb global-ambient__orb--static global-ambient__blob"
    : "global-ambient__orb global-ambient__blob";

  const orbPlayStateStyle = prefersReducedMotion
    ? { opacity: orbFadeOpacity }
    : {
        animationPlayState: isPlaying ? "running" : "paused",
        opacity: orbFadeOpacity,
      };

  return (
    <div
      className="global-ambient"
      aria-hidden
      style={ambientWrapperStyle}
    >
      {displayedCoverUrl ? (
        <>
          <div className="global-ambient__blur-container">
            <img
              className={`${motionClass} global-ambient__orb--4`}
              src={displayedCoverUrl}
              alt=""
              draggable={false}
              decoding="async"
              style={orbPlayStateStyle}
            />
            <img
              className={`${motionClass} global-ambient__orb--3`}
              src={displayedCoverUrl}
              alt=""
              draggable={false}
              decoding="async"
              style={orbPlayStateStyle}
            />
            <img
              className={`${motionClass} global-ambient__orb--2`}
              src={displayedCoverUrl}
              alt=""
              draggable={false}
              decoding="async"
              style={orbPlayStateStyle}
            />
            <img
              className={`${motionClass} global-ambient__orb--1`}
              src={displayedCoverUrl}
              alt=""
              draggable={false}
              decoding="async"
              style={orbPlayStateStyle}
            />
          </div>
          <div className="global-ambient__scrim" />
        </>
      ) : null}
    </div>
  );
}
