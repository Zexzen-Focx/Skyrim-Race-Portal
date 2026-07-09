#!/usr/bin/env python3
"""Prepare data/mods.json for public deploy: hash passcodes and scramble gated links."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

XOR_KEY = b"zexzen-portal-v1"
HASH_PEPPER = "zexzen-portal-v1"


def encode(value: str) -> str:
    if not value or value.startswith("enc:"):
        return value
    xored = bytes(byte ^ XOR_KEY[index % len(XOR_KEY)] for index, byte in enumerate(value.encode("utf-8")))
    return "enc:" + base64.b64encode(xored).decode("ascii")


def decode(value: str) -> str:
    if not value or not value.startswith("enc:"):
        return value
    raw = base64.b64decode(value[4:])
    return bytes(byte ^ XOR_KEY[index % len(XOR_KEY)] for index, byte in enumerate(raw)).decode("utf-8")


def hash_passcode(passcode: str) -> str:
    payload = f"{HASH_PEPPER}:{passcode}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def is_gated(mod: dict) -> bool:
    return bool(mod.get("passcode") or mod.get("passcodeHash"))


def obfuscate_mod(mod: dict) -> dict:
    updated = dict(mod)
    passcode = updated.pop("passcode", None)

    if passcode:
        updated["passcodeHash"] = hash_passcode(passcode)
        if updated.get("link"):
            updated["link"] = encode(updated["link"])
        if isinstance(updated.get("downloads"), list):
            updated["downloads"] = [
                {**entry, "link": encode(entry["link"])} if entry.get("link") else entry
                for entry in updated["downloads"]
            ]
    else:
        updated.pop("passcodeHash", None)

    return updated


def reveal_mod(mod: dict) -> dict:
    updated = dict(mod)
    updated.pop("passcodeHash", None)

    if updated.get("link"):
        updated["link"] = decode(updated["link"])

    if isinstance(updated.get("downloads"), list):
        updated["downloads"] = [
            {**entry, "link": decode(entry["link"])} if entry.get("link") else entry
            for entry in updated["downloads"]
        ]

    return updated


def process_file(path: Path, *, decode_values: bool) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    mods = data.get("mods")
    if not isinstance(mods, list):
        raise ValueError('Expected a "mods" array')

    transform = reveal_mod if decode_values else obfuscate_mod
    data["mods"] = [transform(mod) for mod in mods]
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare gated mod secrets for public deploy")
    parser.add_argument(
        "path",
        nargs="?",
        default=str(Path(__file__).resolve().parent.parent / "data" / "mods.json"),
    )
    parser.add_argument(
        "--decode",
        action="store_true",
        help="Decode scrambled links for editing (passcodes cannot be restored from hashes)",
    )
    args = parser.parse_args()

    path = Path(args.path).resolve()
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    process_file(path, decode_values=args.decode)
    action = "Decoded links in" if args.decode else "Prepared"
    print(f"{action} {path}")
    if args.decode:
        print("Note: passcode hashes were removed; re-add plain passcodes manually if needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
