let currentSlot = null;
let selectedBitstream = null;
let allBitstreams = [];
let currentFilter = 'all';

// Helper functions to extract fields from bitstream manifest
function getBitstreamName(bitstream) {
    if (bitstream.manifest && bitstream.manifest.name) {
        return bitstream.manifest.name;
    }
    return bitstream.filename.replace('.tar.gz', '').replace('.tar', '');
}

function getBitstreamBrief(bitstream) {
    return bitstream.manifest?.brief || null;
}

function getBitstreamHwRev(bitstream) {
    return bitstream.manifest?.hw_rev || null;
}

function getBitstreamTags(bitstream) {
    if (!bitstream.manifest) return [];
    
    const tags = [];
    const regions = bitstream.manifest.regions || [];
    
    // Detect CPU tag - check if any region has 'firmware.bin'
    const hasFirmware = regions.some(region => region.filename === 'firmware.bin');
    if (hasFirmware) {
        tags.push('CPU');
    }
    
    // Detect Video tag - check if video field is not '<none>'
    const video = bitstream.manifest.video || '<none>';
    if (video !== '<none>') {
        tags.push('Video');
    }
    
    return tags;
}

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
        await renderBitstreams();
        
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
        
        // Update flash button text with bitstream name
        const button = document.querySelector(`[data-content="${currentSlot}"] .flash-button`);
        if (button) {
            const bitstreamName = getBitstreamName(selectedBitstream);
            button.textContent = `Flash '${bitstreamName}'`;
            // Enable flash button if connected
            const { getTiliquaHwVersion } = await import('./globals.js');
            if (getTiliquaHwVersion()) {
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
                renderBitstreams(); // Note: not awaited to keep UI responsive
            });
        }
    });
}

async function filterBitstreams(bitstreams) {
    let filtered = bitstreams;
    
    // First filter by hardware revision compatibility
    const { getTiliquaHwVersion } = await import('./globals.js');
    //const connectedHwRev = 4; // XXX test browse feature
    const connectedHwRev = getTiliquaHwVersion();
    
    if (connectedHwRev !== null) {
        filtered = filtered.filter(b => {
            const hwRev = getBitstreamHwRev(b);
            // Show bitstreams that either:
            // 1. Have matching hw_rev
            // 2. Have no hw_rev specified (assume compatible)
            return hwRev === null || hwRev === connectedHwRev;
        });
    }
    
    // Then filter by tag selection
    if (currentFilter === 'all') {
        return filtered;
    } else if (currentFilter === 'cpu') {
        return filtered.filter(b => getBitstreamTags(b).includes('CPU'));
    } else if (currentFilter === 'video') {
        return filtered.filter(b => getBitstreamTags(b).includes('Video'));
    }
    return filtered;
}

async function renderBitstreams() {
    const listContainer = document.getElementById('bitstream-list');
    const selectButton = document.getElementById('browse-select');
    
    if (!allBitstreams || allBitstreams.length === 0) {
        listContainer.innerHTML = '<div class="loading">No bitstreams available</div>';
        return;
    }
    
    const filteredBitstreams = await filterBitstreams(allBitstreams);
    
    if (filteredBitstreams.length === 0) {
        listContainer.innerHTML = '<div class="loading">No bitstreams match the current filter</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    filteredBitstreams.forEach(bitstream => {
        const item = document.createElement('div');
        item.className = 'bitstream-item';
        item.dataset.filename = bitstream.filename;
        
        const name = getBitstreamName(bitstream);
        const brief = getBitstreamBrief(bitstream);
        const tags = getBitstreamTags(bitstream);
        
        const briefHtml = brief ? `<div class="bitstream-brief">${brief}</div>` : '';
        const tagsHtml = tags.length > 0 ? 
            `<div class="bitstream-tags">
                ${tags.map(tag => `<span class="bitstream-tag ${tag.toLowerCase()}">${tag}</span>`).join('')}
            </div>` : '';
        
        item.innerHTML = `
            <div class="bitstream-content">
                <div class="bitstream-name">${name}</div>
                ${briefHtml}
                <div class="bitstream-size">${formatBitstreamSizes(bitstream)}</div>
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
    if (bytes === 0) return '0 KB';
    const kb = Math.round(bytes / 1024);
    return `${kb} KB`;
}

function formatBitstreamSizes(bitstream) {
    const compressedSize = bitstream.compressed_size;
    const uncompressedSize = bitstream.uncompressed_size;
    
    return `${formatFileSize(compressedSize)} (${formatFileSize(uncompressedSize)} uncompressed)`;
}
