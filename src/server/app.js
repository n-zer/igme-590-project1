const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');
const utilities = require('./utilities.js');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../../hosted/client.html`);
const js = fs.readFileSync(`${__dirname}/../../hosted/bundle.js`);

const onRequest = (request, response) => {
  console.log(request.url);
  if (request.url === '/hosted/bundle.js') {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end(js);
  } else {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(index);
  }
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on port ${port}`);

const io = socketio(app);

io.on('connection', (socket) => {
  const initialSnapshot = {
    time: Date.now(),
    x: utilities.getRandomInt(0, 200),
    y: utilities.getRandomInt(0, 200),
    rotation: 0,
    color: utilities.getRandomBrightColor(),
  };

  socket.emit('initial', initialSnapshot);
  initialSnapshot.id = socket.id;
  socket.broadcast.emit('snapshot', initialSnapshot);

  socket.on('commandInfo', (data) => {
    const dataCopy = data;
    dataCopy.id = socket.id;
    socket.broadcast.emit('commandInfo', dataCopy);
  });

  socket.on('snapshot', (data) => {
    const dataCopy = data;
    dataCopy.id = socket.id;
    socket.broadcast.emit('snapshot', dataCopy);
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('terminate', { id: socket.id, time: Date.now() });
  });
});
