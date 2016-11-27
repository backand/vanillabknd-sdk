export default class Socket {
  constructor (url) {
    if (!window.io)
      console.warn('SocketIO is not included');
    this.url = url;
    this.socket = io.connect(this.url, {'forceNew':true });
  }
  connect (token, anonymousToken, appName) {
    console.info(`trying to establish a socket connection to ${appName} ...`);
    this.socket.emit("login", token, anonymousToken, appName);

    this.socket.on('authorized', () => {
      console.info(`socket connected`);
    });

    this.socket.on('notAuthorized', () => {
      setTimeout(this.disconnect(), 1000);

    });

    this.socket.on('disconnect', () => {
      console.info(`socket disconnect`);
    });

    this.socket.on('reconnecting', () => {
      console.info(`socket reconnecting`);
    });

    this.socket.on('error', (error) => {
      console.warn(`error: ${error}`);
    });
  }
  on (eventName, callback) {
    this.socket.on(eventName, () => {
      var args = [...arguments];
      callback.apply(this.socket, args);
    });
  }
  emit (eventName, data, callback) {
    this.socket.emit(eventName, data, () => {
      var args = [...arguments];
      callback.apply(this.socket, args);
    });
  }
  disconnect () {
    if (this.socket) {
      this.socket.close();
    }
  }
}
