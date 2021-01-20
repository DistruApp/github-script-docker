import * as path from 'path'
import {promisify} from 'util'
import * as ioUtil from './io-util.mjs'

/**
 * Returns path of a tool had the tool actually been invoked.  Resolves via paths.
 * If you check and the tool does not exist, it will throw.
 *
 * @param     tool              name of the tool
 * @param     check             whether to check if tool exists
 * @returns   Promise<string>   path to tool
 */
export async function which(tool, check) {
  if (!tool) {
    throw new Error("parameter 'tool' is required")
  }

  // recursive when check=true
  if (check) {
    const result = await which(tool, false)

    if (!result) {
      throw new Error(
        `Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.`
      )
    }
  }

  try {
    // build the list of extensions to try
    const extensions = []

    // if it's rooted, return it if exists. otherwise return empty.
    if (ioUtil.isRooted(tool)) {
      const filePath = await ioUtil.tryGetExecutablePath(
        tool,
        extensions
      )

      if (filePath) {
        return filePath
      }

      return ''
    }

    // if any path separators, return empty
    if (tool.includes('/')) {
      return ''
    }

    // build the list of directories
    //
    // Note, technically "where" checks the current directory on Windows. From a toolkit perspective,
    // it feels like we should not do this. Checking the current directory seems like more of a use
    // case of a shell, and the which() function exposed by the toolkit should strive for consistency
    // across platforms.
    const directories = []

    if (process.env.PATH) {
      for (const p of process.env.PATH.split(path.delimiter)) {
        if (p) {
          directories.push(p)
        }
      }
    }

    // return the first match
    for (const directory of directories) {
      const filePath = await ioUtil.tryGetExecutablePath(
        directory + path.sep + tool,
        extensions
      )
      if (filePath) {
        return filePath
      }
    }

    return ''
  } catch (err) {
    throw new Error(`which failed with message ${err.message}`)
  }
}
