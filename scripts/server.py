#!/usr/bin/env python3
import argparse
import shutil
import os
import urllib.request
import json
import zipfile
import re
from pathlib import Path


# Factory mapping order: defines which bitstreams go to which slots
# Format: (bitstream_prefix, slot) where slot=None means bootloader
FACTORY_SLOT_ORDER = [
    ('bootloader', None),
    ('xbeam', 0),
    ('polysyn', 1),
    ('macro-osc', 2),
    ('sid', 3),
    ('selftest', 4),
    ('dsp-mdiff', 5),
    ('dsp-nco', 6),
    ('dsp-vocode', 7),
]


def parse_hw_rev(filename):
    """Parse hardware revision from filename like 'foo-r5.tar.gz' -> 5"""
    match = re.search(r'-r(\d+)\.tar\.gz$', filename)
    if match:
        return int(match.group(1))
    return None


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

    try:
        with urllib.request.urlopen(api_url) as response:
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
            print("Warning: No bitstreams.zip found in latest release")
            return

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

    except urllib.error.URLError as e:
        print(f"Error fetching release: {e}")
        print("Continuing with existing bitstreams (if any)...")
    except Exception as e:
        print(f"Error processing bitstreams: {e}")
        print("Continuing with existing bitstreams (if any)...")


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

    # Copy bitstream archives from bitstreams/ directory
    bitstreams_src = project_root / "bitstreams"
    bitstreams_dest = build_dir / "bitstreams"
    bitstreams_list = []

    if bitstreams_src.exists():
        copied_count = 0
        for bitstream_file in sorted(bitstreams_src.glob("*.tar.gz")):
            shutil.copy2(bitstream_file, bitstreams_dest / bitstream_file.name)
            print(f"Copied bitstream: {bitstream_file.name}")

            # Track bitstream info for JS generation
            hw_rev = parse_hw_rev(bitstream_file.name)
            bitstreams_list.append({
                'name': bitstream_file.name,
                'size': bitstream_file.stat().st_size,
                'url': f'bitstreams/{bitstream_file.name}',
                'hw_rev': hw_rev
            })
            copied_count += 1

        if copied_count == 0:
            print("No .tar.gz bitstreams found in bitstreams/ directory")
    else:
        print("No bitstreams/ directory found - skipping bitstream copy")

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

    print(f"Build completed successfully in {build_dir}")


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
