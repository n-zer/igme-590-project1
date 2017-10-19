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

const roomCounts = [0];
const MAX_ROOM_SIZE = 15; // Max players per room

console.log(`Listening on port ${port}, maximum room size is ${MAX_ROOM_SIZE}`);

const io = socketio(app);

io.on('connection', (socket) => {
  // Put new user in the first room that isn't maxed
  let roomNumber = 0;
  while (roomCounts[roomNumber] >= MAX_ROOM_SIZE) roomNumber++;
  const roomString = `room${roomNumber}`;
  roomCounts[roomNumber]++;
  socket.join(roomString);

  // Generate a random position and color
  const initialSnapshot = {
    time: Date.now(),
    x: utilities.getRandomInt(0, 200),
    y: utilities.getRandomInt(0, 200),
    rotation: 0,
    color: utilities.getRandomBrightColor(),
  };

  // Send the initial to them without an ID and everyone else with the ID
  socket.emit('initial', initialSnapshot);
  initialSnapshot.id = socket.id;
  socket.broadcast.to(roomString).emit('initial', initialSnapshot);

  // Commands get an ID appended, then are echoed to all but the sender
  socket.on('commandInfo', (data) => {
    const dataCopy = data;
    dataCopy.id = socket.id;
    socket.broadcast.to(roomString).emit('commandInfo', dataCopy);
  });

  // Same as above, but for snapshots
  socket.on('snapshot', (data) => {
    const dataCopy = data;
    dataCopy.id = socket.id;
    socket.broadcast.to(roomString).emit('snapshot', dataCopy);
  });

  // Send a terminate to the rest of the room on a DC
  socket.on('disconnect', () => {
    socket.broadcast.to(roomString).emit('terminate', { id: socket.id, time: Date.now() });
    socket.leave(roomString);
    roomCounts[roomNumber]--;
  });

  // Messages get an ID appended and are echoed
  socket.on('message', (data) => {
    const obj = { id: socket.id, message: data };
    socket.broadcast.to(roomString).emit('message', obj);
  });
});
