import { setCurrentSlot, getCurrentFlashCommand } from './globals.js';

export function showGlobalMessage(message, type = 'info') {
    const logContent = document.getElementById('global-log');
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.innerHTML = `${message}`;
    logContent.appendChild(logLine);
    logContent.scrollTop = logContent.scrollHeight;
}

export function addToGlobalLog(slotId, message, type = 'info') {
    if (!message) return;
    const logContent = document.getElementById('global-log');
    if (message.includes('\n')) {
        const logLine = document.createElement('div');
        logLine.className = `log-line ${type}`;
        logLine.textContent = message;
        logContent.appendChild(logLine);
    } else {
        var logLine = logContent.lastChild;
        if (logLine) {
            if (message.includes('\r')) {
                logLine.textContent = message;
            } else {
                logLine.textContent += message;
            }
        }
    }
    logContent.scrollTop = logContent.scrollHeight;
    
    // Update progress log if flash operation is in progress
    updateProgressLog();
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

export function updateProgressLog() {
    const flashLoading = document.getElementById('flash-loading');
    const progressLogContent = document.getElementById('progress-log-content');
    
    // Only update if flash operation is in progress
    if (!flashLoading.classList.contains('show') || !progressLogContent) {
        return;
    }
    
    // Get current command and last 4 log entries
    const currentCommand = getCurrentFlashCommand();
    const globalLog = document.getElementById('global-log');
    const allLogLines = Array.from(globalLog.children);
    const lastLines = allLogLines.slice(-4);
    
    // Clear progress log content
    progressLogContent.innerHTML = '';
    
    // First line: current command (or empty if no command)
    const commandLine = document.createElement('div');
    if (currentCommand) {
        commandLine.className = 'log-line command';
        commandLine.textContent = `$ ${currentCommand}`;
    } else {
        commandLine.className = 'log-line info';
        commandLine.textContent = ' ';
    }
    progressLogContent.appendChild(commandLine);
    
    // Next 4 lines: last log entries
    for (let i = 0; i < 4; i++) {
        const progressLine = document.createElement('div');
        progressLine.className = 'log-line info';
        
        if (i < lastLines.length) {
            // Use actual log line
            const sourceLine = lastLines[i];
            progressLine.className = sourceLine.className;
            progressLine.textContent = sourceLine.textContent || ' ';
        } else {
            // Use empty placeholder line
            progressLine.textContent = ' ';
        }
        
        progressLogContent.appendChild(progressLine);
    }
}
