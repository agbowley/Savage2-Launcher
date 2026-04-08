#!/usr/bin/env python3
"""
Manifest Generator for Savage 2 Launcher Patch System

Walks a game directory, computes SHA-256 hashes for every file,
and outputs a manifest.json that the launcher uses for incremental updates.

Usage:
    python generate_manifest.py <game_directory> <version> [output_file]

Options:
    --sync <files_directory>
        After generating the manifest, sync only CHANGED files into the
        given "files/" directory.  Files that are unchanged (same SHA-256)
        compared to the previous manifest are left as-is, so the launcher's
        incremental updater only downloads what actually changed.

        Files that no longer appear in the new manifest are removed from
        the files directory.

Example:
    # Generate manifest only
    python generate_manifest.py ./build/latest 2.2.3.0

    # Generate manifest AND sync changed files into the deploy tree
    python generate_manifest.py ./build/latest 2.2.3.0 ./deploy/latest/manifest.json --sync ./deploy/latest/files

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
import shutil
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


def load_manifest(path: str) -> dict:
    """Load an existing manifest.json, returning an empty files dict on failure."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"version": "", "files": {}}


def sync_files(game_dir: str, manifest: dict, old_manifest: dict, files_dir: str):
    """
    Copy only changed/new files from game_dir into files_dir.
    Remove files from files_dir that no longer appear in the manifest.
    Returns (copied, unchanged, removed) counts.
    """
    game_dir = os.path.normpath(game_dir)
    files_dir = os.path.normpath(files_dir)
    old_files = old_manifest.get("files", {})
    new_files = manifest["files"]

    copied = 0
    unchanged = 0

    for rel_path, entry in new_files.items():
        old_entry = old_files.get(rel_path)
        dest = os.path.join(files_dir, rel_path.replace("/", os.sep))

        # Skip if the hash hasn't changed and the file exists in the deploy dir
        if old_entry and old_entry["sha256"] == entry["sha256"] and os.path.exists(dest):
            unchanged += 1
            continue

        # Copy the changed/new file
        src = os.path.join(game_dir, rel_path.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(src, dest)
        copied += 1

    # Remove files that are no longer in the manifest
    removed = 0
    for rel_path in old_files:
        if rel_path not in new_files:
            dest = os.path.join(files_dir, rel_path.replace("/", os.sep))
            if os.path.exists(dest):
                os.remove(dest)
                removed += 1

    # Clean up empty directories
    for dirpath, dirnames, filenames in os.walk(files_dir, topdown=False):
        if not dirnames and not filenames and dirpath != files_dir:
            os.rmdir(dirpath)

    return copied, unchanged, removed


def main():
    # Parse --sync flag
    args = sys.argv[1:]
    sync_dir = None
    if "--sync" in args:
        idx = args.index("--sync")
        if idx + 1 >= len(args):
            print("Error: --sync requires a directory argument.")
            sys.exit(1)
        sync_dir = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    if len(args) < 2:
        print(f"Usage: {sys.argv[0]} <game_directory> <version> [output_file] [--sync <files_directory>]")
        print(f"Example: {sys.argv[0]} ./build/latest 2.2.3.0 ./deploy/latest/manifest.json --sync ./deploy/latest/files")
        sys.exit(1)

    game_dir = args[0]
    version = args[1]
    output_file = args[2] if len(args) > 2 else "manifest.json"

    if not os.path.isdir(game_dir):
        print(f"Error: '{game_dir}' is not a directory.")
        sys.exit(1)

    print(f"Scanning: {game_dir}")
    print(f"Version:  {version}")

    # Load the previous manifest for diffing (if it exists)
    old_manifest = load_manifest(output_file)

    manifest = generate_manifest(game_dir, version)

    file_count = len(manifest["files"])
    total_size = sum(f["size"] for f in manifest["files"].values())

    # Ensure output directory exists
    out_dir = os.path.dirname(output_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # Diff summary
    old_files = old_manifest.get("files", {})
    changed = [p for p, e in manifest["files"].items()
               if old_files.get(p, {}).get("sha256") != e["sha256"]]
    removed = [p for p in old_files if p not in manifest["files"]]

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"Manifest written to: {output_file}")
    print(f"  Files:      {file_count}")
    print(f"  Total size: {total_size / (1024 * 1024):.1f} MB")

    if old_files:
        print(f"  Changed:    {len(changed)}")
        print(f"  Removed:    {len(removed)}")
        if changed:
            for p in changed[:20]:
                print(f"    ~ {p}")
            if len(changed) > 20:
                print(f"    ... and {len(changed) - 20} more")
        if removed:
            for p in removed[:10]:
                print(f"    - {p}")
    else:
        print("  (no previous manifest — first generation)")

    # Sync changed files to the deploy directory
    if sync_dir:
        print(f"\nSyncing to: {sync_dir}")
        copied, unchanged, rm = sync_files(game_dir, manifest, old_manifest, sync_dir)
        print(f"  Copied:    {copied}")
        print(f"  Unchanged: {unchanged}")
        print(f"  Removed:   {rm}")


if __name__ == "__main__":
    main()
