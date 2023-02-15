import express from 'express'
import http from 'http'
import { TraktWrapper } from './wrappers/trakt.js'
import get_full_path from './files.js'
import { Server } from 'socket.io'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.get('/', (req, res) => {
    res.sendFile(get_full_path('/index.html'))
});

app.get('/css/styles.css', (req, res) => {
    res.sendFile(get_full_path('/css/styles.css'))
})

app.get('/css/carousel.css', (req, res) => {
    res.sendFile(get_full_path('/css/carousel.css'))
})

server.listen(3000, () => {
  console.log('listening on *:3000');
});


const trakt = new TraktWrapper(get_full_path('/trakt_info.json'), io)

io.on('connection', function (client) {
    console.log('Client connected...');

    client.on('join', function () {

        trakt.get_now_playing(client)
        trakt.get_watch_history(client)

        setInterval(() => {
            trakt.get_now_playing(client)
        }, 5000)

        setInterval(() => {
            trakt.get_watch_history(client)
        }, 300000)

    });
});
