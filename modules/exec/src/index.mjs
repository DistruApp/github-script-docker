import {ToolRunner, argStringToArray} from './toolrunner.mjs';
import * as _io from './io.mjs';

export const io = _io;

/**
 * Exec a command.
 * Output will be streamed to stdout
 * Returns promise with return code
 */
export async function exec(commandLine, args, options) {
    const commandArgs = argStringToArray(commandLine);
    if (commandArgs.length === 0) {
        throw new Error(`Parameter 'commandLine' cannot be null or empty.`);
    }
    const toolPath = commandArgs[0];
    args = commandArgs.slice(1).concat(args || []);
    const runner = new ToolRunner(toolPath, args, options);
    return runner.exec();
}
