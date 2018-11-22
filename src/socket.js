const fs = require('fs');
const tls = require('tls');
const shuffle = require('lodash.shuffle');
const config = require('../config').socket;

console.log(config);

const known_clients = {};

function randomIdleClient() {
    return new Promise((resolve, reject) => {
        function tryToResolve() {
            const idle = Object.keys(known_clients).filter(id => known_clients[id].idle);
            if (!idle.length) {
                console.log('all clients busy at the moment, try again in a second');
                return setTimeout(tryToResolve, 1000);
            }
            resolve(known_clients[shuffle(idle)[0]]);
        }
        tryToResolve();
    })
}

module.exports = tls.createServer(config.tls, (socket) => {
    console.log('new socket connected!');

    let client_id;

    function sendMessage(o) {
        socket.write(JSON.stringify(o));
    }

    socket.on('data', function(data) {
        let message;
        try {
            message = JSON.parse(data);
        } catch (e) {
            // socket.sendEndMessage({result: result});
            return console.log('json error', e);
        }
        switch (message.type) {
            case 'IDLE':
                if (!known_clients[message.client_id]) {
                    console.log('there is a new client!');
                    client_id = message.client_id;
                    known_clients[message.client_id] = { idle: false };
                }
                known_clients[message.client_id].idle = true;
                // maybe send job to client
                break;
        }
    });

});

