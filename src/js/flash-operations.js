import { runOpenFPGALoader, Exit } from 'https://cdn.jsdelivr.net/npm/@yowasp/openfpgaloader/gen/bundle.js';
import { showGlobalMessage, addToGlobalLog, updateSlotDisplay, updateProgressLog, updateFlashLoadingMessage, updateSlotToFlashedStatus } from './ui-helpers.js';
import { loadedArchives, currentManifests, getPyodide, getTiliquaHwVersion, setCurrentFlashCommand } from './globals.js';

// Make handleFlash global
window.handleFlash = async function(slotId) {
    const pyodide = getPyodide();
    if (!pyodide) {
        showGlobalMessage("Error: Pyodide not initialized yet", 'error');
        return;
    }
    
    const slotData = loadedArchives.get(slotId.toString());
    if (!slotData) return;

    // Show loading with specific operation message
    const bitstreamName = slotData.manifest.name || 'Unnamed bitstream';
    const loadingMessage = slotId === 'bootloader' ? 
        `Flashing '${bitstreamName}' to bootloader` : 
        `Flashing '${bitstreamName}' to Slot ${slotId}`;
    
    document.getElementById('flash-loading').classList.add('show');
    updateFlashLoadingMessage(loadingMessage);
    updateProgressLog();

    try {
        const tiliquaHwVersion = getTiliquaHwVersion();
        if (!tiliquaHwVersion) {
            addToGlobalLog(slotId, "No Tiliqua device connected. Please click 'Scan for Tiliqua' first.", 'error');
            return;
        }

        // Use Python core to process the archive
        const slot = slotId === 'bootloader' ? null : parseInt(slotId);

        // Convert manifest to JSON string to avoid JsProxy issues
        const manifestJson = JSON.stringify(slotData.manifest);
        
        // Convert files to a format we can pass to Python
        const filesList = [];
        for (const [name, data] of Object.entries(slotData.files)) {
            filesList.push([name, Array.from(data)]);
        }
        
        // Pass simple data types to Python
        pyodide.globals.set('manifest_json', manifestJson);
        pyodide.globals.set('files_list', filesList);
        pyodide.globals.set('slot', slot);
        pyodide.globals.set('hw_rev', tiliquaHwVersion);

        const result = await pyodide.runPythonAsync(`
# Parse manifest from JSON
manifest = json.loads(manifest_json)

# Convert files list to dict with bytes
files = {}
for name, data_array in files_list:
    # Convert array of integers back to bytes
    files[name] = bytes(data_array)

core = FlashCore()

# Validate hardware
valid, error = core.validate_hardware(hw_rev, manifest["hw_rev"])
if not valid:
    raise ValueError(error)

# Check if XIP
has_xip, xip_offset = core.check_xip_firmware(manifest)
if has_xip:
    print("Preparing to flash XIP firmware bitstream to bootloader slot...")
else:
    print(f"Preparing to flash bitstream to slot {slot}...")

# Process archive
operations, regions, updated_manifest = core.process_archive(manifest, files, slot)

# Convert to JSON for JavaScript
result = {
    'operations': [
        {
            'filename': op.filename,
            'offset': op.offset,
            'file_type': op.file_type,
            'skip_reset': op.skip_reset,
            'data': bytes(op.data).hex()
        }
        for op in operations
    ],
    'regions': [
        {
            'name': r.name,
            'addr': r.addr,
            'size': r.size,
            'aligned_size': r.aligned_size
        }
        for r in sorted(regions)
    ],
    'updated_manifest': updated_manifest,
    'has_xip': has_xip
}

json.dumps(result)
`);
        
        const processedData = JSON.parse(result);
        
        // Show manifest contents
        if (!processedData.has_xip) {
            addToGlobalLog(slotId, "\nFinal manifest contents:");
            addToGlobalLog(slotId, JSON.stringify(processedData.updated_manifest, null, 2));
        }
        
        // Log regions
        addToGlobalLog(slotId, "\nRegions to be flashed:");
        for (const region of processedData.regions) {
            addToGlobalLog(slotId, `  ${region.name}:
    start: 0x${region.addr.toString(16)}
    end:   0x${(region.addr + region.aligned_size - 1).toString(16)}`);
        }

        // Show commands
        addToGlobalLog(slotId, "\nThe following commands will be executed:");
        for (const op of processedData.operations) {
            const args = [
                "-c", "dirtyJtag",
                "-f",
                "-o", `0x${op.offset.toString(16)}`,
                "--file-type", op.file_type
            ];
            if (op.skip_reset) {
                args.push("--skip-reset");
            }
            addToGlobalLog(slotId, `\t$ openFPGALoader ${args.join(' ')} ${op.filename}`);
        }

        addToGlobalLog(slotId, "\nExecuting flash commands...");

        // Execute operations
        for (const op of processedData.operations) {
            try {
                // Convert hex string back to bytes
                const data = new Uint8Array(op.data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                
                const filesIn = {
                    'data': data
                };
                
                const args = [
                    "-c", "dirtyJtag",
                    "-f",
                    "-o", `0x${op.offset.toString(16)}`,
                    "--file-type", op.file_type
                ];
                
                if (op.skip_reset) {
                    args.push("--skip-reset");
                }
                
                args.push('data');
                
                // Set current command for progress panel
                const commandStr = `openFPGALoader ${args.slice(0, -1).join(' ')} ${op.filename}`;
                setCurrentFlashCommand(commandStr);
                updateProgressLog();
                
                await runOpenFPGALoader(args, filesIn, {
                    stdout: (data) => {
                        if (data) {
                            const text = new TextDecoder().decode(data);
                            addToGlobalLog(slotId, text);
                        }
                    },
                    stderr: (data) => {
                        if (data) {
                            const text = new TextDecoder().decode(data);
                            addToGlobalLog(slotId, `stderr: ${text}`, 'error');
                        }
                    }
                });
            } catch (error) {
                if (error instanceof Exit) {
                    throw new Error(`Command failed with exit code ${error.code}`);
                }
                throw error;
            }
        }
        
        addToGlobalLog(slotId, "\nFlashing completed successfully", 'success');
        
        // Update the slot status to "flashed" on success
        updateSlotToFlashedStatus(slotId, slotData.manifest);
    } catch (error) {
        addToGlobalLog(slotId, `Flash failed: ${error.message}`, 'error');
   } finally {
       setCurrentFlashCommand('');
       document.getElementById('flash-loading').classList.remove('show');
   }
};

export async function readFlashManifests() {
    const pyodide = getPyodide();
    const tiliquaHwVersion = getTiliquaHwVersion();
    if (!pyodide || !tiliquaHwVersion) return;
    
    document.getElementById('flash-loading').classList.add('show');
    updateFlashLoadingMessage('Reading flash contents');
    updateProgressLog();
    showGlobalMessage("Reading current flash contents...");
    
    try {
        // Get manifest addresses from Python
        const manifestAddresses = await pyodide.runPythonAsync(`
from flash_core import get_all_manifest_addresses
import json
json.dumps(get_all_manifest_addresses())
        `);
        
        const addresses = JSON.parse(manifestAddresses);
        const manifestInfos = [];
        
        // Read each manifest
       for (let i = 0; i < addresses.length; i++) {
           const [slot, address] = addresses[i];
            try {
                showGlobalMessage(`Reading slot ${slot} manifest at 0x${address.toString(16)}...`);
                
                // Read 512 bytes from the manifest location
                const args = [
                    "-c", "dirtyJtag",
                    "--dump-flash", "-o", `0x${address.toString(16)}`,
                    "--file-size", "512",
                    "data"
                ];

                if (i < addresses.length - 1) {
                    args.splice(-1, 0, "--skip-reset");
                }
                
                let filesOut = await runOpenFPGALoader(args, {}, {
                    stdout: (data) => {
                        if (data) {
                            const text = new TextDecoder().decode(data);
                            showGlobalMessage(`${text}`);
                        }
                    },
                    stderr: (data) => {
                        if (data) {
                            const text = new TextDecoder().decode(data);
                            console.error(`Error reading manifest: ${text}`);
                        }
                    },
                });
                
                let manifestData = filesOut["data"];
                if (manifestData) {
                    // Process the manifest data in Python
                    pyodide.globals.set('manifest_data', Array.from(manifestData));
                    pyodide.globals.set('slot', slot);
                    pyodide.globals.set('address', address);
                    
                    const result = await pyodide.runPythonAsync(`
from flash_core import ManifestInfo
import json

# Convert array back to bytes
data_bytes = bytes(manifest_data)
info = ManifestInfo(slot, address, data_bytes)
json.dumps(info.to_dict())
                    `);
                    
                    const manifestInfo = JSON.parse(result);
                    manifestInfos.push(manifestInfo);
                    
                    // Store current manifest
                    currentManifests.set(slot.toString(), manifestInfo);
                    
                    // Update UI
                    updateSlotDisplay(slot.toString(), manifestInfo);
                }
                
            } catch (error) {
                console.error(`Failed to read slot ${slot}:`, error);
                showGlobalMessage(`Failed to read slot ${slot}: ${error.message}`, 'error');
            }
        }
        
        // Show summary
        showGlobalMessage("\nFlash content summary:");
        for (const info of manifestInfos) {
            if (info.is_empty) {
                showGlobalMessage(`  Slot ${info.slot}: Empty`);
            } else if (info.is_valid) {
                const name = info.manifest.name || 'Unnamed';
                showGlobalMessage(`  Slot ${info.slot}: ${name} (hw_rev=R${info.manifest.hw_rev})`);
            } else {
                showGlobalMessage(`  Slot ${info.slot}: Invalid/corrupted data`);
            }
        }
        
    } catch (error) {
        showGlobalMessage(`Failed to read flash manifests: ${error.message}`, 'error');
    } finally {
       setCurrentFlashCommand('');
       document.getElementById('flash-loading').classList.remove('show');
    }
}