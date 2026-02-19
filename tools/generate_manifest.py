#!/usr/bin/env python3
"""
Manifest Generator for Savage 2 Launcher Patch System

Walks a game directory, computes SHA-256 hashes for every file,
and outputs a manifest.json that the launcher uses for incremental updates.

Usage:
    python generate_manifest.py <game_directory> <version> [output_file]

Example:
    python generate_manifest.py "C:/Games/Savage 2 CE" "2.2.3.0"
    python generate_manifest.py ./build/latest 2.2.3.0 ./deploy/latest/manifest.json

The output manifest.json looks like:
{
    "version": "2.2.3.0",
    "files": {
        "savage2.exe": { "sha256": "abc123...", "size": 12345678 },
        "game/resources0.s2z": { "sha256": "def456...", "size": 98765432 },
        ...
    }
}

Server Layout:
    Place the manifest.json alongside a "files/" directory containing
    every file listed in the manifest at its relative path:

        latest/
            manifest.json
            files/
                savage2.exe
                game/
                    resources0.s2z
                    ...
"""

import hashlib
import json
import os
import sys


def sha256_file(path: str) -> str:
    """Compute the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(64 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def generate_manifest(game_dir: str, version: str) -> dict:
    """Walk game_dir and build the manifest dict."""
    game_dir = os.path.normpath(game_dir)
    files = {}

    # Files that should never appear in the manifest (they live alongside it, not in the game tree)
    excluded = {"manifest.json", "generate_manifest.py", "generate-manifest.bat"}

    for root, _dirs, filenames in os.walk(game_dir):
        for fname in sorted(filenames):
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, game_dir).replace("\\", "/")

            if rel_path in excluded:
                continue

            file_size = os.path.getsize(full_path)
            file_hash = sha256_file(full_path)

            files[rel_path] = {
                "sha256": file_hash,
                "size": file_size,
            }

    return {
        "version": version,
        "files": files,
    }


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <game_directory> <version> [output_file]")
        print(f"Example: {sys.argv[0]} ./build/latest 2.2.3.0")
        sys.exit(1)

    game_dir = sys.argv[1]
    version = sys.argv[2]
    output_file = sys.argv[3] if len(sys.argv) > 3 else "manifest.json"

    if not os.path.isdir(game_dir):
        print(f"Error: '{game_dir}' is not a directory.")
        sys.exit(1)

    print(f"Scanning: {game_dir}")
    print(f"Version:  {version}")

    manifest = generate_manifest(game_dir, version)

    file_count = len(manifest["files"])
    total_size = sum(f["size"] for f in manifest["files"].values())

    # Ensure output directory exists
    out_dir = os.path.dirname(output_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Manifest written to: {output_file}")
    print(f"  Files:      {file_count}")
    print(f"  Total size: {total_size / (1024 * 1024):.1f} MB")


if __name__ == "__main__":
    main()
