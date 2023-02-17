class Movie {
    constructor(title, poster, link) {
        this.title = title
        this.poster = poster
        this.link = link
    }

    set_rating(rating) {
        this.rating = rating
    }
}

export { Movie as default}