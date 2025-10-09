"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunnerEvent = exports.isRunnerCommand = void 0;
const COMMAND_TYPES = [
    'start-build',
    'start-dev-server',
    'stop-dev-server',
    'fetch-logs',
    'runner-health-check',
];
const isRunnerCommand = (message) => COMMAND_TYPES.includes(message.type);
exports.isRunnerCommand = isRunnerCommand;
const isRunnerEvent = (message) => !(0, exports.isRunnerCommand)(message);
exports.isRunnerEvent = isRunnerEvent;
