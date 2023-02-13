import express from 'express'
import http from 'http'
import { Movies } from './movies.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Server } from 'socket.io'

const app = express()
const server = http.createServer(app)
const io = new Server(server)


const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
});

app.get('/styles.css', (req, res) => {
    res.sendFile(__dirname + '/styles.css')
})

var movies = new Movies(__dirname + '/trakt_info.json')

io.on('connection', function (client) {
    console.log('Client connected...');

    client.on('join', function (data) {
        console.log(data);
        client.emit('now_playing', "TEST: " + movies.get_now_playing());
    });

});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
