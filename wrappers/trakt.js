import fs from 'fs'
import get_full_path from '../files.js'
import Movie from '../movie.js'
import TmdbWrapper from './tmdb.js'
import Trakt from 'trakt.tv'

class TraktWrapper {
    constructor(info_file, io) {

        this.io = io
        this.movies = new Map()

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

        // Load initial watch history
        this.get_watch_history(null)
    }

    async get_now_playing(client) {
        let title = "Nothing Currently Playing"
        let subtitle = ""
        let link = ""
        let poster = ""
        let genres = []

        this.trakt.users.watching({ username: this.userId }).then(async now_watching => {
            if (now_watching.data) {
                if (now_watching.data.movie) {
                    let movie_data = now_watching.data.movie 
                    let id = movie_data.ids.tmdb

                    title = `${movie_data.title} (${movie_data.year})`
                    link = `https://www.themoviedb.org/movie/${id}-${movie_data.ids.slug}`

                    poster = await this.tmdb.get_movie_poster(id)
                    genres = await this.tmdb.get_movie_genres(id)
                }
                else if (now_watching.data.show) {
                    let show_data = now_watching.data.show
                    let episode_data = now_watching.data.episode

                    let id = show_data.ids.tmdb
                    link = `https://www.themoviedb.org/tv/${id}-${show_data.ids.slug}`
                    subtitle = `${episode_data.season}x${String(episode_data.number).padStart(2, '0')} ${episode_data.title}`

                    title = `${show_data.title} (${show_data.year})`
                    poster = await this.tmdb.get_show_poster(id, episode_data.season)
                    genres = await this.tmdb.get_show_genres(id)
                }
            }

            client.emit('now_playing_info', {title: title, subtitle: subtitle, poster: poster, genres: genres, link: link})
        })
    }

    // NOTE: Movies only
    async get_watch_history(client, force_send = false) {
        this.trakt.users.watched({ username: this.userId, type: "movies" }).then(async watch_history => {
            if (watch_history.data) {
                watch_history.data.sort(function (a, b) {
                    return new Date(b.last_watched_at) - new Date(a.last_watched_at)
                })

                this.get_movie_data(watch_history.data).then(new_movie_added => {
                    if (client && (force_send || new_movie_added)) {
                        client.emit("watch_history", Array.from(this.movies.values()))
                    }
                })
            }
        })
    }

    async get_movie_data(watch_history) {
        let new_movie_added = false

        for (var i = 0; i < watch_history.length; i++) {
            let movie = watch_history[i]
            let trakt_id = movie.movie.ids.trakt

            if (!this.movies.has(trakt_id)) {
                new_movie_added = true
                let poster = ""
                let tmdb_id = movie.movie.ids.tmdb
                let link = `https://www.themoviedb.org/movie/${tmdb_id}-${movie.movie.ids.slug}`

                /* 
                 * Small Axe is listed as a movie in Trakt and has a valid TMDB movie id but, the TMDB movie page 
                 * associated with this id is empty. There is a TMDB page for Small Axe under TV with a different 
                 * id. This page contains the real data for this movie... sorry
                 */
                const SMALL_AXE_TRAKT_ID = 865887
                if (movie.movie.ids.trakt == SMALL_AXE_TRAKT_ID) {
                    const SMALL_AXE_TMDB_ID = 90705
                    poster = await this.tmdb.get_show_poster(SMALL_AXE_TMDB_ID)
                }
                else {
                    poster = await this.tmdb.get_movie_poster(tmdb_id)
                }
                        
                this.movies.set(trakt_id, new Movie(movie.movie.title, poster, link))
            }
        }

        return new_movie_added
    }

    async get_movie_ratings(client) {
        let ratings = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        this.trakt.users.ratings({ username: this.userId, type: "movies" }).then(rating_info => {
            rating_info.data.forEach(rating => {
                ratings[rating.rating]++
                const TRAKT_ID = rating.movie.ids.trakt
                if (this.movies.has(TRAKT_ID))
                    this.movies.get(TRAKT_ID).set_rating(rating.rating)
            })

            client.emit("ratings", ratings)
        })
    }
}

export { TraktWrapper }