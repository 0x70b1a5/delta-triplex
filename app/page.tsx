"use client";
import { useEffect, useState } from "react";
import copy from "../game-source/locales/en.json";
export default function Home() {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setSource("/game.html" + window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <main>
      {source && (
        <iframe
          src={source}
          title={copy["site.frameTitle"]}
          allow="fullscreen; clipboard-write; web-share"
          allowFullScreen
        />
      )}
    </main>
  );
}
