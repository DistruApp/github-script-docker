import * as os from 'os'
import * as events from 'events'
import * as child from 'child_process'
import * as path from 'path'
import * as stream from 'stream'
import * as io from './io.mjs'
import * as ioUtil from './io-util.mjs'

/*
 * Class for running command line tools. Handles quoting and arg parsing in a platform agnostic way.
 */
export class ToolRunner extends events.EventEmitter {
  constructor(toolPath, args, options) {
    super()

    if (!toolPath) {
      throw new Error("Parameter 'toolPath' cannot be null or empty.")
    }

    this.toolPath = toolPath
    this.args = args || []
    this.options = options || {}
  }

  toolPath;
  args = [];
  options = {};

  _debug(message) {
    if (this.options.listeners && this.options.listeners.debug) {
      this.options.listeners.debug(message)
    }
  }

  _getCommandString(options, noPrefix) {
    const toolPath = this.toolPath
    const args = this.args
    let cmd = noPrefix ? '' : '[command]' // omit prefix when piped to a second tool
    // OSX/Linux - this can likely be improved with some form of quoting.
    // creating processes on Unix is fundamentally different than Windows.
    // on Unix, execvp() takes an arg array.
    cmd += toolPath
    for (const a of args) {
        cmd += ` ${a}`
    }

    return cmd
  }

  _processLineBuffer(data, strBuffer, onLine) {
    try {
      let s = strBuffer + data.toString()
      let n = s.indexOf(os.EOL)

      while (n > -1) {
        const line = s.substring(0, n)
        onLine(line)

        // the rest of the string ...
        s = s.substring(n + os.EOL.length)
        n = s.indexOf(os.EOL)
      }

      strBuffer = s
    } catch (err) {
      // streaming lines to console is best effort.  Don't fail a build.
      this._debug(`error processing line. Failed with error ${err}`)
    }
  }

  _cloneExecOptions(options) {
    options = options || {}
    const result = {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      silent: options.silent || false,
      failOnStdErr: options.failOnStdErr || false,
      ignoreReturnCode: options.ignoreReturnCode || false,
      delay: options.delay || 10000
    }
    result.outStream = options.outStream || process.stdout
    result.errStream = options.errStream || process.stderr
    return result
  }

  _getSpawnOptions(options, toolPath) {
    options = options || {}
    const result = {}
    result.cwd = options.cwd
    result.env = options.env
    return result
  }

  /**
   * Exec a tool.
   * Output will be streamed to the live console.
   * Returns promise with return code
   *
   * @param     tool     path to tool to exec
   * @param     options  optional exec options.  See ExecOptions
   * @returns   number
   */
  async exec() {
    // root the tool path if it is unrooted and contains relative pathing
    if (!ioUtil.isRooted(this.toolPath) && this.toolPath.includes('/')) {
      // prefer options.cwd if it is specified, however options.cwd may also need to be rooted
      this.toolPath = path.resolve(
        process.cwd(),
        this.options.cwd || process.cwd(),
        this.toolPath
      )
    }

    // if the tool is only a file name, then resolve it from the PATH
    // otherwise verify it exists (add extension on Windows if necessary)
    this.toolPath = await io.which(this.toolPath, true)

    return new Promise((resolve, reject) => {
      this._debug(`exec tool: ${this.toolPath}`)
      this._debug('arguments:')
      for (const arg of this.args) {
        this._debug(`   ${arg}`)
      }

      const optionsNonNull = this._cloneExecOptions(this.options)
      if (!optionsNonNull.silent && optionsNonNull.outStream) {
        optionsNonNull.outStream.write(
          this._getCommandString(optionsNonNull) + os.EOL
        )
      }

      const state = new ExecState(optionsNonNull, this.toolPath)
      state.on('debug', (message) => {
        this._debug(message)
      })

      const fileName = this.toolPath;
      const cp = child.spawn(
        fileName,
        this.args,
        this._getSpawnOptions(this.options, fileName)
      )

      const stdbuffer = ''
      if (cp.stdout) {
        cp.stdout.on('data', (data) => {
          if (this.options.listeners && this.options.listeners.stdout) {
            this.options.listeners.stdout(data)
          }

          if (!optionsNonNull.silent && optionsNonNull.outStream) {
            optionsNonNull.outStream.write(data)
          }

          this._processLineBuffer(data, stdbuffer, (line) => {
            if (this.options.listeners && this.options.listeners.stdline) {
              this.options.listeners.stdline(line)
            }
          })
        })
      }

      const errbuffer = ''
      if (cp.stderr) {
        cp.stderr.on('data', (data) => {
          state.processStderr = true
          if (this.options.listeners && this.options.listeners.stderr) {
            this.options.listeners.stderr(data)
          }

          if (
            !optionsNonNull.silent &&
            optionsNonNull.errStream &&
            optionsNonNull.outStream
          ) {
            const s = optionsNonNull.failOnStdErr
              ? optionsNonNull.errStream
              : optionsNonNull.outStream
            s.write(data)
          }

          this._processLineBuffer(data, errbuffer, (line) => {
            if (this.options.listeners && this.options.listeners.errline) {
              this.options.listeners.errline(line)
            }
          })
        })
      }

      cp.on('error', (err) => {
        state.processError = err.message
        state.processExited = true
        state.processClosed = true
        state.CheckComplete()
      })

      cp.on('exit', (code) => {
        state.processExitCode = code
        state.processExited = true
        this._debug(`Exit code ${code} received from tool '${this.toolPath}'`)
        state.CheckComplete()
      })

      cp.on('close', (code) => {
        state.processExitCode = code
        state.processExited = true
        state.processClosed = true
        this._debug(`STDIO streams have closed for tool '${this.toolPath}'`)
        state.CheckComplete()
      })

      state.on('done', (error, exitCode) => {
        if (stdbuffer.length > 0) {
          this.emit('stdline', stdbuffer)
        }

        if (errbuffer.length > 0) {
          this.emit('errline', errbuffer)
        }

        cp.removeAllListeners()

        if (error) {
          reject(error)
        } else {
          resolve(exitCode)
        }
      })

      if (this.options.input) {
        if (!cp.stdin) {
          throw new Error('child process missing stdin')
        }

        cp.stdin.end(this.options.input)
      }
    })
  }
}

/**
 * Convert an arg string to an array of args. Handles escaping
 *
 * @param    argString   string of arguments
 * @returns  string[]    array of arguments
 */
export function argStringToArray(argString) {
  const args = []

  let inQuotes = false
  let escaped = false
  let arg = ''

  function append(c) {
    // we only escape double quotes.
    if (escaped && c !== '"') {
      arg += '\\'
    }

    arg += c
    escaped = false
  }

  for (let i = 0; i < argString.length; i++) {
    const c = argString.charAt(i)

    if (c === '"') {
      if (!escaped) {
        inQuotes = !inQuotes
      } else {
        append(c)
      }
      continue
    }

    if (c === '\\' && escaped) {
      append(c)
      continue
    }

    if (c === '\\' && inQuotes) {
      escaped = true
      continue
    }

    if (c === ' ' && !inQuotes) {
      if (arg.length > 0) {
        args.push(arg)
        arg = ''
      }
      continue
    }

    append(c)
  }

  if (arg.length > 0) {
    args.push(arg.trim())
  }

  return args
}

class ExecState extends events.EventEmitter {
  constructor(options, toolPath) {
    super()

    if (!toolPath) {
      throw new Error('toolPath must not be empty')
    }

    this.options = options
    this.toolPath = toolPath
    if (options.delay) {
      this.delay = options.delay
    }
  }

  processClosed = false // tracks whether the process has exited and stdio is closed
  processError = ''
  processExitCode = 0
  processExited = false // tracks whether the process has exited
  processStderr = false // tracks whether stderr was written to
  delay = 10000 // 10 seconds
  done = false
  options = {}
  timeout = null
  toolPath = null

  CheckComplete() {
    if (this.done) {
      return
    }

    if (this.processClosed) {
      this._setResult()
    } else if (this.processExited) {
      this.timeout = setTimeout(ExecState.HandleTimeout, this.delay, this)
    }
  }

  _debug(message) {
    this.emit('debug', message)
  }

  _setResult() {
    // determine whether there is an error
    let error
    if (this.processExited) {
      if (this.processError) {
        error = new Error(
          `There was an error when attempting to execute the process '${this.toolPath}'. This may indicate the process failed to start. Error: ${this.processError}`
        )
      } else if (this.processExitCode !== 0 && !this.options.ignoreReturnCode) {
        error = new Error(
          `The process '${this.toolPath}' failed with exit code ${this.processExitCode}`
        )
      } else if (this.processStderr && this.options.failOnStdErr) {
        error = new Error(
          `The process '${this.toolPath}' failed because one or more lines were written to the STDERR stream`
        )
      }
    }

    // clear the timeout
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    this.done = true
    this.emit('done', error, this.processExitCode)
  }

  static HandleTimeout(state) {
    if (state.done) {
      return
    }

    if (!state.processClosed && state.processExited) {
      const message = `The STDIO streams did not close within ${state.delay /
        1000} seconds of the exit event from process '${
        state.toolPath
      }'. This may indicate a child process inherited the STDIO streams and has not yet exited.`
      state._debug(message)
    }

    state._setResult()
  }
}
