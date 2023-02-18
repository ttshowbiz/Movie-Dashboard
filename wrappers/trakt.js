import fs from 'fs'
import get_full_path from '../files.js'
import Movie from '../movie.js'
import TmdbWrapper from './tmdb.js'
import Trakt from 'trakt.tv'

const SMALL_AXE_TRAKT_ID = 865887
const SMALL_AXE_TMDB_ID = 90705

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
                if (movie.movie.ids.trakt == SMALL_AXE_TRAKT_ID) {
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

    async get_stats(client) {
        let num_movies = 0;
        let num_shows = 0;
        let movie_time = "0 Days 0 Hours 0 Minutes"
        let show_time = "0 Days 0 Hours 0 Minutes"

        const YEAR_START = new Date(`${new Date().getFullYear() }-01-01T00:00:00.000Z`)

        this.trakt.users.watched({ username: this.userId, type: "movies" }).then(async movies => {
            let year_total = 0;
            let time_in_minutes = 0;
            for (let i = 0; i < movies.data.length; i++) { 
                let movie = movies.data[i]
                if (new Date(movie.last_watched_at) > YEAR_START) {
                    year_total++

                    if (movie.movie.ids.trakt == SMALL_AXE_TRAKT_ID)
                        time_in_minutes += await this.tmdb.get_episode_runtime(SMALL_AXE_TMDB_ID)
                    else 
                        time_in_minutes += await this.tmdb.get_movie_runtime(movie.movie.ids.tmdb)
                }
            }

            num_movies = year_total
            movie_time = this.format_watch_time(time_in_minutes);
            client.emit("stats", { num_movies: num_movies, num_shows: num_shows, movie_time: movie_time, show_time: show_time })
        })

        this.trakt.users.watched({ username: this.userId, type: "shows" }).then(async shows => {
            let year_total = 0;
            let time_in_minutes = 0;
            for (let i = 0; i < shows.data.length; i++) {
                let show = shows.data[i]
                for (let j = 0; j < show.seasons.length; j++) {
                    let season = show.seasons[j]
                    for (let k = 0; k < season.episodes.length; k++) {
                        let episode = season.episodes[k]
                        //console.log(show)
                        if (new Date(episode.last_watched_at) > YEAR_START) {
                            year_total++

                            time_in_minutes += await this.tmdb.get_episode_runtime(show.show.ids.tmdb, season.number, episode.number)
                        }
                    }
                }
            }

            num_shows = year_total
            show_time = this.format_watch_time(time_in_minutes);
            client.emit("stats", { num_movies: num_movies, num_shows: num_shows, movie_time: movie_time, show_time: show_time })
        })
    }

    format_watch_time(time_in_minutes) {
        console.log(time_in_minutes)
        const MINUTES_PER_DAY = 1440
        const MINUTES_PER_HOUR = 60

        let formatted_watch_time = ""
        if (time_in_minutes > MINUTES_PER_DAY) {
            let days_watched = Math.floor(time_in_minutes / MINUTES_PER_DAY)
            formatted_watch_time += `${days_watched} Days `
            time_in_minutes -= days_watched * MINUTES_PER_DAY
        }
        if (time_in_minutes > MINUTES_PER_HOUR) {
            let hours_watched = Math.floor(time_in_minutes / MINUTES_PER_HOUR)
            formatted_watch_time += `${hours_watched} Hours `
            time_in_minutes -= hours_watched * MINUTES_PER_HOUR
        }
        if (time_in_minutes > 0) {
            formatted_watch_time += `${time_in_minutes} Minutes`
        }

        console.log(formatted_watch_time.trim())

        return formatted_watch_time.trim()
    }
}

export { TraktWrapper }