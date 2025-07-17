let currentSlot = null;
let selectedBitstream = null;
let allBitstreams = [];
let currentFilter = 'all';

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
        
        allBitstreams = AVAILABLE_BITSTREAMS;
        
        // Set up filter button handlers
        setupFilterButtons();
        
        // Render bitstream list
        renderBitstreams();
        
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

function setupFilterButtons() {
    const filterButtons = ['filter-all', 'filter-cpu', 'filter-video'];
    
    filterButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            button.addEventListener('click', () => {
                // Update active state
                filterButtons.forEach(id => document.getElementById(id)?.classList.remove('active'));
                button.classList.add('active');
                
                // Update filter
                currentFilter = buttonId.replace('filter-', '');
                renderBitstreams();
            });
        }
    });
}

function filterBitstreams(bitstreams) {
    if (currentFilter === 'all') {
        return bitstreams;
    } else if (currentFilter === 'cpu') {
        return bitstreams.filter(b => b.tags.includes('CPU'));
    } else if (currentFilter === 'video') {
        return bitstreams.filter(b => b.tags.includes('Video'));
    }
    return bitstreams;
}

function renderBitstreams() {
    const listContainer = document.getElementById('bitstream-list');
    const selectButton = document.getElementById('browse-select');
    
    if (!allBitstreams || allBitstreams.length === 0) {
        listContainer.innerHTML = '<div class="loading">No bitstreams available</div>';
        return;
    }
    
    const filteredBitstreams = filterBitstreams(allBitstreams);
    
    if (filteredBitstreams.length === 0) {
        listContainer.innerHTML = '<div class="loading">No bitstreams match the current filter</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    filteredBitstreams.forEach(bitstream => {
        const item = document.createElement('div');
        item.className = 'bitstream-item';
        item.dataset.filename = bitstream.filename;
        
        const briefHtml = bitstream.brief ? `<div class="bitstream-brief">${bitstream.brief}</div>` : '';
        const tagsHtml = bitstream.tags.length > 0 ? 
            `<div class="bitstream-tags">
                ${bitstream.tags.map(tag => `<span class="bitstream-tag ${tag.toLowerCase()}">${tag}</span>`).join('')}
            </div>` : '';
        
        item.innerHTML = `
            <div class="bitstream-content">
                <div class="bitstream-name">${bitstream.name}</div>
                ${briefHtml}
                <div class="bitstream-size">${formatFileSize(bitstream.size)}</div>
            </div>
            ${tagsHtml}
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
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}