#!/usr/bin/env python3
import argparse
import shutil
import os
import json
import gzip
import tarfile
from pathlib import Path


def read_manifest_from_tarfile(file_path):
    """Extract manifest.json from a .tar.gz file"""
    try:
        with tarfile.open(file_path, 'r:gz') as tar:
            try:
                manifest_member = tar.getmember('manifest.json')
                manifest_file = tar.extractfile(manifest_member)
                if manifest_file:
                    manifest_data = json.loads(manifest_file.read().decode('utf-8'))
                    return manifest_data
            except KeyError:
                # No manifest.json found
                return None
    except Exception as e:
        print(f"Warning: Could not read manifest from {file_path}: {e}")
        return None

def generate_bitstreams_list(bitstreams_dir, build_dir):
    """Generate a JavaScript file containing the list of available bitstreams"""
    bitstreams = []
    
    # Scan for .tar.gz files in bitstreams directory
    for file_path in bitstreams_dir.glob("*.tar.gz"):
        if file_path.is_file():
            stat = file_path.stat()
            
            # Try to read manifest
            manifest = read_manifest_from_tarfile(file_path)
            
            # Get name and brief from manifest, fallback to filename
            display_name = file_path.stem.replace('.tar', '')  # Default fallback
            brief = None
            
            if manifest:
                display_name = manifest.get('name', display_name)
                brief = manifest.get('brief', None)
            
            bitstreams.append({
                'filename': file_path.name,
                'name': display_name,
                'brief': brief,
                'size': stat.st_size
            })
    
    # Sort by name
    bitstreams.sort(key=lambda x: x['name'])
    
    # Generate JavaScript file
    js_content = f"""// Auto-generated bitstreams list
export const AVAILABLE_BITSTREAMS = {json.dumps(bitstreams, indent=2)};
"""
    
    # Write to build directory
    js_file = build_dir / "js" / "bitstreams-list.js"
    with open(js_file, 'w') as f:
        f.write(js_content)
    
    print(f"Generated bitstreams list with {len(bitstreams)} files -> build/js/bitstreams-list.js")


def build_application():
    project_root = Path(__file__).parent.parent
    build_dir = project_root / "build"
    
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir()
    
    files_to_copy = [
        ("src/index.html", "index.html"),
        ("src/bg.jpg", "bg.jpg"),
        ("src/styles.css", "styles.css"),
        ("tiliqua/gateware/src/tiliqua/flash_core.py", "flash_core.py"),
        ("coi-serviceworker/coi-serviceworker.js", "coi-serviceworker.js"),
    ]
    
    for src_path, dest_name in files_to_copy:
        src = project_root / src_path
        dest = build_dir / dest_name
        
        if not src.exists():
            raise FileNotFoundError(f"Source file not found: {src}")
        
        shutil.copy2(src, dest)
        print(f"Copied {src_path} -> build/{dest_name}")
    
    # Copy entire js directory
    js_src_dir = project_root / "src" / "js"
    js_dest_dir = build_dir / "js"
    
    if js_src_dir.exists():
        shutil.copytree(js_src_dir, js_dest_dir)
        print(f"Copied src/js/ -> build/js/")
    
    # Copy bitstreams directory if it exists
    bitstreams_src_dir = project_root / "bitstreams"
    bitstreams_dest_dir = build_dir / "bitstreams"
    
    if bitstreams_src_dir.exists():
        shutil.copytree(bitstreams_src_dir, bitstreams_dest_dir)
        print(f"Copied bitstreams/ -> build/bitstreams/")
    else:
        # Create empty bitstreams directory
        bitstreams_dest_dir.mkdir()
        print(f"Created empty build/bitstreams/ directory")
    
    # Generate bitstreams list JavaScript file
    generate_bitstreams_list(bitstreams_dest_dir, build_dir)
    
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
    
    @app.route('/bitstreams/<filename>')
    def serve_bitstream(filename):
        # Force serving .tar.gz files with correct gzip content type
        if filename.endswith('.tar.gz'):
            response = send_from_directory(build_dir / 'bitstreams', filename)
            response.headers['Content-Type'] = 'application/gzip'
            response.headers['Content-Encoding'] = 'identity'  # Prevent auto-decompression
            return response
        return send_from_directory(build_dir / 'bitstreams', filename)
    
    @app.route('/<path:path>')
    def serve_file(path):
        return send_from_directory(build_dir, path)
    
    port = int(os.environ.get('PORT', 8000))
    print(f"Serving from {build_dir} on http://localhost:{port}")
    app.run(host='localhost', port=port, debug=True)


def main():
    parser = argparse.ArgumentParser(description='Build and/or serve tiliqua-webflash')
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
