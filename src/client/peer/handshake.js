'use strict';
const Peer = require('./Peer.js');
const debug = require('debug')('peer-calls:peer');
const dispatcher = require('../dispatcher/dispatcher.js');
const notify = require('../action/notify.js');
const _ = require('underscore');

function init(socket, roomName, stream) {
  let peers = {};

  function createPeer(user, initiator) {
    debug('create peer: %s', user.id);
    notify.warn('Initializing new peer connection');

    let peer = peers[user.id] = Peer.init({
      initiator: '/#' + socket.id === initiator,
      stream,
      config: {
        iceServers: [{
          url: 'stun:23.21.150.121',
          urls: 'stun:23.21.150.121'
        }, {
          url: 'turn:numb.viagenie.ca',
          credential: 'muazkh',
          username: 'webrtc@live.com'
        }]
      }
    });

    peer.once('error', err => {
      debug('peer: %s, error %s', user.id, err.stack);
      notify.error('A peer connection error occurred');
      destroyPeer(user.id);
    });

    peer.on('signal', signal => {
      debug('peer: %s, signal: %o', user.id, signal);

      let payload = { userId: user.id, signal };
      socket.emit('signal', payload);
    });

    peer.once('connect', () => {
      debug('peer: %s, connect', user.id);
      notify.warn('Peer connection established');
      dispatcher.dispatch({ type: 'play' });
    });

    peer.on('stream', stream => {
      debug('peer: %s, stream', user.id);
      dispatcher.dispatch({
        type: 'add-stream',
        userId: user.id,
        stream
      });
    });

    peer.once('close', () => {
      debug('peer: %s, close', user.id);
      notify.error('Peer connection closed');
      dispatcher.dispatch({
        type: 'remove-stream',
        userId: user.id
      });
      delete peers[user.id];
    });
  }

  function destroyPeer(userId) {
    debug('destroy peer: %s', userId);
    let peer = peers[userId];
    if (!peer) return debug('peer: %s peer not found', userId);
    peer.destroy();
    delete peers[userId];
  }

  socket.on('signal', payload => {
    let peer = peers[payload.userId];
    let signal = payload.signal;
    // debug('socket signal, userId: %s, signal: %o', payload.userId, signal);

    if (!peer) return debug('user: %s, no peer found', payload.userId);
    peer.signal(signal);
  });


  socket.on('users', payload => {
    let { initiator, users } = payload;
    debug('socket users: %o', users);
    notify.info('Connected users: {0}', users.length);

    users
    .filter(user => !peers[user.id] && user.id !== '/#' + socket.id)
    .forEach(user => createPeer(user, initiator));

    let newUsersMap = _.indexBy(users, 'id');
    _.chain(peers)
    .map((peer, id) => id)
    .filter(id => !newUsersMap[id])
    .each(destroyPeer);
  });

  debug('socket.id: %s', socket.id);
  debug('emit ready for room: %s', roomName);
  notify.info('Ready for connections');
  socket.emit('ready', roomName);
}

module.exports = { init };