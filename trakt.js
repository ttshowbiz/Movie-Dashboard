var initialized = false;
const Trakt = require('trakt.tv')

function initialize() {
    if(initialized)
        return

    let options = {
        client_id: 'b1558996f64a6bec213cd24b70822576a87462b400d31b548301e86533372a56',
        client_secret: 'e1b7eb3a848c57f6ab7871f9ac8758605252f1a638bd712218ce579e906cc79b',
        redirect_uri: null,   // defaults to 'urn:ietf:wg:oauth:2.0:oob'
        api_url: null,        // defaults to 'https://api.trakt.tv'
        useragent: null,      // defaults to 'trakt.tv/<version>'
        pagination: true      // defaults to false, global pagination (see below)
      }
      const trakt = new Trakt(options)
      const traktAuthUrl = trakt.get_url()
      
      trakt.exchange_code('code', 'csrf token (state)').then(result => {})

      initialized = true
}

function get_now_playing() {
    initialize()
    var now_playing = trakt.movies.watching()
    console.log("Now Playing: " + now_playing)
}