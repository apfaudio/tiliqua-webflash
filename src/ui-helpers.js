import { setCurrentSlot } from './globals.js';

export function showGlobalMessage(message, type = 'info') {
    const logContent = document.getElementById('global-log');
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.innerHTML = `${message}`;
    logContent.appendChild(logLine);
    logContent.scrollTop = logContent.scrollHeight;
}

export function addToGlobalLog(slotId, message, type = 'info') {
    const lines = message.split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            const logContent = document.getElementById('global-log');
            const logLine = document.createElement('div');
            logLine.className = `log-line ${type}`;
            logLine.innerHTML = `${line}`;
            logContent.appendChild(logLine);
            logContent.scrollTop = logContent.scrollHeight;
        }
    });
}

export function showTab(slotId) {
    document.querySelectorAll('.circle-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const content = document.querySelector(`[data-content="${slotId}"]`);
    if (content) {
        content.classList.add('active');
    }
    
    const tab = document.querySelector(`[data-slot="${slotId}"]`);
    if (tab) {
        tab.classList.add('active');
    }
    
    setCurrentSlot(slotId);
}

export function enableTabs() {
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.add('enabled');
    });
    document.getElementById('main-circle').classList.add('connected');
    document.getElementById('disconnected-overlay').classList.add('hidden');
    document.querySelector('.background-container').classList.add('connected');
    document.querySelector('.background-overlay').classList.add('connected');
}

export function disableTabs() {
    document.querySelectorAll('.tab-button').forEach(tab => {
        tab.classList.remove('enabled');
        tab.classList.remove('active');
    });
    document.getElementById('main-circle').classList.remove('connected');
    document.getElementById('disconnected-overlay').classList.remove('hidden');
    document.querySelectorAll('.circle-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelector('.background-container').classList.remove('connected');
    document.querySelector('.background-overlay').classList.remove('connected');
}

export function updateSlotDisplay(slotId, manifestInfo) {
    const slotInfo = document.querySelector(`[data-content="${slotId}"] .slot-info`);
    const manifestView = document.getElementById(`regions-${slotId}`);
    
    if (!slotInfo || !manifestView) return;
    
    // Clear any existing status
    manifestView.classList.remove('current-flash', 'pending-flash');
    const existingStatus = manifestView.querySelector('.manifest-status');
    if (existingStatus) existingStatus.remove();
    
    if (manifestInfo && !manifestInfo.is_empty) {
        // Show current flash content
        manifestView.classList.add('current-flash');
        
        const status = document.createElement('span');
        status.className = 'manifest-status current';
        status.textContent = 'Currently Flashed';
        manifestView.appendChild(status);
        
        if (manifestInfo.is_valid && manifestInfo.manifest) {
            // Update slot name if available
            if (manifestInfo.manifest.name) {
                slotInfo.innerHTML = `Slot ${slotId} <span class="slot-name">${manifestInfo.manifest.name}</span>`;
            }
            
            // Display the manifest
            displayRegions(slotId, manifestInfo.manifest);
        } else {
            manifestView.innerHTML = '<span style="color: #ff6b6b;">Invalid or corrupted manifest data</span>';
        }
    } else {
        // Slot is empty
        const status = document.createElement('span');
        status.className = 'manifest-status empty';
        status.textContent = 'Empty';
        manifestView.appendChild(status);
        manifestView.innerHTML += '<span style="color: #666;">No bitstream flashed in this slot</span>';
    }
}

export function displayRegions(slotId, manifest) {
    const regionsDiv = document.getElementById(`regions-${slotId}`);
    if (!regionsDiv) {
        console.error(`Could not find regions div for slot ${slotId}`);
        return;
    }

    // Preserve existing status element
    const existingStatus = regionsDiv.querySelector('.manifest-status');

    // Display raw JSON with proper escaping
    const jsonString = JSON.stringify(manifest, null, 2);
    const escapedJson = jsonString.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    regionsDiv.innerHTML = `<pre style="font-family: monospace; white-space: pre-wrap; margin: 0;">${escapedJson}</pre>`;

    // Re-add the status element if it existed
    if (existingStatus) {
        regionsDiv.appendChild(existingStatus);
    }
}