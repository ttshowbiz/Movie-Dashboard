import fs from 'fs'
import get_full_path from '../files.js'
import Movie from '../movie.js'
import TmdbWrapper from './tmdb.js'
import Trakt from 'trakt.tv'

const SMALL_AXE_TRAKT_ID = 865887
const SMALL_AXE_TMDB_ID = 90705

class TraktWrapper {
    /**
     * Constructs a TraktWrapper object from the Trakt user id, client id, 
     * and client secret provided in the info_file.
     * 
     * @constructs TraktWrapper
     * 
     * @param {string} info_file Path to a json file containing user_id, client_id, and client_secret elements.
     */
    constructor(info_file) {

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

    /**
     * Initializes the Trakt object used to make api calls to Trakt.
     * 
     * @param {string} client_id     Trakt API client id
     * @param {string} client_secret Trakt API client secret
     */
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

    /**
     * Gets the currently playing movie or tv episode from Trakt.
     * 
     * @param {any} client client object to send the now playing info.
     */
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
        }).catch(error => {
            console.group(`Failed to retrieve now playing for ${this.userId}`)
            console.log(error)
            console.groupEnd()
        })
    }

    /**
     * Gets movie watch history from Trakt. Only sends the history to the client 
     * if new movies were found unless force_send is set to true.
     * 
     * @param {any} client     Client object to send watch history to.
     * @param {boolean} force_send When true the watch history will always be sent to the client.
     */
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
        }).catch(error => {
            console.group("Failed to get watch history")
            console.log(error)
            console.groupEnd()
        })
    }

    /**
     * Gets the poster and the web link for a list of movies provided by Trakt.
     * 
     * @param {JSON} watch_history Trakt watch history data
     * @returns If a new movie is added to this.movies true, otherwise false.
     */
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
                    const SMALL_AXE_TMDB_ID = 90705
                    poster = await this.tmdb.get_show_poster(SMALL_AXE_TMDB_ID).catch(error => {
                        console.group(`Failed to get poster for ${movie.movie.title} (id: ${movie.movie.ids.trakt})`)
                        console.log(error)
                        console.groupEnd()
                    })
                }
                else {
                    poster = await this.tmdb.get_movie_poster(tmdb_id).catch(error => {
                        console.group(`Failed to get poster for ${movie.movie.title} (id: ${movie.movie.ids.trakt})`)
                        console.log(error)
                        console.groupEnd()
                    })
                }
                        
                this.movies.set(trakt_id, new Movie(movie.movie.title, poster, link))
            }
        }

        return new_movie_added
    }

    /**
     * Sends an array to the client containing the count of movies different ratings.
     * (e.g. if there were 5 movies, rated 7, 7, 1, 10, and 5 [0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 1] would be returned)
     * 
     * @param {any} client client to return the ratings to.
     */
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
        }).catch(error => {
            console.group("Failed to get movie ratings from Trakt")
            console.log(error)
            console.groupEnd()
        })
    }

    async get_stats(client) {
        let num_movies = 0;
        let movie_time = ""
        let oldest_movie = ""
        let newest_movie = ""
        let num_shows = 0;
        let show_time = ""
        let oldest_show = ""
        let newest_show = ""

        const YEAR_START = new Date(`${new Date().getFullYear() }-01-01T00:00:00.000Z`)

        this.trakt.users.watched({ username: this.userId, type: "movies" }).then(async movies => {
            let year_total = 0;
            let time_in_minutes = 0;
            let oldest
            let newest
            for (let i = 0; i < movies.data.length; i++) { 
                let movie = movies.data[i]
                if (new Date(movie.last_watched_at) > YEAR_START) {
                    year_total++

                    let movie_info = await this.tmdb.get_movie_info(movie.movie.ids.tmdb)
                    time_in_minutes += movie_info.runtime
                    let release_date = new Date(movie_info.release_data)
                    if (!oldest || release_date < oldest) {
                        oldest = release_date
                        oldest_movie = `${movie.movie.title} (${oldest.getFullYear()})`
                    } 
                    if (!newest || release_date > newest) {
                        newest = release_date
                        newest_movie = `${movie.movie.title} (${newest.getFullYear()})`
                    }
                }
            }

            num_movies = year_total
            movie_time = this.format_watch_time(time_in_minutes);
            client.emit("stats", {
                num_movies: num_movies,
                movie_time: movie_time,
                movie_oldest: oldest_movie,
                movie_newest: newest_movie,
                num_shows: num_shows,
                show_time: show_time,
                show_oldest: oldest_show,
                show_newest: newest_show
            })
        })

        this.trakt.users.watched({ username: this.userId, type: "shows" }).then(async shows => {
            let oldest
            let newest
            let year_total = 0;
            let time_in_minutes = 0;
            for (let i = 0; i < shows.data.length; i++) {
                let show = shows.data[i]
                let show_date = await this.tmdb.get_show_date(show.show.ids.tmdb)
                let release_date = new Date(show_date)
                if (!oldest || release_date < oldest) {
                    oldest = release_date
                    oldest_show = `${show.show.title} (${oldest.getFullYear()})`
                }
                if (!newest || release_date > newest) {
                    newest = release_date
                    newest_show = `${show.show.title} (${newest.getFullYear()})`
                }

                for (let j = 0; j < show.seasons.length; j++) {
                    let season = show.seasons[j]
                    for (let k = 0; k < season.episodes.length; k++) {
                        let episode = season.episodes[k]
                        if (new Date(episode.last_watched_at) > YEAR_START) {
                            year_total++

                            let runtime = await this.tmdb.get_episode_runtime(show.show.ids.tmdb, season.number, episode.number)
                            time_in_minutes += runtime
                        }
                    }
                }
            }

            num_shows = year_total
            show_time = this.format_watch_time(time_in_minutes);
            client.emit("stats", {
                num_movies: num_movies,
                movie_time: movie_time,
                movie_oldest: oldest_movie,
                movie_newest: newest_movie,
                num_shows: num_shows,
                show_time: show_time,
                show_oldest: oldest_show,
                show_newest: newest_show
            })
        })
    }

    format_watch_time(time_in_minutes) {
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

        return formatted_watch_time.trim()
    }
}

export { TraktWrapper }