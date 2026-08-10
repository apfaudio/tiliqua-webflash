#!/usr/bin/env python3
import argparse
import shutil
import os
import urllib.request
import json
import zipfile
import re
import hashlib
import tarfile
from pathlib import Path


# Factory mapping order: defines which bitstreams go to which slots
# Format: (bitstream_prefix, slot) where slot=None means bootloader
BITSTREAM_SKIPLIST = [
    'usb-audio',
    'usb-host',
    'bootstub',
]

FACTORY_SLOT_ORDER = [
    ('bootloader', None),
    ('xbeam', 0),
    ('polysyn', 1),
    ('macro-osc', 2),
    ('sid', 3),
    ('selftest', 4),
    ('sampler', 5),
    ('dsp-nco', 6),
    ('vsynth', 7),
]


def parse_hw_rev(filename):
    """Parse hardware revision from filename like 'foo-r5.tar.gz' -> 5"""
    match = re.search(r'-r(\d+)\.tar\.gz$', filename)
    if match:
        return int(match.group(1))
    return None


def bitstream_key(filename):
    """Stable key for a bitstream archive, ignoring version and hw revision."""
    stem = re.sub(r'-r\d+\.tar\.gz$', '', filename)
    return re.sub(r'-(v[\d.]+|[0-9a-f]{6,})$', '', stem)


def load_bitstream_meta(project_root):
    """Load author/docs metadata. Missing file just means no links are shown."""
    meta_path = project_root / "bitstream-meta.json"
    if not meta_path.exists():
        print("No bitstream-meta.json found - author/docs links will be omitted")
        return {}
    return json.loads(meta_path.read_text())


def resolve_bitstream_meta(filename, meta, default_key):
    """Find the metadata entry for a bitstream."""
    entries = meta.get('bitstreams', {})
    key = bitstream_key(filename)

    entry = entries.get(key)
    if entry is None:
        candidates = [k for k in entries if key.startswith(k + '-')]
        if candidates:
            entry = entries[max(candidates, key=len)]

    default = meta.get('defaults', {}).get(default_key)
    if entry is None and default is None:
        raise ValueError(
            f"No bitstream-meta.json entry for '{key}' ({filename}), and no "
            f"default for this folder. Add a '{key}' entry with author/docs."
        )

    resolved = dict(default or {})
    resolved.update({k: v for k, v in (entry or {}).items() if v})
    return {k: v for k, v in resolved.items() if v}


def read_manifest(bitstream_file):
    """Read manifest.json out of a bitstream archive. Returns {} on failure."""
    try:
        with tarfile.open(bitstream_file, 'r:gz') as tar:
            manifest_member = tar.extractfile('manifest.json')
            if manifest_member:
                return json.loads(manifest_member.read().decode('utf-8'))
    except Exception as e:
        print(f"Warning: Could not read manifest from {bitstream_file.name}: {e}")
    return {}


def classify_bitstream(manifest_data):
    """Group a bitstream by the kind of video output its manifest declares."""
    if not manifest_data:
        return None
    video_field = manifest_data.get('help', {}).get('video')
    if video_field == '<match-bootloader>':
        return 'Dynamic video (with CPU)'
    if video_field == '<none>' or video_field is None:
        return 'Audio-only'
    return f'Static video ({video_field})'


def flatten_bitstreams_directory(bitstreams_dir):
    """Flatten subdirectories by moving all .tar.gz files to root."""
    if not bitstreams_dir.exists():
        return

    print("Flattening bitstreams directory structure...")
    moved_count = 0

    for subdir in list(bitstreams_dir.iterdir()):
        if subdir.is_dir():
            for tar_file in subdir.glob("*.tar.gz"):
                dest = bitstreams_dir / tar_file.name
                if dest.exists():
                    print(f"Warning: {tar_file.name} already exists, skipping")
                    continue
                shutil.move(str(tar_file), str(dest))
                print(f"Moved {tar_file.name}")
                moved_count += 1
            # Remove subdirectory if empty
            try:
                subdir.rmdir()
            except OSError:
                print(f"Warning: {subdir.name} not empty, keeping it")

    if moved_count > 0:
        print(f"Flattened {moved_count} bitstream(s)")


def download_latest_bitstreams(project_root):
    """Download bitstreams.zip from the latest GitHub release."""
    bitstreams_dir = project_root / "bitstreams"

    # Check if bitstreams already exist (either in root or subdirectories)
    if bitstreams_dir.exists():
        root_bitstreams = list(bitstreams_dir.glob("*.tar.gz"))
        subdir_bitstreams = list(bitstreams_dir.glob("*/*.tar.gz"))
        all_bitstreams = root_bitstreams + subdir_bitstreams

        if all_bitstreams:
            print(f"Found {len(all_bitstreams)} existing bitstream(s) - skipping download")
            return

    print("Fetching latest release from GitHub...")

    api_url = "https://api.github.com/repos/apfaudio/tiliqua/releases/latest"

    headers = {}
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    else:
        print("GITHUB_TOKEN not set - using anonymous API access (low rate limit)")

    try:
        with urllib.request.urlopen(urllib.request.Request(api_url, headers=headers)) as response:
            release_data = json.loads(response.read().decode())

        release_tag = release_data.get('tag_name', 'unknown')
        print(f"Latest release: {release_tag}")

        # Find bitstreams.zip asset
        bitstreams_asset = None
        for asset in release_data.get('assets', []):
            if asset['name'] == 'bitstreams.zip':
                bitstreams_asset = asset
                break

        if not bitstreams_asset:
            raise RuntimeError(f"No bitstreams.zip asset in release {release_tag}")

        download_url = bitstreams_asset['browser_download_url']
        file_size = bitstreams_asset['size']
        print(f"Downloading bitstreams.zip ({file_size / (1024*1024):.1f} MB)...")

        # Download to temporary location with progress bar
        zip_path = project_root / "bitstreams.zip"

        def progress_hook(block_count, block_size, total_size):
            downloaded = block_count * block_size
            percent = min(100, (downloaded / total_size) * 100)
            bar_length = 40
            filled = int(bar_length * downloaded / total_size)
            bar = '=' * filled + '-' * (bar_length - filled)
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            print(f'\r[{bar}] {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)', end='', flush=True)

        urllib.request.urlretrieve(download_url, zip_path, progress_hook)
        print()  # New line after progress bar
        print(f"Downloaded to {zip_path}")

        # Extract to bitstreams/ directory
        if bitstreams_dir.exists():
            shutil.rmtree(bitstreams_dir)
        bitstreams_dir.mkdir()

        print(f"Extracting bitstreams to {bitstreams_dir}...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(bitstreams_dir)

        # Clean up zip file
        zip_path.unlink()

        # Count extracted files
        bitstream_count = len(list(bitstreams_dir.glob("*.tar.gz")))
        print(f"Extracted {bitstream_count} bitstream(s)")

    except Exception as e:
        raise RuntimeError(f"Could not fetch release bitstreams: {e}") from e


def build_application():
    project_root = Path(__file__).parent.parent

    # Download latest bitstreams from GitHub
    download_latest_bitstreams(project_root)

    # Flatten bitstreams directory structure (even if we didn't download)
    flatten_bitstreams_directory(project_root / "bitstreams")

    build_dir = project_root / "build"

    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir()

    # Create subdirectories for Python modules
    (build_dir / "tiliqua" / "flash").mkdir(parents=True)
    (build_dir / "tiliqua" / "build").mkdir(parents=True)
    (build_dir / "rs" / "manifest" / "src").mkdir(parents=True)

    # Create bitstreams directory
    (build_dir / "bitstreams").mkdir(parents=True)

    files_to_copy = [
        ("src/index.html", "index.html"),
        ("src/coi-serviceworker.js", "coi-serviceworker.js"),
        ("src/pixeldocs.js", "pixeldocs.js"),
        ("src/tiliqua.png", "tiliqua.png"),
        ("src/font9x15.png", "font9x15.png"),
        ("src/font9x15b.png", "font9x15b.png"),
        # Python flash module
        ("tiliqua/gateware/src/tiliqua/flash/__init__.py", "tiliqua/flash/__init__.py"),
        ("tiliqua/gateware/src/tiliqua/flash/archive_loader.py", "tiliqua/flash/archive_loader.py"),
        ("tiliqua/gateware/src/tiliqua/flash/spiflash_layout.py", "tiliqua/flash/spiflash_layout.py"),
        ("tiliqua/gateware/src/tiliqua/flash/openfpgaloader.py", "tiliqua/flash/openfpgaloader.py"),
        # Python build types module (skip __init__.py, we'll create empty one)
        ("tiliqua/gateware/src/tiliqua/build/types.py", "tiliqua/build/types.py"),
        # Rust manifest Python bindings
        ("tiliqua/gateware/src/rs/manifest/src/lib.py", "rs/manifest/src/lib.py"),
        ("tiliqua/gateware/src/rs/manifest/src/lib.rs", "rs/manifest/src/lib.rs"),
    ]

    for src_path, dest_name in files_to_copy:
        src = project_root / src_path
        dest = build_dir / dest_name

        if not src.exists():
            raise FileNotFoundError(f"Source file not found: {src}")

        shutil.copy2(src, dest)
        print(f"Copied {src_path} -> build/{dest_name}")

    # Create __init__.py files for module structure
    (build_dir / "tiliqua" / "__init__.py").touch()
    (build_dir / "rs" / "__init__.py").touch()
    (build_dir / "rs" / "manifest" / "__init__.py").touch()
    (build_dir / "rs" / "manifest" / "src" / "__init__.py").touch()

    # Copy bitstream archives
    bitstreams_dest = build_dir / "bitstreams"
    bitstreams_list = []
    meta = load_bitstream_meta(project_root)

    # Where a bitstream came from, which is independent of how it is categorized
    # below - every source is grouped by video type in the same way.
    sources = [
        ("bitstreams", "release", True, "release"),
        ("bitstreams-community", "community", False, None),
        ("bitstreams-preview", "preview", False, "preview"),
    ]

    for dir_name, origin, apply_skiplist, default_key in sources:
        src_dir = project_root / dir_name
        if not src_dir.exists():
            print(f"No {dir_name}/ directory found - skipping")
            continue

        copied_count = 0
        for bitstream_file in sorted(src_dir.glob("*.tar.gz")):
            if apply_skiplist and any(p in bitstream_file.name for p in BITSTREAM_SKIPLIST):
                print(f"Skipped bitstream: {bitstream_file.name}")
                continue

            shutil.copy2(bitstream_file, bitstreams_dest / bitstream_file.name)
            manifest_data = read_manifest(bitstream_file)

            entry = {
                'name': bitstream_file.name,
                'size': bitstream_file.stat().st_size,
                'url': f'bitstreams/{bitstream_file.name}',
                'hw_rev': parse_hw_rev(bitstream_file.name),
                'origin': origin,
                'bitstream_type': classify_bitstream(manifest_data),
                'title': manifest_data.get('name'),
                'help': manifest_data.get('help'),
            }
            entry.update(resolve_bitstream_meta(bitstream_file.name, meta, default_key))
            bitstreams_list.append(entry)
            copied_count += 1

        print(f"Copied {copied_count} bitstream(s) from {dir_name}/")

    if not any(b['origin'] == 'release' for b in bitstreams_list):
        raise RuntimeError("No released bitstreams were copied")

    # Generate factory mappings for each hardware version
    factory_mappings = {}

    # Group bitstreams by hardware version
    bitstreams_by_hw = {}
    for bitstream in bitstreams_list:
        hw_rev = bitstream['hw_rev']
        if hw_rev is not None:
            if hw_rev not in bitstreams_by_hw:
                bitstreams_by_hw[hw_rev] = []
            bitstreams_by_hw[hw_rev].append(bitstream)

    # Create mapping for each hardware version
    for hw_rev, bitstreams in bitstreams_by_hw.items():
        mapping = []

        # For each entry in the factory slot order, find matching bitstream
        for prefix, slot in FACTORY_SLOT_ORDER:
            # Find bitstream matching this prefix
            matching = None
            for bitstream in bitstreams:
                if bitstream['name'].startswith(prefix + '-'):
                    matching = bitstream
                    break

            if matching:
                mapping.append({
                    'slot': slot,
                    'bitstreamName': matching['name']
                })
            else:
                print(f"Warning: No bitstream found for '{prefix}' on R{hw_rev}")

        factory_mappings[hw_rev] = mapping

    # Generate bitstreams.js with the list of available bitstreams and factory mappings
    bitstreams_js_content = f"""// Auto-generated list of available bitstreams
// This file is generated during the build process

export const AVAILABLE_BITSTREAMS = {json.dumps(bitstreams_list, indent=2)};

// Factory mappings for each hardware version
// Maps slot numbers to bitstream names for the "Update All" feature
export const FACTORY_MAPPINGS = {json.dumps(factory_mappings, indent=2)};
"""

    bitstreams_js_path = build_dir / "bitstreams.js"
    bitstreams_js_path.write_text(bitstreams_js_content)
    print(f"Generated bitstreams.js with {len(bitstreams_list)} bitstream(s)")
    print(f"Generated factory mappings for hardware versions: {list(factory_mappings.keys())}")

    add_cache_busting(build_dir)

    print(f"Build completed successfully in {build_dir}")


def add_cache_busting(build_dir):
    """Append ?v=<hash> to every reference to an asset we ship ourselves."""
    def content_hash(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()[:12]

    def bust(referrer, assets):
        text = referrer.read_text()
        for asset in assets:
            name = asset.name
            hashed = f"{name}?v={content_hash(asset)}"
            for quote in ("'", '"'):
                for prefix in ("./", ""):
                    text = text.replace(
                        f"{quote}{prefix}{name}{quote}",
                        f"{quote}{prefix}{hashed}{quote}",
                    )
            print(f"Cache-busted {name} in {referrer.name}: {hashed}")
        referrer.write_text(text)

    pixeldocs = build_dir / "pixeldocs.js"
    bust(pixeldocs, [
        build_dir / "tiliqua.png",
        build_dir / "font9x15.png",
        build_dir / "font9x15b.png",
    ])

    bust(build_dir / "index.html", [
        build_dir / "bitstreams.js",
        pixeldocs,
    ])


def serve_application():
    from flask import Flask, send_from_directory

    build_dir = Path(__file__).parent.parent / "build"

    if not build_dir.exists():
        raise FileNotFoundError(f"Build directory not found: {build_dir}. Run with --build-only first.")

    app = Flask(__name__)

    @app.after_request
    def add_security_headers(response):
        response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
        return response

    @app.route('/')
    def serve_index():
        return send_from_directory(build_dir, 'index.html')

    @app.route('/<path:path>')
    def serve_file(path):
        return send_from_directory(build_dir, path)

    port = int(os.environ.get('PORT', 8000))
    print(f"Serving from {build_dir} on http://localhost:{port}")
    app.run(host='localhost', port=port, debug=True)


def main():
    parser = argparse.ArgumentParser(description='Build and/or serve tiliqua-webflash2')
    parser.add_argument('--build-only', action='store_true',
                       help='Only build the application, do not serve')

    args = parser.parse_args()

    build_application()

    if args.build_only:
        print("Build-only mode: exiting after build")
        return

    serve_application()


if __name__ == "__main__":
    main()
