#!/usr/bin/env python3
"""Executa o coletor legado a partir de uma configuração de era versionada."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--era-config", type=Path, default=Path("configs/eras/standard-pitch-black.json"))
    parser.add_argument("--output", type=Path, default=Path("site"))
    parser.add_argument("--no-cache", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    era = json.loads(args.era_config.read_text(encoding="utf-8"))
    if not era.get("enabled"):
        raise SystemExit(f"Era desabilitada: {args.era_config}")
    command = [
        sys.executable,
        "analisar_limitless.py",
        "--formato",
        era["collection"]["sourceFormat"],
        "--data-inicial",
        era["startsAt"][:10],
        "--min-jogadores",
        str(era["collection"]["minimumPlayers"]),
        "--saida",
        str(args.output),
        "--nao-abrir",
    ]
    if args.no_cache:
        command.append("--sem-cache")
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
