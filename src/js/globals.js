// Global variables - use let so they can be reassigned
let _pyodide = null;
let _flashCore = null;
let _usbDevice = null;
let _tiliquaHwVersion = null;
let _currentSlot = null;

export const loadedArchives = new Map();
export const currentManifests = new Map();

// Global getters
export const getPyodide = () => _pyodide;
export const getFlashCore = () => _flashCore;
export const getUsbDevice = () => _usbDevice;
export const getTiliquaHwVersion = () => _tiliquaHwVersion;
export const getCurrentSlot = () => _currentSlot;

// Legacy exports for compatibility
export const pyodide = getPyodide();
export const flashCore = getFlashCore();
export const usbDevice = getUsbDevice();
export const tiliquaHwVersion = getTiliquaHwVersion();
export const currentSlot = getCurrentSlot();

// Global setters
export function setPyodide(instance) {
    _pyodide = instance;
}

export function setFlashCore(instance) {
    _flashCore = instance;
}

export function setUsbDevice(device) {
    _usbDevice = device;
}

export function setTiliquaHwVersion(version) {
    _tiliquaHwVersion = version;
}

export function setCurrentSlot(slot) {
    _currentSlot = slot;
}

// Current flash command
let _currentFlashCommand = '';

export function getCurrentFlashCommand() {
    return _currentFlashCommand;
}

export function setCurrentFlashCommand(command) {
    _currentFlashCommand = command;
}