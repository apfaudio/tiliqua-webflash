let currentSlot = null;
let selectedBitstream = null;

export async function openBrowseDialog(slotId) {
    currentSlot = slotId;
    selectedBitstream = null;
    
    const dialog = document.getElementById('browse-dialog');
    const listContainer = document.getElementById('bitstream-list');
    const selectButton = document.getElementById('browse-select');
    
    // Show dialog
    dialog.style.display = 'flex';
    
    // Reset state
    selectButton.disabled = true;
    listContainer.innerHTML = '<div class="loading">Loading bitstreams...</div>';
    
    try {
        // Import the static bitstreams list
        const { AVAILABLE_BITSTREAMS } = await import('./bitstreams-list.js');
        
        if (AVAILABLE_BITSTREAMS.length === 0) {
            listContainer.innerHTML = '<div class="loading">No .tar.gz bitstreams found in /bitstreams folder</div>';
            return;
        }
        
        const bitstreams = AVAILABLE_BITSTREAMS;
        
        // Render bitstream list
        listContainer.innerHTML = '';
        bitstreams.forEach(bitstream => {
            const item = document.createElement('div');
            item.className = 'bitstream-item';
            item.dataset.filename = bitstream.filename;
            const briefHtml = bitstream.brief ? `<div class="bitstream-brief">${bitstream.brief}</div>` : '';
            item.innerHTML = `
                <div class="bitstream-name">${bitstream.name}</div>
                ${briefHtml}
                <div class="bitstream-size">${formatFileSize(bitstream.size)}</div>
            `;
            
            item.addEventListener('click', () => {
                // Remove previous selection
                document.querySelectorAll('.bitstream-item').forEach(i => i.classList.remove('selected'));
                
                // Select this item
                item.classList.add('selected');
                selectedBitstream = bitstream;
                selectButton.disabled = false;
            });
            
            listContainer.appendChild(item);
        });
        
    } catch (error) {
        console.error('Failed to load bitstreams:', error);
        listContainer.innerHTML = `<div class="loading">Error loading bitstreams: ${error.message}</div>`;
    }
}


export function closeBrowseDialog() {
    document.getElementById('browse-dialog').style.display = 'none';
    currentSlot = null;
    selectedBitstream = null;
}

export async function selectBitstream() {
    if (!selectedBitstream || !currentSlot) return;
    
    try {
        // Download the selected bitstream
        const response = await fetch(`/bitstreams/${selectedBitstream.filename}`);
        if (!response.ok) {
            throw new Error(`Failed to download bitstream: ${response.status}`);
        }
        
        const blob = await response.blob();
        console.log('Downloaded blob:', blob.size, 'bytes, type:', blob.type);
        
        const file = new File([blob], selectedBitstream.filename);
        console.log('Created file:', file.name, file.size, 'bytes, type:', file.type);
        
        // Import the loadArchive function and process the file
        const { loadArchive } = await import('./archive-processing.js');
        await loadArchive(file, currentSlot);
        
        // Update the UI to show the selected file
        const label = document.querySelector(`label[for="file-${currentSlot}"]`);
        if (label) {
            label.textContent = selectedBitstream.name;
        }
        
        // Enable flash button if connected
        const { getTiliquaHwVersion } = await import('./globals.js');
        if (getTiliquaHwVersion()) {
            const button = document.querySelector(`[data-content="${currentSlot}"] .flash-button`);
            if (button) {
                button.disabled = false;
            }
        }
        
        closeBrowseDialog();
        
    } catch (error) {
        console.error('Failed to select bitstream:', error);
        const { addToGlobalLog } = await import('./ui-helpers.js');
        addToGlobalLog(currentSlot, `Failed to load bitstream: ${error.message}`, 'error');
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}