import fs from 'fs'

const unlink = (path) => {
    fs.unlinkSync(path)
}

export default unlink