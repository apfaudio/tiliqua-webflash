#!/usr/bin/env python3
import argparse
import shutil
import os
from pathlib import Path


def build_application():
    project_root = Path(__file__).parent.parent
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
            bitstreams_list.append({
                'name': bitstream_file.name,
                'size': bitstream_file.stat().st_size,
                'url': f'bitstreams/{bitstream_file.name}'
            })
            copied_count += 1

        if copied_count == 0:
            print("No .tar.gz bitstreams found in bitstreams/ directory")
    else:
        print("No bitstreams/ directory found - skipping bitstream copy")

    # Generate bitstreams.js with the list of available bitstreams
    bitstreams_js_content = f"""// Auto-generated list of available bitstreams
// This file is generated during the build process

export const AVAILABLE_BITSTREAMS = {bitstreams_list};
"""

    bitstreams_js_path = build_dir / "bitstreams.js"
    bitstreams_js_path.write_text(bitstreams_js_content)
    print(f"Generated bitstreams.js with {len(bitstreams_list)} bitstream(s)")

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
