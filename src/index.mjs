#!/usr/bin/env node

import {createRequire} from 'module';
import {readFile, existsSync} from 'fs';
import {promisify} from 'util';
import {Octokit, context} from '@distru/github';
import {exec, io} from '@distru/exec';

const require = createRequire(import.meta.url);
const readFileAsync = promisify(readFile);
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor

async function main(opts) {
    const github = new Octokit();
    const env = { require, github, context, exec, io };
    const script = await readFileAsync(opts.script);
    const fn = new AsyncFunction(...Object.keys(env), script);
    await fn(...Object.values(env));
}

function handleError(err) {
    console.error(err);
    process.exitCode = 1;
}
process.on('unhandledRejection', handleError);

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-') {
    main({ script: 0 }).catch(handleError);
} else {
    const scriptPath = args[0];
    if (!existsSync(scriptPath)) {
        handleError(new Error(`Invalid script path ${scriptPath}: does not exist`));
        process.exit(1);
    }
    main({ script: scriptPath }).catch(handleError);
}
