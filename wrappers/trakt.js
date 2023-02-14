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
        var subtitle = ""
        var link = ""

        this.trakt.users.watching({ username: this.userId }).then(now_watching => {
            //console.log(now_watching)

            if (now_watching.data) {
                if (now_watching.data.movie) {
                    var movie_data = now_watching.data.movie 
                    var id = movie_data.ids.tmdb

                    title = `${movie_data.title} (${movie_data.year})`
                    link = `https://www.themoviedb.org/movie/${id}-${title.replace(/ /g, '-')}`

                    this.tmdb.get_movie_poster(client, id)
                    this.tmdb.get_movie_genres(client, id)
                }
                else if (now_watching.data.show) {
                    var show_data = now_watching.data.show
                    var episode_data = now_watching.data.episode

                    var id = show_data.ids.tmdb
                    var tmdb_title = show_data.title.replace(/ /g, '-')
                    link = `https://www.themoviedb.org/tv/${id}-${tmdb_title}`
                    subtitle = `${episode_data.season}x${String(episode_data.number).padStart(2, '0')} ${episode_data.title}`

                    title = `${show_data.title} (${show_data.year})`
                    this.tmdb.get_show_poster(client, id, episode_data.season)
                    this.tmdb.get_show_genres(client, id)
                }
            } else {
                client.emit("now_playing_poster", "")
            }

            client.emit('now_playing_info', {title: title, subtitle: subtitle})
            client.emit("now_playing_link", link)
        })
    }
}

export { TraktWrapper }