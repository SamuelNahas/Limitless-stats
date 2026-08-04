#!/usr/bin/env python3
"""Converte os CSVs legados em um snapshot JSON versionado para o app.

Uso:
    python3 scripts/build_snapshot_from_csv.py --input site --output apps/web/public/data/v1

O conversor permite desenvolver o frontend enquanto o coletor é modularizado.
Ele não inventa percentuais: sempre preserva W/L/T para que a política de
empates seja aplicada pela interface.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def integer(value: str | None) -> int:
    return int(float(value or 0))


def decimal(value: str | None) -> float:
    return float(value or 0)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.casefold()).strip("-")


def dump(path: Path, payload: object) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("site"))
    parser.add_argument("--output", type=Path, default=Path("apps/web/public/data/v1"))
    parser.add_argument(
        "--era-config",
        type=Path,
        default=Path("configs/eras/standard-pitch-black.json"),
        help="Configuração versionada da era/formato usada no manifest.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    era = json.loads(args.era_config.read_text(encoding="utf-8"))
    if not era.get("enabled"):
        raise SystemExit(f"Era desabilitada: {args.era_config}")
    source = args.input
    required = {
        "decks": source / "decks.csv",
        "matchups": source / "matchups.csv",
        "lists": source / "melhores_listas.csv",
        "tournaments": source / "torneios.csv",
    }
    decklists_path = source / "decklists.csv"
    missing = [str(path) for path in required.values() if not path.exists()]
    if missing:
        raise SystemExit("Arquivos ausentes: " + ", ".join(missing))

    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    raw_decks = read_csv(required["decks"])
    name_to_id = {row["deck"]: row["deck_id"] for row in raw_decks}
    decks = []
    for row in raw_decks:
        decks.append(
            {
                "id": row["deck_id"],
                "name": row["deck"],
                "entries": integer(row["jogadores"]),
                "metaShare": decimal(row["meta_share"]),
                "tournaments": integer(row["torneios"]),
                "titles": integer(row["titulos"]),
                "top8": integer(row["top8"]),
                "top8Rate": decimal(row["taxa_top8"]),
                "record": {
                    "wins": integer(row["vitorias"]),
                    "losses": integer(row["derrotas"]),
                    "ties": integer(row["empates"]),
                },
                "nonMirrorWinRate": decimal(row["win_rate_sem_espelhos"]),
                "modes": {
                    "bo1": {
                        "entries": integer(row["entradas_bo1"]),
                        "matches": integer(row["partidas_bo1_sem_espelhos"]),
                        "scoreRate": decimal(row["score_rate_bo1_sem_espelhos"]),
                    },
                    "bo3": {
                        "entries": integer(row["entradas_bo3"]),
                        "matches": integer(row["partidas_bo3_sem_espelhos"]),
                        "scoreRate": decimal(row["score_rate_bo3_sem_espelhos"]),
                    },
                },
            }
        )

    matchups: dict[str, list[dict]] = {"all": [], "bo1": [], "bo3": []}
    scope_map = {"GERAL": "all", "BO1": "bo1", "BO3": "bo3"}
    for row in read_csv(required["matchups"]):
        scope = scope_map.get(row["escopo"])
        if not scope:
            continue
        deck_id = name_to_id.get(row["deck"], slugify(row["deck"]))
        opponent_id = name_to_id.get(row["adversario"], slugify(row["adversario"]))
        matchups[scope].append(
            {
                "deckId": deck_id,
                "opponentId": opponent_id,
                "wins": integer(row["vitorias"]),
                "losses": integer(row["derrotas"]),
                "ties": integer(row["empates"]),
            }
        )

    lists: dict[str, list[dict]] = defaultdict(list)
    for row in read_csv(required["lists"]):
        deck_id = name_to_id.get(row["deck"], slugify(row["deck"]))
        lists[deck_id].append(
            {
                "rank": integer(row["posicao_no_deck"]),
                "player": row["jogador"],
                "placing": integer(row["colocacao"]),
                "record": row["record"],
                "tournament": row["torneio"],
                "tournamentPlayers": integer(row["jogadores_torneio"]),
                "playedAt": row["data"],
                "url": row["url_lista"],
            }
        )

    canonical_decklists: dict[str, dict] = {}
    if decklists_path.exists():
        best_url_to_deck = {
            items[0]["url"]: deck_id
            for deck_id, items in lists.items()
            if items and items[0].get("url")
        }
        with decklists_path.open(encoding="utf-8-sig", newline="") as file:
            for row in csv.DictReader(file):
                deck_id = best_url_to_deck.get(row["url_lista"])
                if not deck_id:
                    continue
                payload = canonical_decklists.setdefault(
                    deck_id,
                    {
                        "deckId": deck_id,
                        "player": row["jogador"],
                        "record": row["record"],
                        "url": row["url_lista"],
                        "cards": [],
                    },
                )
                payload["cards"].append(
                    {
                        "id": row["carta_id"],
                        "name": row["carta"],
                        "category": row["categoria"],
                        "count": integer(row["quantidade"]),
                    }
                )

    tournaments = []
    for row in read_csv(required["tournaments"]):
        tournaments.append(
            {
                "id": row["id"],
                "playedAt": row["date"],
                "name": row["name"],
                "organizer": row["organizer"],
                "players": integer(row["players"]),
                "format": row["format"],
                "platform": row["platform"],
                "modes": [value.strip() for value in row["modes"].split(",") if value.strip()],
                "url": row["url"],
            }
        )

    latest = max((item["playedAt"] for item in tournaments), default="")
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    total_matches = sum(item["wins"] + item["losses"] + item["ties"] for item in matchups["all"]) // 2
    manifest = {
        "schemaVersion": 1,
        "snapshotId": f"{era['id']}-{latest[:10] or 'unknown'}",
        "generatedAt": generated_at,
        "scope": {
            "gameId": era["gameId"],
            "platformId": era["platformId"],
            "formatId": era["formatId"],
            "formatName": era.get("formatName", era["formatId"].replace("-", " ").title()),
            "eraId": era["id"],
            "eraName": era.get("shortName", era["name"]),
            "dateFrom": era["startsAt"][:10],
            "dateTo": latest[:10] or None,
            "minimumPlayers": era["collection"]["minimumPlayers"],
        },
        "calculation": era["calculation"],
        "counts": {
            "tournaments": len(tournaments),
            "entries": sum(item["entries"] for item in decks),
            "matches": total_matches,
            "archetypes": len(decks),
        },
        "resources": {
            "decks": "decks.json",
            "matchupsAll": "matchups-all.json",
            "matchupsBo1": "matchups-bo1.json",
            "matchupsBo3": "matchups-bo3.json",
            "lists": "lists.json",
            "canonicalDecklists": "canonical-decklists.json",
            "tournaments": "tournaments.json",
        },
        "warnings": [],
    }

    dump(output / "manifest.json", manifest)
    dump(output / "decks.json", decks)
    dump(output / "matchups-all.json", matchups["all"])
    dump(output / "matchups-bo1.json", matchups["bo1"])
    dump(output / "matchups-bo3.json", matchups["bo3"])
    dump(output / "lists.json", lists)
    dump(output / "canonical-decklists.json", canonical_decklists)
    dump(output / "tournaments.json", tournaments)
    print(f"Snapshot JSON v1 criado em {output} ({len(decks)} decks, {len(tournaments)} torneios).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
