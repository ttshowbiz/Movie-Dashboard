import fs from 'fs'
import { MovieDb } from 'moviedb-promise'

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
        this.tmdb = new MovieDb(api_key)
        this.tmdb.configuration({}).then((res) => {
            this.base_url = res.images.base_url
            this.poster_size = 'w154'
        })
    }

    async get_movie_poster(id) {
        let result = await this.tmdb.movieImages({ id: id, include_image_language: "en" })
        return this.base_url + this.poster_size + result.posters[0].file_path
    }

    async get_show_poster(id, season = -1) {
        let result
        if(season > 0)
            result = await this.tmdb.seasonImages({ id: id, season: season })
        else
            result = await this.tmdb.tvImages({ id: id })

        return this.base_url + this.poster_size + result.posters[0].file_path
    }

    async get_movie_genres(id) {
        let genres = []
        let result = await this.tmdb.movieInfo({ id: id })
        result.genres.forEach(genre => {
            genres.push(genre.name)
        })
        return genres

    }

    async get_show_genres(id) {
        let genres = []
        let result = await this.tmdb.tvInfo({ id: id })

        result.genres.forEach(genre => {
            genres.push(genre.name)
        })
        return genres
    }
}

export { TmdbWrapper as default }