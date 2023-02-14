import fs from 'fs'
import get_full_path from '../files.js'
import TmdbWrapper from './tmdb.js'
import Trakt from 'trakt.tv'

class TraktWrapper {
    constructor(info_file, io) {

        this.io = io

        fs.readFile(info_file, 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err)
                return
            }
            
            const trakt_info = JSON.parse(jsonString)
            this.userId = trakt_info.user_id
            this.init(trakt_info.client_id, trakt_info.client_secret)
        })
    }

    init(client_id, client_secret) {
        let options = {
            client_id: client_id,
            client_secret: client_secret,
            redirect_uri: null,   // defaults to 'urn:ietf:wg:oauth:2.0:oob'
            api_url: null,        // defaults to 'https://api.trakt.tv'
            useragent: null,      // defaults to 'trakt.tv/<version>'
            pagination: true      // defaults to false, global pagination (see below)
        };
        this.trakt = new Trakt(options);
        this.tmdb = new TmdbWrapper(get_full_path("/tmdb_info.json"))
    }

    async get_now_playing(client) {
        var title = "Nothing Currently Playing"

        this.trakt.users.watching({ username: this.userId }).then(now_watching => {
            //console.log(now_watching)

            if (now_watching.data) {
                if (now_watching.data.movie) {
                    title = now_watching.data.movie.title
                    this.tmdb.get_movie_poster(client, now_watching.data.movie.ids.tmdb)
                }
                else if (now_watching.data.show) {
                    title = now_watching.data.show.title + ": " + now_watching.data.episode.title
                    this.tmdb.get_show_poster(client, now_watching.data.show.ids.tmdb, now_watching.data.episode.season)
                }
            } else {
                client.emit("now_playing_poster", "")
            }

            //console.log("title: " + title)
            client.emit('now_playing_title', title)
        })
    }
}

export { TraktWrapper }