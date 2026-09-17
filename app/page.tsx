"use client";
import { useEffect, useState } from "react";
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
          title="Delta Triplex puzzle and level editor"
          allow="fullscreen; clipboard-write"
          allowFullScreen
        />
      )}
    </main>
  );
}
