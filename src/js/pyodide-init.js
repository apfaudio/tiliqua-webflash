import { setPyodide } from './globals.js';
import { showGlobalMessage } from './ui-helpers.js';

// Initialize Pyodide and load flash_core module
export async function initPyodide() {
    const pyodideInstance = await loadPyodide();
    
    // Load the flash_core module
    const flashCoreCode = `${await fetch('flash_core.py').then(r => r.text())}`;
    pyodideInstance.FS.writeFile('/home/pyodide/flash_core.py', flashCoreCode);
    
    // Import the module
    await pyodideInstance.runPythonAsync(`
import sys
sys.path.append('/home/pyodide')
from flash_core import FlashCore, N_MANIFESTS, SLOT_BITSTREAM_BASE, SLOT_SIZE, MANIFEST_SIZE
import json
`);
    
    setPyodide(pyodideInstance);
    
    // Hide loading indicator
    document.getElementById('loading-indicator').classList.remove('show');
    document.getElementById('scan-button').disabled = false;
    showGlobalMessage("Pyodide initialized successfully");
    
    return pyodideInstance;
}