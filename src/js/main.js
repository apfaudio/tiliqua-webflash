import { initPyodide } from './pyodide-init.js';
import { scanForTiliqua } from './device-connection.js';
import { loadArchive } from './archive-processing.js';
import { showTab, addToGlobalLog } from './ui-helpers.js';
import { getTiliquaHwVersion } from './globals.js';
import './flash-operations.js'; // Import for side effects (window.handleFlash)

// Show loading indicator
document.getElementById('loading-indicator').classList.add('show');

// Initialize Pyodide when page loads
initPyodide().catch(err => {
    console.error("Failed to initialize Pyodide:", err);
    document.getElementById('loading-indicator').textContent = "Failed to load Pyodide";
});

// Initialize all event handlers after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Scan button handler
    document.getElementById('scan-button').addEventListener('click', scanForTiliqua);
    
    // Tab button handlers
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (e.target.classList.contains('enabled')) {
                showTab(e.target.dataset.slot);
            }
        });
    });
    
    // File input handlers
    document.querySelectorAll('input[type="file"]').forEach(input => {
        console.log('Setting up handler for input:', input.id);
        input.addEventListener('change', async (e) => {
            console.log('File input event target:', e.target);
            console.log('File input id:', e.target.id);
            const slotId = e.target.id.replace('file-', '');
            console.log('Extracted slotId:', slotId);
            const file = e.target.files[0];
            if (file) {
                try {
                    await loadArchive(file, slotId);
                    // Update file label
                    const label = document.querySelector(`label[for="${e.target.id}"]`);
                    if (label) {
                        label.textContent = file.name;
                    }
                    // Enable flash button if connected
                    if (getTiliquaHwVersion()) {
                        const button = document.querySelector(`[data-content="${slotId}"] .flash-button`);
                        if (button) {
                            button.disabled = false;
                        }
                    }
                } catch (error) {
                    addToGlobalLog(slotId, error.message, 'error');
                }
            }
        });
    });

    // Flash button handlers
    document.querySelectorAll('.flash-button').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.closest('.circle-content');
            const slotId = content.dataset.content;
            handleFlash(slotId);
        });
    });
});