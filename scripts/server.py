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
