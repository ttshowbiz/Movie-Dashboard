const fs = require('fs')

class Trakt {
    constructor(info_file) {
        fs.readFile(info_file, 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err)
                return
            }
            console.log('File data:', jsonString)
        })
    }
}

var trakt = new Trakt('./trackt_info.json')

function get_now_playing() {
    console.log('temp');
}