"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunnerEvent = exports.isRunnerCommand = void 0;
const COMMAND_TYPES = [
    'start-build',
    'start-dev-server',
    'stop-dev-server',
    'start-tunnel',
    'stop-tunnel',
    'fetch-logs',
    'runner-health-check',
    'delete-project-files',
    'read-file',
    'write-file',
    'list-files',
];
const isRunnerCommand = (message) => COMMAND_TYPES.includes(message.type);
exports.isRunnerCommand = isRunnerCommand;
const isRunnerEvent = (message) => !(0, exports.isRunnerCommand)(message);
exports.isRunnerEvent = isRunnerEvent;
