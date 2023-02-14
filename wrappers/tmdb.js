import fs from 'fs'
import MovieDB from 'moviedb'

class TmdbWrapper {
    constructor(info_file) {
        fs.readFile(info_file, 'utf8', (err, jsonString) => {
            if (err) {
                console.log("File read failed:", err)
                return
            }

            const tmdb_info = JSON.parse(jsonString)
            this.init(tmdb_info.api_key)
        })
    }

    init(api_key) {
        this.tmdb = new MovieDB(api_key)
        this.tmdb.configuration({}, (err, res) => {
            this.base_url = res.images.base_url
            this.poster_size = 'w154'
        })
    }

    async get_movie_poster(client, id) {
        this.tmdb.movieImages({ id: id}, (err, res) => {
            var poster_path = this.base_url + this.poster_size + res.posters[0].file_path
            client.emit("now_playing_poster", poster_path)
        })
    }

    async get_show_poster(client, id, season) {
        this.tmdb.tvSeasonImages({ id: id, season_number: season}, (err, res) => { 
            var poster_path = this.base_url + this.poster_size + res.posters[0].file_path
            client.emit("now_playing_poster", poster_path)
        })
    }

    async get_show_genres(client, id) {
        this.tmdb.tvInfo({ id: id }, (err, res) => {
            client.emit("now_playing_genres", res.genres)
        })
    }
}

export { TmdbWrapper as default }