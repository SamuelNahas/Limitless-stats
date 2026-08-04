import Image from "next/image";
import { getArchetypeVisual, pokemonArtworkUrl } from "@/lib/archetype-visuals";

export function PokemonArtwork({ deckId, name, priority = false, size = "card" }: { deckId: string; name: string; priority?: boolean; size?: "card" | "hero" | "mini" }) {
  const visual = getArchetypeVisual(deckId);
  const imageSize = size === "hero" ? 360 : 220;
  return (
    <div className={`pokemon-art pokemon-art-${size}`} style={{ "--deck-accent": visual.accent } as React.CSSProperties}>
      <span className="art-grid" aria-hidden="true" />
      {visual.pokemonIds.length > 0 && <span className="art-monogram" aria-hidden="true">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}
      {visual.pokemonIds.length ? visual.pokemonIds.slice(0, size === "mini" ? 1 : 2).map((pokemonId, index) => (
        <Image key={pokemonId} className={`pokemon-sprite sprite-${index + 1}`} src={pokemonArtworkUrl(pokemonId)}
          alt={index === 0 ? `Pokémon principal do deck ${name}` : ""} width={imageSize} height={imageSize}
          sizes={size === "hero" ? "(max-width: 700px) 55vw, 360px" : "220px"} priority={priority && index === 0} unoptimized />
      )) : <span className="art-fallback">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}
      <span className="art-scanline" aria-hidden="true" />
    </div>
  );
}
