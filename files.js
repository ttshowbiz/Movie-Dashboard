import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function get_full_path(relative_path) {
    return __dirname + relative_path
}

export { get_full_path as default }