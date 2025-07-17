import { getPyodide, loadedArchives } from './globals.js';
import { displayRegions } from './ui-helpers.js';

// Tar archive reader
class TarArchive {
    constructor() {
        this.files = new Map();
    }

    set(name, data) {
        this.files.set(name, data);
    }

    get(name) {
        const data = this.files.get(name);
        if (!data) return null;
        
        return {
            arrayBuffer: () => Promise.resolve(data),
            text: () => Promise.resolve(new TextDecoder().decode(data))
        };
    }
}

export async function readTarGz(file) {
    const archive = new TarArchive();
    const fileData = await file.arrayBuffer();
    const inflated = pako.inflate(new Uint8Array(fileData));
    
    let offset = 0;
    while (offset < inflated.length) {
        const header = inflated.slice(offset, offset + 512);
        
        if (header.every(byte => byte === 0)) {
            break;
        }
        
        const filename = new TextDecoder().decode(header.slice(0, 100)).split('\0')[0];
        const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim();
        const size = parseInt(sizeStr, 8);
        
        offset += 512;
        
        if (size > 0) {
            const content = inflated.slice(offset, offset + size);
            archive.set(filename, content);
            offset += (Math.floor((size + 511) / 512) * 512);
        }
    }
    
    return archive;
}

export async function loadArchive(file, slotId) {
    const pyodide = getPyodide();
    if (!pyodide) {
        throw new Error("Pyodide not initialized yet");
    }
    
    const archive = await readTarGz(file);
    
    // Parse manifest
    const manifest = JSON.parse(await archive.get('manifest.json').text());
    
    // Convert files to Python-compatible format
    const files = {};
    for (const [name, data] of archive.files) {
        files[name] = data;
    }
    
    // Don't store the archive object itself to avoid circular references
    loadedArchives.set(slotId, {  // Keep original slotId
        archive, 
        manifest,
        files
    });

    const manifestView = document.getElementById(`regions-${slotId}`);
    if (manifestView) {
        manifestView.classList.remove('current-flash');
        manifestView.classList.add('pending-flash');
        
        // Remove old status and add new one
        const existingStatus = manifestView.querySelector('.manifest-status');
        if (existingStatus) existingStatus.remove();
        
        const status = document.createElement('span');
        status.className = 'manifest-status pending';
        status.textContent = 'Ready to Flash';
        manifestView.appendChild(status);
    }
    
    // Display manifest
    displayRegions(slotId, manifest);
}