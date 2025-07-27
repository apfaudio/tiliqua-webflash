import { setUsbDevice, setTiliquaHwVersion, loadedArchives } from './globals.js';
import { showGlobalMessage, enableTabs, showTab } from './ui-helpers.js';
import { readFlashManifests } from './flash-operations.js';

export async function scanForTiliqua() {
    try {
        showGlobalMessage("Scan for Tiliqua...");
        
        const devices = await navigator.usb.getDevices();
        let tiliquaDevice = null;
        
        for (const device of devices) {
            if (device.productName && (device.productName.toLowerCase().includes('apfbug') || 
                                       device.productName.toLowerCase().includes('apf.audio'))) {
                tiliquaDevice = device;
                break;
            }
        }
        
        if (!tiliquaDevice) {
            tiliquaDevice = await navigator.usb.requestDevice({
                filters: []
            });
        }
        
        if (!tiliquaDevice) {
            throw new Error("No device selected");
        }
        
        const productName = tiliquaDevice.productName || "";
        if (!productName.toLowerCase().includes('apfbug') && 
            !productName.toLowerCase().includes('apf.audio')) {
            throw new Error("Selected device is not a Tiliqua debugger");
        }
        
        const hwVersionMatch = productName.match(/R(\d+)/);
        if (hwVersionMatch) {
            const hwVersion = parseInt(hwVersionMatch[1]);
            setTiliquaHwVersion(hwVersion);
            showGlobalMessage(`Found attached Tiliqua! (hw_rev=${hwVersion}, serial=${tiliquaDevice.serialNumber})`);
            
            const deviceInfo = document.getElementById('device-info');
            deviceInfo.textContent = `Connected: ${productName} (hw_rev=R${hwVersion}, serial=${tiliquaDevice.serialNumber})`;
            deviceInfo.className = 'device-info connected';
            
            setUsbDevice(tiliquaDevice);
            
            enableTabs();
            showTab('0');

            //await readFlashManifests();
            
            loadedArchives.forEach((data, slotId) => {
                const button = document.querySelector(`[data-content="${slotId}"] .flash-button`);
                if (button) {
                    button.disabled = false;
                }
            });
            
            return hwVersion;
        } else {
            throw new Error("Found tiliqua-like device, product code is malformed (update RP2040?).");
        }
        
    } catch (error) {
        var errorMsg = error.message || "Unknown error";
        let additionalInfo = "Check it is turned on, plugged in ('dbg' port), permissions correct, and RP2040 firmware is up to date.";
        // Check for WebUSB support issues
        if (error.message && error.message.includes("navigator.usb is undefined")) {
            errorMsg = "WebUSB is not supported in this browser";
            additionalInfo = "Please use Chrome, Edge, or another Chromium-based browser. Firefox does not support WebUSB.";
        } else if (!navigator.usb) {
            errorMsg = "WebUSB is not supported in this browser";
            additionalInfo = "Please use Chrome, Edge, or another Chromium-based browser. WebUSB requires a Chromium-based browser.";
        }
        showGlobalMessage(`Could not find Tiliqua debugger: ${errorMsg}`, 'error');
        showGlobalMessage(additionalInfo, 'error');
        const deviceInfo = document.getElementById('device-info');
        deviceInfo.textContent = `Error: ${errorMsg}`;
        deviceInfo.className = 'device-info error';
        return null;
    }
}
