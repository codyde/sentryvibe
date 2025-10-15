"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkspaceRoot = getWorkspaceRoot;
const fs_1 = require("fs");
let cachedRoot = null;
function getWorkspaceRoot() {
    if (cachedRoot)
        return cachedRoot;
    const envRoot = process.env.WORKSPACE_ROOT || process.env.RUNNER_WORKSPACE_ROOT;
    const defaultRoot = process.cwd();
    const root = envRoot && envRoot.trim().length > 0 ? envRoot : defaultRoot;
    try {
        (0, fs_1.mkdirSync)(root, { recursive: true });
    }
    catch (error) {
        console.warn('⚠️  Failed to ensure workspace root exists:', error);
    }
    cachedRoot = root;
    return root;
}
