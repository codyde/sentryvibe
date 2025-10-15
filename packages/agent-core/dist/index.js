"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AGENT_ID = exports.CODEX_SYSTEM_PROMPT = exports.CLAUDE_SYSTEM_PROMPT = void 0;
var prompts_1 = require("./lib/prompts");
Object.defineProperty(exports, "CLAUDE_SYSTEM_PROMPT", { enumerable: true, get: function () { return prompts_1.CLAUDE_SYSTEM_PROMPT; } });
Object.defineProperty(exports, "CODEX_SYSTEM_PROMPT", { enumerable: true, get: function () { return prompts_1.CODEX_SYSTEM_PROMPT; } });
__exportStar(require("./shared/runner/messages"), exports);
var agent_1 = require("./types/agent");
Object.defineProperty(exports, "DEFAULT_AGENT_ID", { enumerable: true, get: function () { return agent_1.DEFAULT_AGENT_ID; } });
