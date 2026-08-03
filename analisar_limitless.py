#!/usr/bin/env python3
"""
Analisador direto ao ponto do metagame online do Limitless TCG.

Execucao padrao (Pokemon TCG Standard, ultimas 4 semanas, torneios encerrados,
online e com mais de 20 jogadores):

    python analisar_limitless.py

O script usa somente a biblioteca padrao do Python e gera um relatorio HTML,
alem de CSVs de decks, matchups, listas, torneios e ranking MD1.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path


BASE_URL = "https://play.limitlesstcg.com"
USER_AGENT = "LimitlessMetaAnalyzer/1.0 (personal statistics script)"


def log(message: str) -> None:
    print(message, flush=True)


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def safe_float_pct(value: float | None) -> str:
    return "-" if value is None else f"{value * 100:.2f}%"


def record_total(record: dict) -> int:
    return record["wins"] + record["losses"] + record["ties"]


def record_win_rate(record: dict) -> float | None:
    total = record_total(record)
    return record["wins"] / total if total else None


def record_score_rate(record: dict) -> float | None:
    total = record_total(record)
    return (record["wins"] + 0.5 * record["ties"]) / total if total else None


def empty_record() -> dict:
    return {"wins": 0, "losses": 0, "ties": 0}


def merge_record(target: dict, source: dict) -> None:
    for key in ("wins", "losses", "ties"):
        target[key] += int(source.get(key, 0))


class ApiRateGate:
    """Limite conservador da API publica: 45 chamadas por janela de 5 min."""

    def __init__(self, has_key: bool):
        self.limit = 450 if has_key else 45
        self.window = 300.0
        self.calls: deque[float] = deque()
        self.condition = threading.Condition()
        self.last_notice = 0.0

    def acquire(self) -> None:
        while True:
            with self.condition:
                now = time.monotonic()
                while self.calls and now - self.calls[0] >= self.window:
                    self.calls.popleft()
                if len(self.calls) < self.limit:
                    self.calls.append(now)
                    return
                wait_for = max(1.0, self.window - (now - self.calls[0]) + 1.0)
                if now - self.last_notice > 20:
                    log(
                        f"  Limite publico do Limitless atingido. "
                        f"Aguardando aproximadamente {math.ceil(wait_for / 60)} min..."
                    )
                    self.last_notice = now
                self.condition.wait(timeout=min(wait_for, 20.0))


def request_bytes(url: str, headers: dict | None = None, retries: int = 5) -> tuple[bytes, object]:
    request_headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    if headers:
        request_headers.update(headers)

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=request_headers)
            with urllib.request.urlopen(req, timeout=45) as response:
                return response.read(), response.headers
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After")
                wait_for = int(retry_after) if retry_after and retry_after.isdigit() else 60 * (attempt + 1)
                log(f"  HTTP 429. Aguardando {wait_for}s antes de tentar novamente...")
                time.sleep(wait_for)
                continue
            if 500 <= exc.code < 600 and attempt + 1 < retries:
                time.sleep(2 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 == retries:
                raise RuntimeError(f"Falha ao acessar {url}: {exc}") from exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Falha ao acessar {url}")


class Cache:
    def __init__(self, directory: Path, disabled: bool = False):
        self.directory = directory
        self.disabled = disabled
        self.lock = threading.Lock()
        directory.mkdir(parents=True, exist_ok=True)

    def path(self, key: str, extension: str) -> Path:
        clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", key)
        return self.directory / f"{clean}.{extension}"

    def get_text(self, key: str, url: str, max_age_hours: int | None = None) -> str:
        path = self.path(key, "html")
        if not self.disabled and path.exists():
            fresh = max_age_hours is None or time.time() - path.stat().st_mtime <= max_age_hours * 3600
            if fresh:
                return path.read_text(encoding="utf-8")
        body, _ = request_bytes(url)
        text = body.decode("utf-8", errors="replace")
        if not self.disabled:
            with self.lock:
                path.write_text(text, encoding="utf-8")
        return text

    def get_json(self, key: str, url: str, gate: ApiRateGate, api_key: str | None) -> object:
        path = self.path(key, "json")
        if not self.disabled and path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        gate.acquire()
        headers = {"X-Access-Key": api_key} if api_key else None
        body, _ = request_bytes(url, headers=headers)
        data = json.loads(body.decode("utf-8"))
        if not self.disabled:
            with self.lock:
                path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data


TOURNAMENT_ROW_RE = re.compile(
    r'<tr data-date="(?P<date>[^"]+)" data-name="(?P<name>[^"]*)" '
    r'data-organizer="(?P<organizer>[^"]*)" data-format="(?P<format_id>[^"]*)" '
    r'data-players="(?P<players>\d+)"[^>]*>(?P<body>.*?)</tr>',
    re.S,
)


def parse_tournament_page(page_html: str) -> tuple[list[dict], int]:
    tournaments = []
    unidentified_rows = 0
    for match in TOURNAMENT_ROW_RE.finditer(page_html):
        body = match.group("body")
        # IDs do Limitless podem ser hashes ou slugs personalizados, como
        # "ban-pult". Capturamos qualquer segmento válido da URL do torneio.
        id_match = re.search(r'/tournament/([^/"?#]+)(?:/|["?#])', body)
        format_match = re.search(r'class="format"[^>]+data-tooltip="([^"]+)"', body)
        if not id_match:
            unidentified_rows += 1
            continue
        tournaments.append(
            {
                "id": id_match.group(1),
                "date": match.group("date"),
                "name": html.unescape(match.group("name")),
                "organizer": html.unescape(match.group("organizer")),
                "players": int(match.group("players")),
                "format": html.unescape(format_match.group(1)) if format_match else match.group("format_id"),
            }
        )
    if unidentified_rows:
        log(
            f"Aviso: {unidentified_rows} torneio(s) da listagem não tinham uma URL reconhecível."
        )
    max_page_match = re.search(r'class="pagination" data-current="\d+" data-max="(\d+)"', page_html)
    max_page = int(max_page_match.group(1)) if max_page_match else 1
    return tournaments, max_page


def fetch_tournaments(args, cache: Cache) -> list[dict]:
    cutoff = args.data_inicial or (
        datetime.now(timezone.utc) - timedelta(days=args.dias)
    )
    time_filter = "all" if args.data_inicial else "4weeks"
    query = {
        "game": "PTCG",
        "type": "online",
        "time": time_filter,
        "show": "100",
        "page": "1",
    }
    if args.formato.upper() != "TODOS":
        query["format"] = args.formato.upper()

    def page_url(page: int) -> str:
        query["page"] = str(page)
        return f"{BASE_URL}/tournaments/completed?{urllib.parse.urlencode(query)}"

    cache_tag = f"{args.formato}_{time_filter}"
    first = cache.get_text(
        f"completed_page_1_{cache_tag}", page_url(1), max_age_hours=1
    )
    tournaments, max_page = parse_tournament_page(first)
    for page in range(2, max_page + 1):
        page_html = cache.get_text(
            f"completed_page_{page}_{cache_tag}", page_url(page), max_age_hours=1
        )
        parsed, _ = parse_tournament_page(page_html)
        tournaments.extend(parsed)

        # A listagem com time=all vem da mais nova para a mais antiga. Assim que
        # uma página inteira estiver antes do corte, não há motivo para baixar o
        # restante do histórico.
        if args.data_inicial and parsed and max(
            parse_iso(tournament["date"]) for tournament in parsed
        ) < cutoff:
            break

    result = [
        t
        for t in tournaments
        if t["players"] >= args.min_jogadores and parse_iso(t["date"]) >= cutoff
    ]
    seen = set()
    unique = []
    for tournament in sorted(result, key=lambda item: item["date"], reverse=True):
        if tournament["id"] not in seen:
            unique.append(tournament)
            seen.add(tournament["id"])
    if args.max_torneios:
        unique = unique[: args.max_torneios]
    return unique

def parse_standings(page_html: str, tournament: dict) -> list[dict]:
    entries = []
    # O Limitless remove data-placing de quem abandonou o torneio. Esses
    # jogadores ainda contam para meta share e matchups, portanto entram aqui.
    row_re = re.compile(r'<tr(?P<attrs>[^>]*)>(?P<body>.*?)</tr>', re.S)
    for match in row_re.finditer(page_html):
        attrs, body = match.group("attrs"), match.group("body")
        player_match = re.search(rf'/tournament/{re.escape(tournament["id"])}/player/([^"/]+)', body)
        if not player_match:
            continue
        player_id = html.unescape(player_match.group(1))
        name_match = re.search(r'data-name="([^"]*)"', attrs)
        country_match = re.search(r'data-country="([^"]*)"', attrs)
        placing_match = re.search(r'data-placing="(\d+)"', attrs)
        record_match = re.search(r'>(\d+)\s*-\s*(\d+)\s*-\s*(\d+)<', body)
        deck_match = re.search(r'/metagame/([^"?]+)"><span data-tooltip="([^"]+)"', body)
        list_match = re.search(r'href="([^"]+/decklist)"', body)
        if deck_match:
            deck_id = html.unescape(deck_match.group(1))
            deck_name = html.unescape(deck_match.group(2))
        else:
            deck_id, deck_name = "sem-classificacao", "Sem classificação"
        record = {
            "wins": int(record_match.group(1)) if record_match else 0,
            "losses": int(record_match.group(2)) if record_match else 0,
            "ties": int(record_match.group(3)) if record_match else 0,
        }
        entries.append(
            {
                "tournament_id": tournament["id"],
                "tournament_name": tournament["name"],
                "tournament_date": tournament["date"],
                "tournament_players": tournament["players"],
                "player": player_id,
                "name": html.unescape(name_match.group(1)) if name_match else player_id,
                "country": html.unescape(country_match.group(1)) if country_match else "",
                "placing": int(placing_match.group(1)) if placing_match else None,
                "record": record,
                "deck_id": deck_id,
                "deck_name": deck_name,
                "decklist_url": BASE_URL + html.unescape(list_match.group(1)) if list_match else "",
            }
        )
    return entries


def normalize_card_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


def normalized_card(category: str, card: dict) -> tuple[str, str]:
    """Une reprints funcionais de Trainer/Energy e preserva Pokemon exatos."""
    name = re.sub(r"\s+", " ", str(card.get("name", "")).strip())
    set_code = str(card.get("set", "")).upper().strip()
    number = str(card.get("number", "")).upper().strip()
    if category == "pokemon":
        key = f"pokemon|{normalize_card_name(name)}|{set_code}|{number}"
        display = f"{name} [{set_code} {number}]" if set_code else name
    else:
        key = f"{category}|{normalize_card_name(name)}"
        display = name
    return key, display


def normalize_decklist(decklist: object) -> tuple[dict, dict, int]:
    vector = {}
    catalog = {}
    total = 0
    if not isinstance(decklist, dict):
        return vector, catalog, total
    for category in ("pokemon", "trainer", "energy"):
        cards = decklist.get(category, [])
        if not isinstance(cards, list):
            continue
        for card in cards:
            if not isinstance(card, dict):
                continue
            count = int(card.get("count", 0) or 0)
            if count <= 0:
                continue
            key, display = normalized_card(category, card)
            vector[key] = vector.get(key, 0) + count
            catalog[key] = {"display": display, "category": category}
            total += count
    return vector, catalog, total


def vector_signature(vector: dict) -> tuple:
    return tuple(sorted((key, int(count)) for key, count in vector.items() if count))


def vector_distance(left: dict, right: dict) -> float:
    keys = set(left) | set(right)
    return sum(abs(int(left.get(key, 0)) - int(right.get(key, 0))) for key in keys) / 2.0


def vector_changes(source: dict, target: dict, catalog: dict) -> dict:
    removed, added = [], []
    for key in sorted(set(source) | set(target)):
        delta = int(target.get(key, 0)) - int(source.get(key, 0))
        display = catalog.get(key, {}).get("display", key.split("|", 1)[-1])
        if delta > 0:
            added.append({"key": key, "count": delta, "display": display})
        elif delta < 0:
            removed.append({"key": key, "count": -delta, "display": display})
    return {"removed": removed, "added": added, "distance": vector_distance(source, target)}


def parse_api_standings(items: object, tournament: dict) -> tuple[list[dict], dict]:
    entries = []
    catalog = {}
    if not isinstance(items, list):
        return entries, catalog
    for item in items:
        if not isinstance(item, dict) or item.get("player") is None:
            continue
        deck = item.get("deck") or {"id": "sem-classificacao", "name": "Sem classificação"}
        vector, local_catalog, total = normalize_decklist(item.get("decklist"))
        catalog.update(local_catalog)
        player = str(item["player"])
        record = item.get("record") or {}
        entries.append(
            {
                "tournament_id": tournament["id"],
                "tournament_name": tournament["name"],
                "tournament_date": tournament["date"],
                "tournament_players": tournament["players"],
                "player": player,
                "name": item.get("name") or player,
                "country": item.get("country") or "",
                "placing": item.get("placing"),
                "record": {
                    "wins": int(record.get("wins", 0) or 0),
                    "losses": int(record.get("losses", 0) or 0),
                    "ties": int(record.get("ties", 0) or 0),
                },
                "drop": item.get("drop"),
                "deck_id": str(deck.get("id") or "sem-classificacao"),
                "deck_name": str(deck.get("name") or "Sem classificação"),
                "decklist_url": f"{BASE_URL}/tournament/{tournament['id']}/player/{urllib.parse.quote(player)}/decklist",
                "decklist_vector": vector,
                "decklist_signature": vector_signature(vector),
                "decklist_total": total,
            }
        )
    return entries, catalog


def parse_text_decklist(path: Path) -> tuple[dict, dict, int]:
    text = path.read_text(encoding="utf-8-sig")
    vector, catalog = {}, {}
    category = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        folded = line.casefold()
        if not line:
            continue
        if folded.startswith(("pokémon:", "pokemon:")):
            category = "pokemon"
            continue
        if folded.startswith(("treinador:", "trainer:")):
            category = "trainer"
            continue
        if folded.startswith(("energia:", "energy:")):
            category = "energy"
            continue
        if folded.startswith(("total", "cartas totais", "total cards")) or category is None:
            continue
        match = re.match(r"^(\d+)\s+(.+)$", line)
        if not match:
            continue
        count, remainder = int(match.group(1)), match.group(2).strip()
        set_code = number = ""
        card_name = remainder
        print_match = re.match(r"^(.+?)\s+([A-Z][A-Z0-9-]{1,9})\s+([A-Z0-9-]+)$", remainder)
        if print_match:
            card_name, set_code, number = print_match.groups()
        key, display = normalized_card(
            category,
            {"name": card_name, "set": set_code, "number": number},
        )
        vector[key] = vector.get(key, 0) + count
        catalog[key] = {"display": display, "category": category}
    return vector, catalog, sum(vector.values())


def parse_details(page_html: str) -> dict:
    rounds_text = re.findall(r'<div class="rounds">(.*?)</div>', page_html, flags=re.S)
    phase_modes = {}
    phase_rounds = {}
    for index, raw in enumerate(rounds_text, start=1):
        text = html.unescape(re.sub(r"<[^>]+>", "", raw)).strip()
        mode_match = re.search(r"\b(BO[135])\b", text, flags=re.I)
        rounds_match = re.search(r"(\d+)\s+.*?Rounds?", text, flags=re.I)
        if mode_match:
            phase_modes[index] = mode_match.group(1).upper()
        if rounds_match:
            phase_rounds[index] = int(rounds_match.group(1))
    platform_match = re.search(r'class="platform"[^>]+data-tooltip="([^"]+)"', page_html)
    return {
        "phase_modes": phase_modes,
        "phase_rounds": phase_rounds,
        "platform": html.unescape(platform_match.group(1)) if platform_match else "Online",
    }


def load_tournament_html(tournament: dict, cache: Cache) -> dict:
    tournament_id = tournament["id"]
    standings_html = cache.get_text(
        f"standings_{tournament_id}", f"{BASE_URL}/tournament/{tournament_id}/standings"
    )
    details_html = cache.get_text(
        f"details_{tournament_id}", f"{BASE_URL}/tournament/{tournament_id}/details"
    )
    result = dict(tournament)
    result.update(parse_details(details_html))
    result["entries"] = parse_standings(standings_html, tournament)
    return result


def load_tournament_details(tournament: dict, cache: Cache) -> dict:
    tournament_id = tournament["id"]
    details_html = cache.get_text(
        f"details_{tournament_id}", f"{BASE_URL}/tournament/{tournament_id}/details"
    )
    result = dict(tournament)
    result.update(parse_details(details_html))
    return result


def load_pairings(tournament: dict, cache: Cache, gate: ApiRateGate, api_key: str | None) -> list[dict]:
    tournament_id = tournament["id"]
    data = cache.get_json(
        f"pairings_{tournament_id}",
        f"{BASE_URL}/api/tournaments/{tournament_id}/pairings",
        gate,
        api_key,
    )
    return data if isinstance(data, list) else []


def load_api_tournament(
    tournament: dict, cache: Cache, gate: ApiRateGate, api_key: str | None
) -> tuple[list[dict], list[dict], dict]:
    tournament_id = tournament["id"]
    standings = cache.get_json(
        f"standings_api_{tournament_id}",
        f"{BASE_URL}/api/tournaments/{tournament_id}/standings",
        gate,
        api_key,
    )
    pairings = load_pairings(tournament, cache, gate, api_key)
    entries, catalog = parse_api_standings(standings, tournament)
    return entries, pairings, catalog


def add_match_record(store: dict, deck: str, opponent: str, result: str) -> None:
    store[deck][opponent][result] += 1


def process_data(tournaments: list[dict]) -> dict:
    deck_names = {}
    card_catalog = {}
    entries_by_deck = defaultdict(list)
    tournament_entries = {}
    tournament_by_id = {t["id"]: t for t in tournaments}

    for tournament in tournaments:
        card_catalog.update(tournament.get("card_catalog", {}))
        player_map = {}
        for entry in tournament["entries"]:
            deck_names[entry["deck_id"]] = entry["deck_name"]
            entries_by_deck[entry["deck_id"]].append(entry)
            player_map[str(entry["player"])] = entry
        tournament_entries[tournament["id"]] = player_map

    modes = ("ALL", "BO1", "BO3")
    matchups = {mode: defaultdict(lambda: defaultdict(empty_record)) for mode in modes}
    entry_matchups = {
        mode: defaultdict(lambda: defaultdict(empty_record)) for mode in modes
    }
    skipped_matches = 0
    valid_matches = {mode: 0 for mode in modes}

    def add_direction(mode: str, entry: dict, opponent: str, result: str) -> None:
        deck = entry["deck_id"]
        add_match_record(matchups[mode], deck, opponent, result)
        entry_key = (entry["tournament_id"], str(entry["player"]))
        entry_matchups[mode][entry_key][opponent][result] += 1

    for tournament in tournaments:
        player_map = tournament_entries[tournament["id"]]
        phase_modes = tournament.get("phase_modes", {})
        for pairing in tournament.get("pairings", []):
            p1 = pairing.get("player1")
            p2 = pairing.get("player2")
            winner = str(pairing.get("winner"))
            if p1 is None or p2 in (None, "") or str(p1) not in player_map or str(p2) not in player_map:
                skipped_matches += 1
                continue
            if winner in ("-1", "None"):
                skipped_matches += 1
                continue
            e1, e2 = player_map[str(p1)], player_map[str(p2)]
            d1, d2 = e1["deck_id"], e2["deck_id"]
            phase = int(pairing.get("phase", 1) or 1)
            phase_mode = phase_modes.get(phase)
            active_modes = ["ALL"]
            if phase_mode in ("BO1", "BO3"):
                active_modes.append(phase_mode)
            for mode in active_modes:
                valid_matches[mode] += 1
                if winner == "0":
                    add_direction(mode, e1, d2, "ties")
                    add_direction(mode, e2, d1, "ties")
                elif winner == str(p1):
                    add_direction(mode, e1, d2, "wins")
                    add_direction(mode, e2, d1, "losses")
                elif winner == str(p2):
                    add_direction(mode, e1, d2, "losses")
                    add_direction(mode, e2, d1, "wins")
                else:
                    skipped_matches += 1

    total_entries = sum(len(items) for items in entries_by_deck.values())
    mode_tournament_ids = {
        mode: {
            t["id"]
            for t in tournaments
            if any(value == mode for value in t.get("phase_modes", {}).values())
        }
        for mode in ("BO1", "BO3")
    }
    mode_active_entries = {
        mode: set(entry_matchups[mode].keys()) for mode in ("BO1", "BO3")
    }
    mode_entry_counts = {
        mode: {
            deck: sum(
                1
                for entry in entries
                if (entry["tournament_id"], str(entry["player"])) in mode_active_entries[mode]
            )
            for deck, entries in entries_by_deck.items()
        }
        for mode in ("BO1", "BO3")
    }

    profile_groups = defaultdict(lambda: defaultdict(list))
    for deck_id, entries in entries_by_deck.items():
        for entry in entries:
            signature = entry.get("decklist_signature")
            if signature:
                profile_groups[deck_id][signature].append(entry)

    deck_stats = []
    deck_records = {mode: {} for mode in modes}
    nonmirror_records = {mode: {} for mode in modes}
    for deck_id, entries in entries_by_deck.items():
        records_for_deck = {}
        nonmirror_for_deck = {}
        for mode in modes:
            all_record = empty_record()
            nonmirror = empty_record()
            for opponent, record in matchups[mode][deck_id].items():
                merge_record(all_record, record)
                if opponent != deck_id:
                    merge_record(nonmirror, record)
            deck_records[mode][deck_id] = all_record
            nonmirror_records[mode][deck_id] = nonmirror
            records_for_deck[mode] = all_record
            nonmirror_for_deck[mode] = nonmirror
        normalized = [
            1.0 - ((e["placing"] - 1) / max(1, e["tournament_players"] - 1))
            for e in entries
            if e["placing"] is not None
        ]
        best_lists = sorted(
            [e for e in entries if e["decklist_url"] and e["placing"] is not None],
            key=lambda e: (e["placing"], -e["tournament_players"], -e["record"]["wins"]),
        )
        deck_stats.append(
            {
                "deck_id": deck_id,
                "deck_name": deck_names[deck_id],
                "count": len(entries),
                "share": len(entries) / total_entries if total_entries else 0,
                "tournaments": len({e["tournament_id"] for e in entries}),
                "wins_tournaments": sum(1 for e in entries if e["placing"] == 1),
                "top8": sum(1 for e in entries if e["placing"] is not None and e["placing"] <= 8),
                "top8_rate": sum(
                    1 for e in entries if e["placing"] is not None and e["placing"] <= 8
                ) / len(entries),
                "placement_score": sum(normalized) / len(normalized) if normalized else 0,
                "record_all": records_for_deck["ALL"],
                "record_nonmirror": nonmirror_for_deck["ALL"],
                "record_by_mode": records_for_deck,
                "nonmirror_by_mode": nonmirror_for_deck,
                "entries_by_mode": {
                    mode: mode_entry_counts[mode].get(deck_id, 0) for mode in ("BO1", "BO3")
                },
                "record_bo1_nonmirror": nonmirror_for_deck["BO1"],
                "record_bo3_nonmirror": nonmirror_for_deck["BO3"],
                "bo1_entries": mode_entry_counts["BO1"].get(deck_id, 0),
                "bo3_entries": mode_entry_counts["BO3"].get(deck_id, 0),
                "best_lists": best_lists,
            }
        )
    deck_stats.sort(key=lambda item: (-item["share"], item["deck_name"].lower()))

    return {
        "deck_names": deck_names,
        "card_catalog": card_catalog,
        "entries_by_deck": entries_by_deck,
        "matchups": matchups,
        "matchups_all": matchups["ALL"],
        "matchups_bo1": matchups["BO1"],
        "matchups_bo3": matchups["BO3"],
        "entry_matchups": entry_matchups,
        "profile_groups": profile_groups,
        "deck_stats": deck_stats,
        "total_entries": total_entries,
        "mode_entry_counts": mode_entry_counts,
        "bo1_entry_counts": mode_entry_counts["BO1"],
        "bo3_entry_counts": mode_entry_counts["BO3"],
        "mode_tournament_ids": mode_tournament_ids,
        "mode_active_entries": mode_active_entries,
        "bo1_tournament_ids": mode_tournament_ids["BO1"],
        "bo3_tournament_ids": mode_tournament_ids["BO3"],
        "valid_matches_by_mode": valid_matches,
        "valid_matches": valid_matches["ALL"],
        "valid_bo1_matches": valid_matches["BO1"],
        "valid_bo3_matches": valid_matches["BO3"],
        "skipped_matches": skipped_matches,
        "tournament_by_id": tournament_by_id,
        "deck_records": deck_records,
        "nonmirror_records_by_mode": nonmirror_records,
        "all_deck_records": deck_records["ALL"],
        "nonmirror_records": nonmirror_records["ALL"],
        "bo1_nonmirror_records": nonmirror_records["BO1"],
        "bo3_nonmirror_records": nonmirror_records["BO3"],
    }


def build_mode_ranking(data: dict, args, mode: str) -> list[dict]:
    counts = data["mode_entry_counts"][mode]
    total = sum(counts.values())
    if not total:
        return []
    shares = {deck: count / total for deck, count in counts.items()}
    min_entries = args.amostra_minima if mode == "BO1" else args.amostra_minima_md3
    min_matches = args.partidas_minimas if mode == "BO1" else args.partidas_minimas_md3
    result = []
    for stat in data["deck_stats"]:
        deck = stat["deck_id"]
        base_record = stat["nonmirror_by_mode"][mode]
        base_games = record_total(base_record)
        base_rate = record_score_rate(base_record)
        entries = stat["entries_by_mode"][mode]
        if entries < min_entries or base_games < min_matches:
            continue
        prior = min(0.65, max(0.35, base_rate if base_rate is not None else 0.5))
        expected = 0.0
        covered_share = 0.0
        for opponent, share in shares.items():
            if opponent == deck:
                matchup_rate = 0.5
            else:
                record = data["matchups"][mode][deck][opponent]
                games = record_total(record)
                observed = record_score_rate(record)
                if observed is None:
                    matchup_rate = prior
                else:
                    strength = args.forca_prior
                    matchup_rate = (observed * games + prior * strength) / (games + strength)
                    if games >= args.min_jogos_matchup:
                        covered_share += share
            expected += share * matchup_rate
        p = min(0.99, max(0.01, expected))
        p_5_0 = p ** 5
        p_4_plus = p ** 5 + 5 * (p ** 4) * (1 - p)
        p_3_plus = sum(math.comb(5, k) * (p ** k) * ((1 - p) ** (5 - k)) for k in range(3, 6))
        result.append(
            {
                "deck_id": deck,
                "deck_name": stat["deck_name"],
                "mode": mode,
                "entries": entries,
                "matches": base_games,
                "raw_score_rate": base_rate,
                "expected_win_rate": expected,
                "p_5_0": p_5_0,
                "p_4_plus": p_4_plus,
                "p_3_plus": p_3_plus,
                "meta_share": shares.get(deck, 0),
                "covered_share": covered_share,
            }
        )
    result.sort(key=lambda item: (-item["p_4_plus"], -item["matches"], item["deck_name"]))
    return result


def build_md1_ranking(data: dict, args) -> list[dict]:
    return build_mode_ranking(data, args, "BO1")


def aggregate_profile_records(data: dict, entries: list[dict], mode: str) -> dict:
    records = defaultdict(empty_record)
    for entry in entries:
        entry_key = (entry["tournament_id"], str(entry["player"]))
        for opponent, record in data["entry_matchups"][mode][entry_key].items():
            merge_record(records[opponent], record)
    return records


def summed_nonmirror(records: dict, own_deck: str) -> dict:
    result = empty_record()
    for opponent, record in records.items():
        if opponent != own_deck:
            merge_record(result, record)
    return result


def posterior_rate(record: dict, prior: float, strength: float) -> float:
    games = record_total(record)
    observed = record_score_rate(record)
    if observed is None:
        return prior
    return (observed * games + prior * strength) / (games + strength)


def changes_text(changes: dict) -> str:
    removed = ", ".join(f'-{item["count"]} {item["display"]}' for item in changes["removed"])
    added = ", ".join(f'+{item["count"]} {item["display"]}' for item in changes["added"])
    if not removed and not added:
        return "A lista-base já é a variante recomendada."
    return "; ".join(part for part in (removed, added) if part)


def representative_entry(entries: list[dict]) -> dict | None:
    ranked = sorted(
        entries,
        key=lambda entry: (
            entry["placing"] is None,
            entry["placing"] if entry["placing"] is not None else 10**9,
            -entry["tournament_players"],
            -entry["record"]["wins"],
        ),
    )
    return ranked[0] if ranked else None


def build_variant_analysis(data: dict, args) -> dict:
    result = {"BO1": {}, "BO3": {}}
    for mode in ("BO1", "BO3"):
        counts = data["mode_entry_counts"][mode]
        total_entries = sum(counts.values())
        if not total_entries:
            continue
        shares = {deck: count / total_entries for deck, count in counts.items()}
        active_entries = data["mode_active_entries"][mode]

        for deck_id, signature_groups in data["profile_groups"].items():
            if not signature_groups:
                continue
            canonical_signature, canonical_entries = max(
                signature_groups.items(),
                key=lambda pair: (len(pair[1]), max((e["tournament_players"] for e in pair[1]), default=0)),
            )
            canonical_vector = dict(canonical_signature)
            deck_global_record = data["nonmirror_records_by_mode"][mode].get(deck_id, empty_record())
            deck_global_rate = record_score_rate(deck_global_record) or 0.5
            deck_matchup_priors = {}
            for opponent in shares:
                if opponent == deck_id:
                    deck_matchup_priors[opponent] = 0.5
                else:
                    deck_matchup_priors[opponent] = posterior_rate(
                        data["matchups"][mode][deck_id][opponent],
                        deck_global_rate,
                        args.forca_prior,
                    )

            profiles = []
            for signature, entries in signature_groups.items():
                vector = dict(signature)
                records = aggregate_profile_records(data, entries, mode)
                total_record = summed_nonmirror(records, deck_id)
                matches = record_total(total_record)
                mode_entries = sum(
                    1
                    for e in entries
                    if (e["tournament_id"], str(e["player"])) in active_entries
                )
                rates = {}
                expected = 0.0
                coverage = 0.0
                for opponent, share in shares.items():
                    if opponent == deck_id:
                        rate = 0.5
                    else:
                        rate = posterior_rate(
                            records[opponent],
                            deck_matchup_priors[opponent],
                            args.forca_prior_variante,
                        )
                        if record_total(records[opponent]) >= args.min_jogos_matchup:
                            coverage += share
                    rates[opponent] = rate
                    expected += share * rate
                profiles.append(
                    {
                        "signature": signature,
                        "vector": vector,
                        "entries_all": entries,
                        "entries": mode_entries,
                        "matches": matches,
                        "record": total_record,
                        "records": records,
                        "rates": rates,
                        "expected": expected,
                        "coverage": coverage,
                        "distance_from_base": vector_distance(canonical_vector, vector),
                        "representative": representative_entry(entries),
                    }
                )

            canonical = next(
                profile for profile in profiles if profile["signature"] == canonical_signature
            )
            eligible = [
                profile
                for profile in profiles
                if profile["entries"] >= args.min_listas_variante
                and profile["matches"] >= args.min_partidas_variante
                and profile["distance_from_base"] <= args.max_trocas
            ]
            best = max(eligible, key=lambda profile: (profile["expected"], profile["matches"])) if eligible else canonical
            changes = vector_changes(canonical_vector, best["vector"], data["card_catalog"])
            matchup_changes = []
            for opponent, share in shares.items():
                if opponent == deck_id:
                    continue
                delta = best["rates"].get(opponent, deck_global_rate) - canonical["rates"].get(
                    opponent, deck_global_rate
                )
                matchup_changes.append(
                    {
                        "opponent_id": opponent,
                        "opponent": data["deck_names"].get(opponent, opponent),
                        "share": share,
                        "before": canonical["rates"].get(opponent),
                        "after": best["rates"].get(opponent),
                        "delta": delta,
                        "weighted_delta": delta * share,
                        "games_best": record_total(best["records"][opponent]),
                        "games_base": record_total(canonical["records"][opponent]),
                    }
                )
            positives = sorted(matchup_changes, key=lambda item: item["weighted_delta"], reverse=True)
            negatives = sorted(matchup_changes, key=lambda item: item["weighted_delta"])
            improved = sum(1 for item in matchup_changes if item["delta"] > 0.005)
            worsened = sum(1 for item in matchup_changes if item["delta"] < -0.005)
            delta_expected = best["expected"] - canonical["expected"]
            reason_parts = [
                f"A variante foi observada em {best['entries']} entradas e {best['matches']} partidas {mode}."
            ]
            if changes["distance"]:
                reason_parts.append(
                    f"Em relação à lista-base mais usada, o pacote altera {changes['distance']:.0f} carta(s) "
                    f"e muda o win rate esperado contra o campo em {delta_expected * 100:+.2f} pontos percentuais."
                )
            else:
                reason_parts.append("A lista-base mais usada também foi a variante mais segura na amostra.")
            top_positive = [item for item in positives if item["delta"] > 0.005][:3]
            top_negative = [item for item in negatives if item["delta"] < -0.005][:2]
            if top_positive:
                reason_parts.append(
                    "Os principais ganhos estimados são contra "
                    + ", ".join(
                        f"{item['opponent']} ({item['delta'] * 100:+.1f} pp)" for item in top_positive
                    )
                    + "."
                )
            if top_negative:
                reason_parts.append(
                    "Os principais custos são contra "
                    + ", ".join(
                        f"{item['opponent']} ({item['delta'] * 100:+.1f} pp)" for item in top_negative
                    )
                    + "."
                )
            reason_parts.append(
                "A relação é associativa: habilidade do jogador e escolhas combinadas da lista ainda podem influenciar o resultado."
            )
            result[mode][deck_id] = {
                "deck_id": deck_id,
                "deck_name": data["deck_names"].get(deck_id, deck_id),
                "mode": mode,
                "canonical": canonical,
                "best": best,
                "profiles": profiles,
                "changes": changes,
                "changes_text": changes_text(changes),
                "matchup_changes": matchup_changes,
                "improved_matchups": improved,
                "worsened_matchups": worsened,
                "delta_expected": delta_expected,
                "reason": " ".join(reason_parts),
            }
    return result


def choose_profile_for_vector(
    analysis: dict, vector: dict, data: dict, args
) -> tuple[dict, dict] | tuple[None, None]:
    if not analysis:
        return None, None
    candidates = [
        profile
        for profile in analysis["profiles"]
        if profile["entries"] >= args.min_listas_variante
        and profile["matches"] >= args.min_partidas_variante
        and vector_distance(vector, profile["vector"]) <= args.max_trocas
    ]
    if not candidates:
        candidates = analysis["profiles"]
    best = max(candidates, key=lambda profile: (profile["expected"], profile["matches"]))
    changes = vector_changes(vector, best["vector"], data["card_catalog"])
    return best, changes


def analyze_user_list(path: Path | None, data: dict, variants: dict, args) -> dict | None:
    if path is None:
        return None
    vector, local_catalog, total = parse_text_decklist(path)
    data["card_catalog"].update(local_catalog)
    if not vector:
        raise ValueError(f"Não foi possível ler cartas de {path}")
    closest = None
    for deck_id, groups in data["profile_groups"].items():
        for signature, entries in groups.items():
            candidate_vector = dict(signature)
            distance = vector_distance(vector, candidate_vector)
            rank = (distance, -len(entries))
            if closest is None or rank < closest[0]:
                closest = (rank, deck_id, candidate_vector, entries)
    if closest is None:
        raise ValueError("Não há decklists completas para identificar o arquétipo")
    _, deck_id, _, _ = closest
    result = {
        "path": str(path),
        "total": total,
        "vector": vector,
        "deck_id": deck_id,
        "deck_name": data["deck_names"].get(deck_id, deck_id),
        "distance": closest[0][0],
        "modes": {},
    }
    for mode in ("BO1", "BO3"):
        analysis = variants[mode].get(deck_id)
        if not analysis:
            continue
        best, changes = choose_profile_for_vector(analysis, vector, data, args)
        if best:
            result["modes"][mode] = {
                "best": best,
                "changes": changes,
                "changes_text": changes_text(changes),
                "analysis": analysis,
            }
    return result


def write_csvs(
    output: Path,
    tournaments: list[dict],
    data: dict,
    rankings: dict,
    variants: dict,
    args,
) -> None:
    with (output / "torneios.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=["id", "date", "name", "organizer", "players", "format", "platform", "modes", "url"],
        )
        writer.writeheader()
        for t in tournaments:
            writer.writerow(
                {
                    "id": t["id"],
                    "date": t["date"],
                    "name": t["name"],
                    "organizer": t["organizer"],
                    "players": t["players"],
                    "format": t["format"],
                    "platform": t.get("platform", ""),
                    "modes": ", ".join(t.get("phase_modes", {}).values()),
                    "url": f"{BASE_URL}/tournament/{t['id']}/standings",
                }
            )

    with (output / "decks.csv").open("w", newline="", encoding="utf-8-sig") as file:
        fields = [
            "deck_id", "deck", "jogadores", "meta_share", "torneios", "titulos", "top8", "taxa_top8",
            "vitorias", "derrotas", "empates", "win_rate_com_espelhos", "win_rate_sem_espelhos",
            "score_rate_bo1_sem_espelhos", "entradas_bo1", "partidas_bo1_sem_espelhos",
            "score_rate_bo3_sem_espelhos", "entradas_bo3", "partidas_bo3_sem_espelhos",
        ]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for stat in data["deck_stats"]:
            raw, nonmirror = stat["record_all"], stat["record_nonmirror"]
            bo1, bo3 = stat["record_bo1_nonmirror"], stat["record_bo3_nonmirror"]
            writer.writerow(
                {
                    "deck_id": stat["deck_id"], "deck": stat["deck_name"], "jogadores": stat["count"],
                    "meta_share": stat["share"], "torneios": stat["tournaments"],
                    "titulos": stat["wins_tournaments"], "top8": stat["top8"], "taxa_top8": stat["top8_rate"],
                    "vitorias": raw["wins"], "derrotas": raw["losses"], "empates": raw["ties"],
                    "win_rate_com_espelhos": record_win_rate(raw),
                    "win_rate_sem_espelhos": record_win_rate(nonmirror),
                    "score_rate_bo1_sem_espelhos": record_score_rate(bo1),
                    "entradas_bo1": stat["bo1_entries"],
                    "partidas_bo1_sem_espelhos": record_total(bo1),
                    "score_rate_bo3_sem_espelhos": record_score_rate(bo3),
                    "entradas_bo3": stat["bo3_entries"],
                    "partidas_bo3_sem_espelhos": record_total(bo3),
                }
            )

    with (output / "matchups.csv").open("w", newline="", encoding="utf-8-sig") as file:
        fields = ["escopo", "deck", "adversario", "vitorias", "derrotas", "empates", "partidas", "win_rate", "score_rate"]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for scope, store in (
            ("GERAL", data["matchups_all"]),
            ("BO1", data["matchups_bo1"]),
            ("BO3", data["matchups_bo3"]),
        ):
            for deck, opponents in store.items():
                for opponent, record in opponents.items():
                    writer.writerow(
                        {
                            "escopo": scope,
                            "deck": data["deck_names"].get(deck, deck),
                            "adversario": data["deck_names"].get(opponent, opponent),
                            "vitorias": record["wins"], "derrotas": record["losses"], "empates": record["ties"],
                            "partidas": record_total(record), "win_rate": record_win_rate(record),
                            "score_rate": record_score_rate(record),
                        }
                    )

    with (output / "melhores_listas.csv").open("w", newline="", encoding="utf-8-sig") as file:
        fields = ["deck", "posicao_no_deck", "jogador", "colocacao", "record", "torneio", "jogadores_torneio", "data", "url_lista"]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for stat in data["deck_stats"]:
            for index, entry in enumerate(stat["best_lists"][: args.top_listas], start=1):
                r = entry["record"]
                writer.writerow(
                    {
                        "deck": stat["deck_name"], "posicao_no_deck": index, "jogador": entry["name"],
                        "colocacao": entry["placing"], "record": f"{r['wins']}-{r['losses']}-{r['ties']}",
                        "torneio": entry["tournament_name"], "jogadores_torneio": entry["tournament_players"],
                        "data": entry["tournament_date"], "url_lista": entry["decklist_url"],
                    }
                )

    for mode in ("BO1", "BO3"):
        mode_lower = mode.lower()
        md_label = "md1" if mode == "BO1" else "md3"
        with (output / f"ranking_{md_label}.csv").open("w", newline="", encoding="utf-8-sig") as file:
            fields = [
                "ranking", "deck", f"meta_share_{mode_lower}", f"entradas_{mode_lower}",
                f"partidas_{mode_lower}", "wr_ajustado_campo", "chance_5_0",
                "chance_4_1_ou_melhor", "chance_3_2_ou_melhor", "cobertura_matchups",
            ]
            writer = csv.DictWriter(file, fieldnames=fields)
            writer.writeheader()
            for index, item in enumerate(rankings[mode], start=1):
                writer.writerow(
                    {
                        "ranking": index,
                        "deck": item["deck_name"],
                        f"meta_share_{mode_lower}": item["meta_share"],
                        f"entradas_{mode_lower}": item["entries"],
                        f"partidas_{mode_lower}": item["matches"],
                        "wr_ajustado_campo": item["expected_win_rate"],
                        "chance_5_0": item["p_5_0"],
                        "chance_4_1_ou_melhor": item["p_4_plus"],
                        "chance_3_2_ou_melhor": item["p_3_plus"],
                        "cobertura_matchups": item["covered_share"],
                    }
                )

    with (output / "variantes_recomendadas.csv").open("w", newline="", encoding="utf-8-sig") as file:
        fields = [
            "modo", "deck", "trocas", "cartas_alteradas", "wr_lista_base", "wr_lista_sugerida",
            "diferenca_wr", "matchups_melhorados", "matchups_piorados", "listas_na_amostra",
            "partidas_na_amostra", "url_lista_observada", "explicacao",
        ]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for mode in ("BO1", "BO3"):
            for analysis in variants[mode].values():
                representative = analysis["best"].get("representative") or {}
                writer.writerow(
                    {
                        "modo": mode,
                        "deck": analysis["deck_name"],
                        "trocas": analysis["changes"]["distance"],
                        "cartas_alteradas": analysis["changes_text"],
                        "wr_lista_base": analysis["canonical"]["expected"],
                        "wr_lista_sugerida": analysis["best"]["expected"],
                        "diferenca_wr": analysis["delta_expected"],
                        "matchups_melhorados": analysis["improved_matchups"],
                        "matchups_piorados": analysis["worsened_matchups"],
                        "listas_na_amostra": analysis["best"]["entries"],
                        "partidas_na_amostra": analysis["best"]["matches"],
                        "url_lista_observada": representative.get("decklist_url", ""),
                        "explicacao": analysis["reason"],
                    }
                )

    with (output / "decklists.csv").open("w", newline="", encoding="utf-8-sig") as file:
        fields = [
            "torneio_id", "jogador", "deck", "colocacao", "record", "carta_id",
            "carta", "categoria", "quantidade", "url_lista",
        ]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for entries in data["entries_by_deck"].values():
            for entry in entries:
                record = entry["record"]
                for key, count in entry.get("decklist_vector", {}).items():
                    card = data["card_catalog"].get(key, {})
                    writer.writerow(
                        {
                            "torneio_id": entry["tournament_id"],
                            "jogador": entry["name"],
                            "deck": entry["deck_name"],
                            "colocacao": entry["placing"],
                            "record": f"{record['wins']}-{record['losses']}-{record['ties']}",
                            "carta_id": key,
                            "carta": card.get("display", key),
                            "categoria": card.get("category", ""),
                            "quantidade": count,
                            "url_lista": entry["decklist_url"],
                        }
                    )


def td(value, cls: str = "") -> str:
    return f'<td class="{cls}">{html.escape(str(value))}</td>'


def heat_color(rate: float | None) -> str:
    if rate is None:
        return ""
    if rate >= 0.57:
        return "good"
    if rate <= 0.43:
        return "bad"
    return "neutral"


def dialog_id(mode: str, deck_id: str, prefix: str = "deck") -> str:
    clean = re.sub(r"[^a-zA-Z0-9_-]", "-", deck_id)
    return f"list-{prefix}-{mode.lower()}-{clean}"


def render_deck_vector(vector: dict, catalog: dict, changes: dict | None = None) -> str:
    added = {item["key"] for item in (changes or {}).get("added", [])}
    sections = []
    for category, title in (("pokemon", "Pokémon"), ("trainer", "Treinadores"), ("energy", "Energias")):
        cards = []
        for key, count in vector.items():
            card = catalog.get(key, {})
            if card.get("category") != category:
                continue
            css = " changed-add" if key in added else ""
            cards.append(
                (card.get("display", key).casefold(), f'<li class="{css}"><b>{count}</b> {html.escape(card.get("display", key))}</li>')
            )
        if cards:
            sections.append(f'<div><h4>{title}: {sum(int(vector[k]) for k in vector if catalog.get(k, {}).get("category") == category)}</h4><ul class="deck-list">{"".join(value for _, value in sorted(cards))}</ul></div>')
    return '<div class="deck-columns">' + "".join(sections) + "</div>"


def render_variant_dialog(analysis: dict, data: dict, mode: str, prefix: str = "deck", changes: dict | None = None) -> str:
    selected_changes = changes or analysis["changes"]
    identifier = dialog_id(mode, analysis["deck_id"], prefix)
    best = analysis["best"]
    matchup_rows = []
    for item in sorted(analysis["matchup_changes"], key=lambda row: abs(row["weighted_delta"]), reverse=True)[:12]:
        matchup_rows.append(
            "<tr>" + td(item["opponent"], "deck") + td(safe_float_pct(item["before"]))
            + td(safe_float_pct(item["after"])) + td(f'{item["delta"] * 100:+.2f} pp', heat_color(0.5 + item["delta"]))
            + td(f'{item["games_base"]}/{item["games_best"]}') + "</tr>"
        )
    removed = "".join(
        f'<li class="changed-remove">−{item["count"]} {html.escape(item["display"])}</li>'
        for item in selected_changes["removed"]
    ) or "<li>Nenhuma remoção</li>"
    added = "".join(
        f'<li class="changed-add">+{item["count"]} {html.escape(item["display"])}</li>'
        for item in selected_changes["added"]
    ) or "<li>Nenhuma adição</li>"
    representative = best.get("representative") or {}
    limitless_link = (
        f'<a class="secondary-button" href="{html.escape(representative.get("decklist_url", ""), quote=True)}" target="_blank">Abrir lista observada no Limitless</a>'
        if representative.get("decklist_url") else ""
    )
    return (
        f'<dialog id="{identifier}"><div class="dialog-head"><div><h2>{html.escape(analysis["deck_name"])} — {mode}</h2>'
        f'<p>Lista sugerida com base nas variantes observadas.</p></div><button class="close-button" onclick="closeList(\'{identifier}\')">×</button></div>'
        f'<div class="change-box"><div><h3>Retirar</h3><ul>{removed}</ul></div><div><h3>Adicionar</h3><ul>{added}</ul></div></div>'
        f'<p class="explanation"><strong>O que mudou e por quê:</strong> {html.escape(analysis["reason"])}</p>'
        f'{render_deck_vector(best["vector"], data["card_catalog"], selected_changes)}'
        '<h3>Impacto estimado nos principais matchups</h3><div class="table-wrap"><table><thead><tr><th>Adversário</th><th>Lista-base</th><th>Sugerida</th><th>Diferença</th><th>Jogos base/sug.</th></tr></thead>'
        f'<tbody>{"".join(matchup_rows)}</tbody></table></div><div class="dialog-actions">{limitless_link}<button onclick="closeList(\'{identifier}\')">Fechar</button></div></dialog>'
    )


def render_variant_summary(analysis: dict | None, mode: str, prefix: str = "deck") -> str:
    if not analysis:
        return f'<div class="variant-card"><h3>{mode}</h3><p>Amostra insuficiente.</p></div>'
    identifier = dialog_id(mode, analysis["deck_id"], prefix)
    return (
        f'<div class="variant-card"><h3>Sugestão {mode}</h3><p><strong>{html.escape(analysis["changes_text"])}</strong></p>'
        f'<p>WR esperado: {safe_float_pct(analysis["canonical"]["expected"])} → {safe_float_pct(analysis["best"]["expected"])} '
        f'({analysis["delta_expected"] * 100:+.2f} pp). Melhora {analysis["improved_matchups"]} matchups e piora {analysis["worsened_matchups"]} na amostra.</p>'
        f'<button onclick="openList(\'{identifier}\')">Ver lista sugerida</button></div>'
    )



def build_laboratory_payload(
    tournaments: list[dict], data: dict, variants: dict, args
) -> dict:
    tournament_payload = []
    for tournament in sorted(tournaments, key=lambda item: item["date"], reverse=True):
        modes = sorted(
            {
                value
                for value in tournament.get("phase_modes", {}).values()
                if value in ("BO1", "BO3")
            }
        )
        tournament_payload.append(
            {
                "id": tournament["id"],
                "name": tournament["name"],
                "date": tournament["date"],
                "modes": modes,
                "entries": [
                    {
                        "deck": entry["deck_id"],
                        "placing": entry["placing"],
                    }
                    for entry in tournament.get("entries", [])
                    if entry.get("placing") is not None
                ],
            }
        )

    decks_by_mode = {"BO1": {}, "BO3": {}}
    for mode in ("BO1", "BO3"):
        active_entries = data["mode_active_entries"][mode]
        for stat in data["deck_stats"]:
            deck_id = stat["deck_id"]
            entries = stat["entries_by_mode"][mode]
            aggregate_record = stat["nonmirror_by_mode"][mode]
            aggregate_matches = record_total(aggregate_record)
            aggregate_rate = record_score_rate(aggregate_record)
            if entries < 1 or aggregate_matches < 1:
                continue

            prior = min(0.65, max(0.35, aggregate_rate or 0.5))
            matchup_payload = {}
            for opponent in data["deck_names"]:
                if opponent == deck_id:
                    rate, games = 0.5, 0
                else:
                    record = data["matchups"][mode][deck_id][opponent]
                    games = record_total(record)
                    observed = record_score_rate(record)
                    rate = (
                        prior
                        if observed is None
                        else (observed * games + prior * args.forca_prior)
                        / (games + args.forca_prior)
                    )
                matchup_payload[opponent] = {
                    "rate": round(rate, 6),
                    "games": games,
                }

            analysis = variants[mode].get(deck_id)
            raw_profiles = analysis["profiles"] if analysis else []
            canonical_vector = analysis["canonical"]["vector"] if analysis else {}
            profiles = []
            for profile in raw_profiles:
                if (
                    profile["entries"] < args.min_listas_variante
                    or profile["matches"] < args.min_partidas_variante
                    or profile["distance_from_base"] > args.max_trocas
                    or sum(profile["vector"].values()) != 60
                ):
                    continue
                profile_entries = [
                    entry
                    for entry in profile["entries_all"]
                    if (entry["tournament_id"], str(entry["player"])) in active_entries
                    and entry.get("decklist_total") == 60
                ]
                representative = representative_entry(profile_entries)
                if not representative:
                    continue
                changes = vector_changes(
                    canonical_vector, profile["vector"], data["card_catalog"]
                )
                profiles.append(
                    {
                        "entries": profile["entries"],
                        "matches": profile["matches"],
                        "rates": {
                            opponent: round(rate, 6)
                            for opponent, rate in profile["rates"].items()
                        },
                        "cards": [
                            {
                                "key": key,
                                "count": count,
                                "name": data["card_catalog"].get(key, {}).get(
                                    "display", key
                                ),
                                "category": data["card_catalog"].get(key, {}).get(
                                    "category", ""
                                ),
                            }
                            for key, count in profile["vector"].items()
                        ],
                        "changes": {
                            "text": changes_text(changes),
                            "added": [
                                {
                                    "name": item["display"],
                                    "count": item["count"],
                                }
                                for item in changes["added"]
                            ],
                            "removed": [
                                {
                                    "name": item["display"],
                                    "count": item["count"],
                                }
                                for item in changes["removed"]
                            ],
                        },
                        "source": {
                            "player": representative["name"],
                            "placing": representative["placing"],
                            "tournament": representative["tournament_name"],
                            "date": representative["tournament_date"],
                            "url": representative["decklist_url"],
                        },
                    }
                )

            profiles.sort(
                key=lambda profile: (profile["matches"], profile["entries"]),
                reverse=True,
            )
            profiles = profiles[:15]

            if not profiles:
                fallback_entries = [
                    entry
                    for entry in data["entries_by_deck"][deck_id]
                    if (entry["tournament_id"], str(entry["player"])) in active_entries
                    and entry.get("decklist_total") == 60
                ]
                representative = representative_entry(fallback_entries)
                if representative:
                    profiles.append(
                        {
                            "entries": 1,
                            "matches": aggregate_matches,
                            "rates": {
                                opponent: item["rate"]
                                for opponent, item in matchup_payload.items()
                            },
                            "cards": [
                                {
                                    "key": key,
                                    "count": count,
                                    "name": data["card_catalog"].get(key, {}).get(
                                        "display", key
                                    ),
                                    "category": data["card_catalog"].get(key, {}).get(
                                        "category", ""
                                    ),
                                }
                                for key, count in representative[
                                    "decklist_vector"
                                ].items()
                            ],
                            "changes": {
                                "text": "Lista de 60 cartas com melhor colocação observada para o arquétipo neste modo.",
                                "added": [],
                                "removed": [],
                            },
                            "source": {
                                "player": representative["name"],
                                "placing": representative["placing"],
                                "tournament": representative["tournament_name"],
                                "date": representative["tournament_date"],
                                "url": representative["decklist_url"],
                            },
                        }
                    )

            decks_by_mode[mode][deck_id] = {
                "name": stat["deck_name"],
                "entries": entries,
                "matches": aggregate_matches,
                "prior": round(prior, 6),
                "matchups": matchup_payload,
                "profiles": profiles,
            }

    return {
        "tournaments": tournament_payload,
        "decks": decks_by_mode,
        "minimumMatchupGames": args.min_jogos_matchup,
    }


def render_laboratory(
    tournaments: list[dict], data: dict, variants: dict, args
) -> tuple[str, str, str]:
    payload = build_laboratory_payload(tournaments, data, variants, args)
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace(
        "</", "<\\/"
    )
    default_recent = max(1, min(10, len(tournaments)))
    section = f"""
<h2>Laboratório de torneio hipotético</h2>
<p class="note">Monte um campo esperado com os melhores colocados dos torneios recentes. O cálculo usa somente dados já coletados nesta página e não faz novas requisições.</p>
<div class="lab-panel">
  <div class="lab-controls">
    <label>Rodadas<input id="labRounds" type="number" min="1" max="20" value="5"></label>
    <label>Formato<select id="labMode"><option value="BO1">MD1</option><option value="BO3">MD3</option></select></label>
    <label>Corte<select id="labTop"><option value="4">Top 4</option><option value="8" selected>Top 8</option><option value="16">Top 16</option><option value="32">Top 32</option></select></label>
    <label>Torneios recentes<input id="labRecent" type="number" min="1" max="{max(1, len(tournaments))}" value="{default_recent}"></label>
    <button type="button" onclick="runLaboratory()">Calcular melhor deck</button>
  </div>
  <div id="labResult" class="lab-result"><p class="note">Escolha os parâmetros e toque em “Calcular melhor deck”.</p></div>
</div>
"""
    dialog = """
<dialog id="labListDialog">
  <div class="dialog-head"><div><h2 id="labListTitle">Lista recomendada</h2><p id="labListSource"></p></div><button class="close-button" onclick="closeList('labListDialog')">×</button></div>
  <div id="labListChanges"></div>
  <div id="labListCards"></div>
  <p id="labListWhy" class="explanation"></p>
  <div class="dialog-actions"><a id="labListLink" class="secondary-button" target="_blank" rel="noopener">Abrir lista observada no Limitless</a><button onclick="closeList('labListDialog')">Fechar</button></div>
</dialog>
"""
    script = r"""
<script>
const laboratoryData = __LAB_PAYLOAD__;
let laboratoryScores = [];
let laboratoryField = {};

function labEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];
  });
}
function labPercent(value) { return (value * 100).toFixed(1) + "%"; }
function labCombination(n, k) {
  k = Math.min(k, n - k);
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - k + i) / i;
  return value;
}
function labPositiveChance(rounds, probability) {
  const target = Math.floor(rounds / 2) + 1;
  let total = 0;
  for (let wins = target; wins <= rounds; wins++) {
    total += labCombination(rounds, wins) * Math.pow(probability, wins) * Math.pow(1 - probability, rounds - wins);
  }
  return total;
}
function labProfileScore(profile, deck, field) {
  let expected = 0;
  for (const [opponent, share] of Object.entries(field)) {
    const rate = opponent === deck.id
      ? 0.5
      : (profile && profile.rates[opponent] != null
          ? profile.rates[opponent]
          : (deck.matchups[opponent] ? deck.matchups[opponent].rate : deck.prior));
    expected += share * rate;
  }
  return expected;
}
function labBestProfile(deck, field) {
  if (!deck.profiles.length) return null;
  return deck.profiles
    .map(function (profile) {
      return {profile: profile, expected: labProfileScore(profile, deck, field)};
    })
    .sort(function (a, b) {
      return b.expected - a.expected || b.profile.matches - a.profile.matches;
    })[0];
}
function labMatchupSummary(score, field, positive) {
  const rows = Object.entries(field)
    .filter(function (item) { return item[0] !== score.id; })
    .map(function (item) {
      const opponent = item[0], share = item[1];
      const aggregate = score.deck.matchups[opponent];
      const profileRate = score.profile && score.profile.rates[opponent] != null
        ? score.profile.rates[opponent]
        : (aggregate ? aggregate.rate : score.deck.prior);
      return {
        name: laboratoryData.decks[score.mode][opponent]
          ? laboratoryData.decks[score.mode][opponent].name
          : opponent,
        rate: profileRate,
        impact: (profileRate - 0.5) * share
      };
    })
    .filter(function (item) { return positive ? item.rate > 0.505 : item.rate < 0.495; })
    .sort(function (a, b) { return positive ? b.impact - a.impact : a.impact - b.impact; })
    .slice(0, 3);
  return rows.map(function (item) {
    return labEscape(item.name) + " (" + labPercent(item.rate) + ")";
  }).join(", ");
}
function runLaboratory() {
  const rounds = Math.max(1, Math.min(20, Number(document.getElementById("labRounds").value) || 5));
  const mode = document.getElementById("labMode").value;
  const top = Number(document.getElementById("labTop").value);
  const recent = Math.max(1, Number(document.getElementById("labRecent").value) || 1);
  const result = document.getElementById("labResult");
  const tournaments = laboratoryData.tournaments
    .filter(function (tournament) { return tournament.modes.includes(mode); })
    .slice(0, recent);

  if (!tournaments.length) {
    result.innerHTML = '<div class="warn">Não há torneios ' + (mode === "BO1" ? "MD1" : "MD3") + ' na base para formar o campo.</div>';
    return;
  }

  const counts = {};
  let total = 0;
  tournaments.forEach(function (tournament) {
    tournament.entries.forEach(function (entry) {
      if (entry.placing <= top) {
        counts[entry.deck] = (counts[entry.deck] || 0) + 1;
        total += 1;
      }
    });
  });
  if (!total) {
    result.innerHTML = '<div class="warn">Nenhuma decklist encontrada dentro do corte escolhido.</div>';
    return;
  }

  const field = {};
  Object.entries(counts).forEach(function (item) { field[item[0]] = item[1] / total; });
  laboratoryField = field;
  laboratoryScores = Object.entries(laboratoryData.decks[mode]).map(function (item) {
    const id = item[0], deck = item[1];
    deck.id = id;
    const baseExpected = labProfileScore(null, deck, field);
    const bestProfile = labBestProfile(deck, field);
    const expected = bestProfile ? bestProfile.expected : baseExpected;
    let coverage = 0;
    Object.entries(field).forEach(function (opponentItem) {
      const opponent = opponentItem[0], share = opponentItem[1];
      if (opponent === id || (deck.matchups[opponent] && deck.matchups[opponent].games >= laboratoryData.minimumMatchupGames)) {
        coverage += share;
      }
    });
    return {
      id: id,
      mode: mode,
      deck: deck,
      name: deck.name,
      expected: expected,
      profile: bestProfile ? bestProfile.profile : null,
      coverage: coverage,
      positive: labPositiveChance(rounds, Math.max(0.01, Math.min(0.99, expected)))
    };
  }).filter(function (score) {
    return score.deck.matches >= 5;
  }).sort(function (a, b) {
    return b.expected - a.expected || b.deck.matches - a.deck.matches;
  });

  if (!laboratoryScores.length) {
    result.innerHTML = '<div class="warn">Amostra insuficiente de matchups para recomendar um deck neste formato.</div>';
    return;
  }

  const best = laboratoryScores[0];
  const fieldLeaders = Object.entries(field)
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 5)
    .map(function (item) {
      const deck = laboratoryData.decks[mode][item[0]];
      return '<span class="lab-chip">' + labEscape(deck ? deck.name : item[0]) + ' ' + labPercent(item[1]) + '</span>';
    }).join("");
  const strengths = labMatchupSummary(best, field, true);
  const risks = labMatchupSummary(best, field, false);
  const confidence = best.deck.matches >= 150 && best.coverage >= 0.7
    ? "alta"
    : (best.deck.matches >= 50 && best.coverage >= 0.4 ? "média" : "baixa");
  const rows = laboratoryScores.slice(0, 10).map(function (score, index) {
    const button = score.profile
      ? '<button type="button" onclick="openLaboratoryList(' + index + ')">Ver lista</button>'
      : '<span class="note">Sem lista de 60 cartas</span>';
    return '<tr><td>' + (index + 1) + '</td><td class="deck">' + labEscape(score.name) + '</td><td>' +
      labPercent(score.expected) + '</td><td>' + (score.expected * rounds).toFixed(2) + '</td><td>' +
      labPercent(score.positive) + '</td><td>' + labPercent(score.coverage) + '</td><td>' +
      score.deck.matches + '</td><td>' + button + '</td></tr>';
  }).join("");

  result.innerHTML =
    '<div class="lab-field"><strong>Campo estimado (' + total + ' resultados em ' + tournaments.length + ' torneios)</strong><div>' + fieldLeaders + '</div></div>' +
    '<div class="recommend"><strong>Recomendação: ' + labEscape(best.name) + '</strong><br>' +
    '<span>Score esperado de ' + (best.expected * rounds).toFixed(2) + ' em ' + rounds +
    ' rodadas; chance teórica de campanha positiva: ' + labPercent(best.positive) +
    '; confiança ' + confidence + '.</span><p><strong>Por quê:</strong> é o maior WR ajustado contra o campo escolhido (' +
    labPercent(best.expected) + '). ' + (strengths ? 'Boas projeções contra ' + strengths + '. ' : '') +
    (risks ? 'Riscos principais contra ' + risks + '. ' : '') +
    'A cobertura direta de matchups é ' + labPercent(best.coverage) + '.</p></div>' +
    '<div class="table-wrap"><table><thead><tr><th>#</th><th>Deck</th><th>WR ajustado</th><th>Score esperado</th><th>Campanha positiva</th><th>Cobertura</th><th>Partidas</th><th>Lista</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>' +
    '<p class="note">Projeção binomial baseada em resultados históricos suavizados. Não mede habilidade individual, ordem dos pareamentos, empates intencionais nem mudanças futuras do metagame.</p>';
}
function openLaboratoryList(index) {
  const score = laboratoryScores[index];
  if (!score || !score.profile) return;
  const profile = score.profile;
  document.getElementById("labListTitle").textContent = score.name + " — " + (score.mode === "BO1" ? "MD1" : "MD3");
  document.getElementById("labListSource").textContent =
    "Lista de " + profile.source.player + ", " + profile.source.placing + "º lugar em " +
    profile.source.tournament + " (" + new Date(profile.source.date).toLocaleDateString("pt-BR") + ").";

  const removed = profile.changes.removed.length
    ? profile.changes.removed.map(function (card) { return '<li class="changed-remove">−' + card.count + ' ' + labEscape(card.name) + '</li>'; }).join("")
    : "<li>Nenhuma retirada em relação à lista-base</li>";
  const added = profile.changes.added.length
    ? profile.changes.added.map(function (card) { return '<li class="changed-add">+' + card.count + ' ' + labEscape(card.name) + '</li>'; }).join("")
    : "<li>Nenhuma adição em relação à lista-base</li>";
  document.getElementById("labListChanges").innerHTML =
    '<div class="change-box"><div><h3>Retirar</h3><ul>' + removed + '</ul></div><div><h3>Adicionar</h3><ul>' + added + '</ul></div></div>';

  const categories = [["pokemon", "Pokémon"], ["trainer", "Treinadores"], ["energy", "Energias"]];
  document.getElementById("labListCards").innerHTML = '<div class="deck-columns">' + categories.map(function (category) {
    const cards = profile.cards.filter(function (card) { return card.category === category[0]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, "pt-BR"); });
    if (!cards.length) return "";
    const total = cards.reduce(function (sum, card) { return sum + card.count; }, 0);
    return '<div><h4>' + category[1] + ': ' + total + '</h4><ul class="deck-list">' +
      cards.map(function (card) { return '<li><b>' + card.count + '</b> ' + labEscape(card.name) + '</li>'; }).join("") +
      '</ul></div>';
  }).join("") + '</div>';

  const strengths = labMatchupSummary(score, laboratoryField, true);
  document.getElementById("labListWhy").innerHTML =
    '<strong>O que mudou e por quê:</strong> ' + labEscape(profile.changes.text) +
    ' Esta variante foi observada em ' + profile.entries + ' entradas e ' + profile.matches +
    ' partidas. Para o campo escolhido, projeta ' + labPercent(score.expected) +
    (strengths ? ', com os maiores ganhos ponderados contra ' + strengths : '') + '.';
  const link = document.getElementById("labListLink");
  link.href = profile.source.url;
  link.style.display = profile.source.url ? "inline-block" : "none";
  openList("labListDialog");
}
document.addEventListener("DOMContentLoaded", runLaboratory);
</script>
""".replace("__LAB_PAYLOAD__", payload_json)
    return section, dialog, script

def build_html(
    tournaments: list[dict],
    data: dict,
    rankings: dict,
    variants: dict,
    user_analysis: dict | None,
    args,
) -> str:
    generated = datetime.now().astimezone().strftime("%d/%m/%Y %H:%M")
    period_label = (
        f"desde {args.data_inicial.strftime('%d/%m/%Y')}"
        if args.data_inicial
        else f"últimos {args.dias} dias"
    )
    players_label = (
        "sem corte mínimo de jogadores"
        if args.min_jogadores <= 1
        else f"mínimo {args.min_jogadores} jogadores"
    )
    laboratory_section, laboratory_dialog, laboratory_script = render_laboratory(
        tournaments, data, variants, args
    )

    def ranking_rows(mode: str) -> str:
        rows = []
        for index, item in enumerate(rankings[mode][:25], start=1):
            confidence = "Alta" if item["matches"] >= 250 else "Média" if item["matches"] >= 100 else "Baixa"
            analysis = variants[mode].get(item["deck_id"])
            button = (
                f'<button onclick="openList(\'{dialog_id(mode, item["deck_id"])}\')">Ver lista</button>'
                if analysis else "-"
            )
            rows.append(
                "<tr>" + td(index) + td(item["deck_name"], "deck") + td(safe_float_pct(item["meta_share"]))
                + td(item["entries"]) + td(item["matches"])
                + td(safe_float_pct(item["expected_win_rate"]), heat_color(item["expected_win_rate"]))
                + td(safe_float_pct(item["p_5_0"])) + td(safe_float_pct(item["p_4_plus"]))
                + td(safe_float_pct(item["p_3_plus"])) + td(confidence) + f"<td>{button}</td></tr>"
            )
        return "".join(rows)

    deck_rows = []
    details_sections = []
    dialogs = []
    for stat in data["deck_stats"]:
        raw, nonmirror = stat["record_all"], stat["record_nonmirror"]
        raw_wr, nonmirror_wr = record_win_rate(raw), record_win_rate(nonmirror)
        deck_rows.append(
            f'<tr data-search="{html.escape(stat["deck_name"].lower())}">' + td(stat["deck_name"], "deck")
            + td(stat["count"]) + td(safe_float_pct(stat["share"])) + td(stat["tournaments"])
            + td(stat["wins_tournaments"]) + td(f'{stat["top8"]} ({safe_float_pct(stat["top8_rate"])})')
            + td(f'{raw["wins"]}-{raw["losses"]}-{raw["ties"]}') + td(safe_float_pct(raw_wr), heat_color(raw_wr))
            + td(safe_float_pct(nonmirror_wr), heat_color(nonmirror_wr)) + "</tr>"
        )
        matchup_rows = []
        opponents = sorted(data["matchups_all"][stat["deck_id"]].items(), key=lambda pair: -record_total(pair[1]))
        for opponent, record in opponents:
            if opponent == stat["deck_id"]:
                continue
            matchup_rows.append(
                "<tr>" + td(data["deck_names"].get(opponent, opponent), "deck")
                + td(f'{record["wins"]}-{record["losses"]}-{record["ties"]}') + td(record_total(record))
                + td(safe_float_pct(record_win_rate(record)), heat_color(record_win_rate(record))) + "</tr>"
            )
        list_items = []
        for entry in stat["best_lists"][: args.top_listas]:
            record = entry["record"]
            list_items.append(
                f'<li><a href="{html.escape(entry["decklist_url"], quote=True)}" target="_blank">#{entry["placing"]} — {html.escape(entry["name"])}</a> '
                f'({record["wins"]}-{record["losses"]}-{record["ties"]}, {entry["tournament_players"]} jogadores)</li>'
            )
        bo1_analysis = variants["BO1"].get(stat["deck_id"])
        bo3_analysis = variants["BO3"].get(stat["deck_id"])
        if bo1_analysis:
            dialogs.append(render_variant_dialog(bo1_analysis, data, "BO1"))
        if bo3_analysis:
            dialogs.append(render_variant_dialog(bo3_analysis, data, "BO3"))
        details_sections.append(
            f'<details class="deck-detail"><summary>{html.escape(stat["deck_name"])} — {stat["count"]} listas, {safe_float_pct(stat["share"])} do meta</summary>'
            f'<div class="variant-grid">{render_variant_summary(bo1_analysis, "BO1")}{render_variant_summary(bo3_analysis, "BO3")}</div>'
            '<div class="detail-grid"><div><h3>Matchups gerais</h3><div class="table-wrap"><table><thead><tr><th>Adversário</th><th>W-L-T</th><th>Jogos</th><th>WR</th></tr></thead>'
            f'<tbody>{"".join(matchup_rows)}</tbody></table></div></div><div><h3>Melhores resultados</h3><ol>{"".join(list_items) or "<li>Sem lista publicada</li>"}</ol></div></div></details>'
        )

    top_matrix_decks = [s["deck_id"] for s in data["deck_stats"][:15]]
    matrix_header = "<th>Deck</th>" + "".join(
        f'<th title="{html.escape(data["deck_names"][deck])}">{html.escape(data["deck_names"][deck][:12])}</th>'
        for deck in top_matrix_decks
    )
    matrix_rows = []
    for deck in top_matrix_decks:
        cells = [f'<td class="deck">{html.escape(data["deck_names"][deck])}</td>']
        for opponent in top_matrix_decks:
            if deck == opponent:
                cells.append('<td class="mirror">espelho</td>')
                continue
            record = data["matchups_all"][deck][opponent]
            rate = record_win_rate(record)
            title = f'{record["wins"]}-{record["losses"]}-{record["ties"]} / {record_total(record)} jogos'
            cells.append(f'<td class="{heat_color(rate)}" title="{title}">{safe_float_pct(rate)}</td>')
        matrix_rows.append("<tr>" + "".join(cells) + "</tr>")

    tournament_rows = []
    for tournament in tournaments:
        modes = ", ".join(tournament.get("phase_modes", {}).values()) or "não identificado"
        url = f"{BASE_URL}/tournament/{tournament['id']}/standings"
        tournament_rows.append(
            "<tr>"
            + f'<td><a href="{url}" target="_blank">{html.escape(tournament["name"])}</a></td>'
            + td(tournament["date"][:10])
            + td(tournament["players"])
            + td(tournament["format"])
            + td(modes)
            + "</tr>"
        )

    recommendations = []
    for mode in ("BO1", "BO3"):
        if rankings[mode]:
            best = rankings[mode][0]
            analysis = variants[mode].get(best["deck_id"])
            button = (
                f'<button onclick="openList(\'{dialog_id(mode, best["deck_id"])}\')">Ver lista sugerida</button>'
                if analysis else ""
            )
            recommendations.append(
                f'<div class="recommend"><span>Melhor escolha estatística para {mode}:</span> '
                f'<strong>{html.escape(best["deck_name"])}</strong>. WR ajustado ao campo de '
                f'{safe_float_pct(best["expected_win_rate"])} e chance teórica de '
                f'{safe_float_pct(best["p_4_plus"])} de terminar 4-1 ou 5-0 em cinco rodadas. '
                f'Amostra: {best["entries"]} jogadores e {best["matches"]} partidas sem espelhos. {button}</div>'
            )
        else:
            recommendations.append(f'<div class="warn">Não houve amostra suficiente para gerar o ranking {mode}.</div>')

    user_section = ""
    if user_analysis:
        user_cards = []
        for mode in ("BO1", "BO3"):
            item = user_analysis["modes"].get(mode)
            if not item:
                user_cards.append(f'<div class="variant-card"><h3>{mode}</h3><p>Amostra insuficiente.</p></div>')
                continue
            base_analysis = item["analysis"]
            custom = dict(base_analysis)
            custom["best"] = item["best"]
            custom["changes"] = item["changes"]
            custom["changes_text"] = item["changes_text"]
            custom["reason"] = (
                f"A lista enviada foi identificada como {user_analysis['deck_name']}. "
                f"A recomendação aponta o perfil observado de maior desempenho {mode} dentro de até "
                f"{args.max_trocas} trocas quando havia amostra suficiente. {base_analysis['reason']}"
            )
            identifier = dialog_id(mode, user_analysis["deck_id"], "user")
            user_cards.append(
                f'<div class="variant-card"><h3>{mode}</h3><p><strong>{html.escape(item["changes_text"])}</strong></p>'
                f'<p>Perfil sugerido: {safe_float_pct(item["best"]["expected"])} de WR ajustado, '
                f'{item["best"]["entries"]} entradas e {item["best"]["matches"]} partidas.</p>'
                f'<button onclick="openList(\'{identifier}\')">Ver lista sugerida</button></div>'
            )
            dialogs.append(render_variant_dialog(custom, data, mode, prefix="user", changes=item["changes"]))
        user_section = (
            '<h2>Análise da sua lista</h2><div class="user-list-card">'
            f'<h3>Arquétipo identificado: {html.escape(user_analysis["deck_name"])}</h3>'
            f'<p>{user_analysis["total"]} cartas lidas. Distância de {user_analysis["distance"]:.0f} troca(s) para a variante conhecida mais próxima.</p>'
            f'<div class="variant-grid">{"".join(user_cards)}</div></div>'
        )

    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metagame Limitless — {period_label}</title>
<style>
:root{{--bg:#0c1220;--card:#151e2f;--line:#2b3952;--text:#edf3ff;--muted:#9eabc1;--accent:#75a7ff;--good:#163f34;--bad:#4a2027;--neutral:#33361f}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,Segoe UI,sans-serif}}
main{{max-width:1500px;margin:auto;padding:28px}} h1{{font-size:30px;margin:0 0 4px}} h2{{margin-top:32px}} h3{{margin:8px 0}}
.sub,.note{{color:var(--muted)}} .cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0}}
.card,.recommend,.warn,.variant-card,.user-list-card,.lab-panel{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}} .card strong{{display:block;font-size:24px}}
.recommend{{border-color:#3f75cf;font-size:16px}} .recommend span{{color:var(--muted)}} .warn{{border-color:#9b6c30}}
.table-wrap{{overflow:auto;border:1px solid var(--line);border-radius:8px}} table{{border-collapse:collapse;width:100%;background:var(--card)}}
th,td{{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}} th{{position:sticky;top:0;background:#1c2840;z-index:1}}
th:first-child,td:first-child,.deck{{text-align:left}} .good{{background:var(--good)}} .bad{{background:var(--bad)}} .neutral{{background:var(--neutral)}} .mirror{{color:var(--muted)}}
a{{color:var(--accent)}} input,select{{width:100%;max-width:420px;padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);margin:0 0 10px}}
.lab-controls{{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr)) auto;gap:12px;align-items:end}} .lab-controls label{{font-weight:700;color:var(--muted)}} .lab-controls button{{margin-bottom:10px}} .lab-result{{margin-top:14px}} .lab-field{{margin-bottom:12px}} .lab-chip{{display:inline-block;background:#22314d;border:1px solid var(--line);border-radius:999px;padding:4px 9px;margin:7px 6px 0 0}}
button,.secondary-button{{display:inline-block;background:#2f6fd4;color:white;border:0;border-radius:7px;padding:8px 12px;cursor:pointer;text-decoration:none;font-weight:700}} button:hover{{background:#4383e8}}
details{{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:10px}} summary{{cursor:pointer;font-weight:700}}
.detail-grid{{display:grid;grid-template-columns:2fr 1fr;gap:18px;margin-top:12px}} .variant-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}} li{{margin:7px 0}} .downloads a{{margin-right:14px}}
dialog{{width:min(1050px,95vw);max-height:92vh;overflow:auto;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:20px}} dialog::backdrop{{background:#000a}}
.dialog-head{{display:flex;justify-content:space-between;gap:15px;align-items:start}} .dialog-head h2{{margin:0}} .dialog-head p{{color:var(--muted)}} .close-button{{font-size:24px;padding:2px 10px;background:#3b4659}}
.change-box{{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:var(--card);padding:12px;border-radius:8px}} .changed-add{{color:#70e0a8}} .changed-remove{{color:#ff8d9c}}
.deck-columns{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}} .deck-list{{list-style:none;padding:0}} .deck-list li{{padding:4px 7px;border-bottom:1px solid var(--line)}}
.explanation{{background:var(--card);border-left:4px solid var(--accent);padding:12px}} .dialog-actions{{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}}
@media(max-width:800px){{main{{padding:14px}}.detail-grid,.variant-grid,.deck-columns,.change-box,.lab-controls{{grid-template-columns:1fr}} th,td{{padding:7px}}}}
</style></head><body><main>
<h1>Metagame online do Limitless</h1>
<div class="sub">Gerado em {generated} · Pokémon TCG {html.escape(args.formato)} · torneios encerrados · {period_label} · {players_label}</div>
<div class="cards">
  <div class="card"><strong>{len(tournaments)}</strong>torneios analisados</div>
  <div class="card"><strong>{data["total_entries"]}</strong>decklists/entradas</div>
  <div class="card"><strong>{len(data["deck_stats"])}</strong>arquétipos do Limitless</div>
  <div class="card"><strong>{data["valid_matches"]}</strong>partidas válidas</div>
  <div class="card"><strong>{data["valid_bo1_matches"]}</strong>partidas BO1</div>
  <div class="card"><strong>{data["valid_bo3_matches"]}</strong>partidas BO3</div>
</div>
{''.join(recommendations)}
<p class="note">Os rankings separam fases BO1 e BO3. O WR esperado é ponderado pelo campo e suavizado para não supervalorizar amostras pequenas. A chance em cinco rodadas usa um modelo binomial. As alterações de lista são associações observadas, não garantias causais.</p>

{laboratory_section}

{user_section}

<h2>Ranking para torneio MD1 de cinco rodadas</h2>
<div class="table-wrap"><table><thead><tr><th>#</th><th>Deck</th><th>Meta BO1</th><th>Entradas</th><th>Partidas</th><th>WR ajustado</th><th>5-0</th><th>4-1+</th><th>3-2+</th><th>Confiança</th><th>Lista</th></tr></thead><tbody>{ranking_rows("BO1")}</tbody></table></div>

<h2>Ranking para torneio MD3 de cinco rodadas</h2>
<div class="table-wrap"><table><thead><tr><th>#</th><th>Deck</th><th>Meta BO3</th><th>Entradas</th><th>Partidas</th><th>WR ajustado</th><th>5-0</th><th>4-1+</th><th>3-2+</th><th>Confiança</th><th>Lista</th></tr></thead><tbody>{ranking_rows("BO3")}</tbody></table></div>

<h2>Análise geral de todos os decks</h2>
<input id="deckSearch" placeholder="Filtrar deck..." oninput="filterDecks(this.value)">
<div class="table-wrap"><table id="deckTable"><thead><tr><th>Deck</th><th>Jogadores</th><th>Meta</th><th>Torneios</th><th>Títulos</th><th>Top 8</th><th>W-L-T</th><th>WR geral</th><th>WR sem espelho</th></tr></thead><tbody>{''.join(deck_rows)}</tbody></table></div>

<h2>Matriz dos 15 decks mais usados</h2>
<p class="note">Passe o mouse sobre uma célula para ver o recorde e o número de partidas. Todos os confrontos estão em matchups.csv.</p>
<div class="table-wrap"><table><thead><tr>{matrix_header}</tr></thead><tbody>{''.join(matrix_rows)}</tbody></table></div>

<h2>Matchups e melhores listas por arquétipo</h2>
{''.join(details_sections)}

<h2>Torneios considerados</h2>
<details><summary>Mostrar {len(tournaments)} torneios</summary><div class="table-wrap"><table><thead><tr><th>Torneio</th><th>Data</th><th>Jogadores</th><th>Formato</th><th>Modos</th></tr></thead><tbody>{''.join(tournament_rows)}</tbody></table></div></details>

<h2>Arquivos gerados</h2>
<p class="downloads"><a href="decks.csv">decks.csv</a><a href="matchups.csv">matchups.csv</a><a href="decklists.csv">decklists.csv</a><a href="melhores_listas.csv">melhores_listas.csv</a><a href="variantes_recomendadas.csv">variantes_recomendadas.csv</a><a href="ranking_md1.csv">ranking_md1.csv</a><a href="ranking_md3.csv">ranking_md3.csv</a><a href="torneios.csv">torneios.csv</a></p>
<p class="note">Fonte: páginas públicas e API oficial do Limitless TCG. Partidas com bye, adversário ausente, double loss ou jogador sem correspondência foram ignoradas ({data["skipped_matches"]} ocorrências).</p>
</main>{''.join(dialogs)}{laboratory_dialog}<script>
function filterDecks(q){{q=q.toLowerCase();document.querySelectorAll('#deckTable tbody tr').forEach(r=>r.style.display=r.dataset.search.includes(q)?'':'none')}}
function openList(id){{document.getElementById(id).showModal()}}
function closeList(id){{document.getElementById(id).close()}}
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{{if(e.target===d)d.close()}}))
</script>{laboratory_script}</body></html>"""


def parse_cli_date(value: str) -> datetime:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "use a data no formato AAAA-MM-DD, por exemplo 2026-07-16"
        ) from exc
    return parsed.replace(tzinfo=timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analisa decks dos torneios online encerrados do Limitless nas ultimas 4 semanas."
    )
    parser.add_argument("--dias", type=int, default=28, help="Janela em dias (padrao: 28)")
    parser.add_argument(
        "--data-inicial",
        type=parse_cli_date,
        default=None,
        metavar="AAAA-MM-DD",
        help="Usa todo o historico a partir desta data, ignorando --dias",
    )
    parser.add_argument("--min-jogadores", type=int, default=21, help="Minimo de jogadores por torneio (padrao: 21)")
    parser.add_argument("--formato", default="STANDARD", help="Formato do Limitless ou TODOS (padrao: STANDARD)")
    parser.add_argument("--top-listas", type=int, default=5, help="Melhores listas por deck (padrao: 5)")
    parser.add_argument("--amostra-minima", type=int, default=20, help="Entradas BO1 minimas para ranking MD1")
    parser.add_argument("--partidas-minimas", type=int, default=50, help="Partidas BO1 minimas para ranking MD1")
    parser.add_argument("--amostra-minima-md3", type=int, default=8, help="Entradas BO3 minimas para ranking MD3")
    parser.add_argument("--partidas-minimas-md3", type=int, default=20, help="Partidas BO3 minimas para ranking MD3")
    parser.add_argument("--min-jogos-matchup", type=int, default=10, help="Jogos para considerar matchup coberto")
    parser.add_argument("--forca-prior", type=float, default=12.0, help="Suavizacao dos matchups pequenos")
    parser.add_argument("--forca-prior-variante", type=float, default=20.0, help="Suavizacao de variantes pequenas")
    parser.add_argument("--min-listas-variante", type=int, default=2, help="Listas minimas para sugerir uma variante")
    parser.add_argument("--min-partidas-variante", type=int, default=8, help="Partidas minimas para sugerir uma variante")
    parser.add_argument("--max-trocas", type=int, default=6, help="Maximo de trocas contra a lista-base")
    parser.add_argument(
        "--minha-lista", "--lista", dest="minha_lista", type=Path,
        help="Arquivo TXT exportado do PTCG Live para receber recomendacoes",
    )
    parser.add_argument("--chave-api", default=os.environ.get("LIMITLESS_API_KEY"), help="Chave opcional da API Limitless")
    parser.add_argument("--saida", type=Path, default=None, help="Pasta de saida")
    parser.add_argument("--nao-abrir", action="store_true", help="Nao abre o relatorio no navegador")
    parser.add_argument("--sem-cache", action="store_true", help="Ignora o cache local")
    parser.add_argument("--max-torneios", type=int, default=None, help=argparse.SUPPRESS)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.dias < 1 or args.min_jogadores < 1:
        raise SystemExit("--dias e --min-jogadores devem ser positivos")
    script_dir = Path(__file__).resolve().parent
    cache = Cache(script_dir / ".cache_limitless", disabled=args.sem_cache)
    output = args.saida or script_dir / f"relatorio_limitless_{datetime.now().strftime('%Y-%m-%d')}"
    output.mkdir(parents=True, exist_ok=True)

    period_log = (
        f"desde {args.data_inicial.strftime('%d/%m/%Y')}"
        if args.data_inicial
        else f"dos ultimos {args.dias} dias"
    )
    log(f"1/5 Buscando torneios encerrados e online {period_log}...")
    tournaments = fetch_tournaments(args, cache)
    if not tournaments:
        log("Nenhum torneio encontrado com os filtros informados.")
        return 1
    log(f"  {len(tournaments)} torneios passaram pelos filtros.")

    log("2/5 Baixando detalhes dos torneios...")
    loaded = []
    errors = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {executor.submit(load_tournament_details, t, cache): t for t in tournaments}
        for index, future in enumerate(as_completed(future_map), start=1):
            tournament = future_map[future]
            try:
                loaded.append(future.result())
            except Exception as exc:
                errors.append((tournament["name"], str(exc)))
            if index % 10 == 0 or index == len(future_map):
                log(f"  {index}/{len(future_map)} torneios processados")
    tournaments = sorted(loaded, key=lambda item: item["date"], reverse=True)
    if not tournaments:
        log("Nao foi possivel carregar detalhes de nenhum torneio.")
        return 1

    log("3/5 Buscando decklists completas e pareamentos pela API oficial...")
    gate = ApiRateGate(bool(args.chave_api))
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {
            executor.submit(load_api_tournament, t, cache, gate, args.chave_api): t for t in tournaments
        }
        for index, future in enumerate(as_completed(future_map), start=1):
            tournament = future_map[future]
            try:
                entries, pairings, catalog = future.result()
                tournament["entries"] = entries
                tournament["pairings"] = pairings
                tournament["card_catalog"] = catalog
            except Exception as exc:
                tournament["entries"] = []
                tournament["pairings"] = []
                tournament["card_catalog"] = {}
                errors.append((tournament["name"], f"API: {exc}"))
            if index % 10 == 0 or index == len(future_map):
                log(f"  {index}/{len(future_map)} torneios completos processados")

    tournaments = [t for t in tournaments if t.get("entries")]
    if not tournaments:
        log("Nao foi possivel carregar decklists de nenhum torneio.")
        return 1

    log("4/5 Calculando metagame, variantes e rankings MD1/MD3...")
    data = process_data(tournaments)
    rankings = {
        "BO1": build_mode_ranking(data, args, "BO1"),
        "BO3": build_mode_ranking(data, args, "BO3"),
    }
    variants = build_variant_analysis(data, args)
    user_analysis = analyze_user_list(args.minha_lista, data, variants, args)
    write_csvs(output, tournaments, data, rankings, variants, args)

    report = build_html(tournaments, data, rankings, variants, user_analysis, args)
    report_path = output / "relatorio.html"
    report_path.write_text(report, encoding="utf-8")
    # Mantém a raiz do servidor estático abrindo o relatório diretamente.
    (output / "index.html").write_text(report, encoding="utf-8")
    if errors:
        (output / "erros.txt").write_text(
            "\n".join(f"{name}: {message}" for name, message in errors), encoding="utf-8"
        )

    log("5/5 Pronto.")
    log(f"Relatorio: {report_path}")
    if errors:
        log(f"Aviso: {len(errors)} falhas parciais foram registradas em erros.txt")
    if not args.nao_abrir:
        webbrowser.open(report_path.resolve().as_uri())
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("\nExecucao interrompida. O que ja foi baixado ficou salvo no cache.")
        raise SystemExit(130)
