import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import albums from "@/data/albums";
import { normalizeAlbum } from "@/utils/normalizeAlbum";

export const MusicPlaybackContext = createContext(null);

export function MusicPlaybackProvider({ children }) {
  const [currentAlbumIndex, setCurrentAlbumIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [heroSectionElement, setHeroSectionElement] = useState(null);
  const [pendingPlayTrack, setPendingPlayTrack] = useState(false);

  const registerHeroSection = useCallback((el) => {
    setHeroSectionElement(el);
  }, []);

  const currentTrack = useMemo(
    () => normalizeAlbum(albums[currentAlbumIndex], currentAlbumIndex),
    [currentAlbumIndex]
  );

  const playTrack = useCallback((album) => {
    if (!album?.id) return;
    const idx = albums.findIndex(
      (a, i) => normalizeAlbum(a, i).id === album.id
    );
    if (idx === -1) return;
    setCurrentAlbumIndex(idx);
    setPendingPlayTrack(true);
  }, []);

  const clearPendingPlayTrack = useCallback(() => {
    setPendingPlayTrack(false);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const value = useMemo(
    () => ({
      currentAlbumIndex,
      setCurrentAlbumIndex,
      currentAlbum: albums[currentAlbumIndex] ?? null,
      currentTrack,
      isPlaying,
      setIsPlaying,
      playTrack,
      togglePlay,
      pendingPlayTrack,
      clearPendingPlayTrack,
      registerHeroSection,
      heroSectionElement,
    }),
    [
      currentAlbumIndex,
      currentTrack,
      isPlaying,
      playTrack,
      togglePlay,
      pendingPlayTrack,
      clearPendingPlayTrack,
      registerHeroSection,
      heroSectionElement,
    ]
  );

  return (
    <MusicPlaybackContext.Provider value={value}>
      {children}
    </MusicPlaybackContext.Provider>
  );
}

export function useMusicPlayback() {
  const ctx = useContext(MusicPlaybackContext);
  if (!ctx) {
    throw new Error("useMusicPlayback must be used within MusicPlaybackProvider");
  }
  return ctx;
}
