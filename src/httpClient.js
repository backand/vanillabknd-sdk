class httpClient {
  constructor (config = {}) {
    if (typeof window === 'undefined' && typeof window.XMLHttpRequest === 'undefined')
      throw new Error('XMLHttpRequest is not supported by the browser');

    this.config = Object.assign(config, {url: '/', method: 'GET', headers: {}})
  }
  request (config, scb, ecb) {
    let request = new XMLHttpRequest();
    request.onreadystatechange = () => {
      if (request.readyState == XMLHttpRequest.DONE) {
         if(request.status === 200){
           scb && scb(this._createResponse(request));
         }
         else {
           ecb && ecb(this._createResponse(request));
         }
      }
    }
    this._dispatch(request, Object.assign({}, this.config, config));
  }
  _dispatch (request, config) {
    request.open(config.method, `${config.baseURL ? config.baseURL+'/' : ''}${config.url}`, true);
    for (let header in config.headers) {
      console.log(header);
      request.setRequestHeader(header, config.headers[header]);
    }
    request.send(`${config.data && JSON.stringify(config.data)}`);
  }
  _createResponse (request) {
    return {
      data: JSON.parse(request.responseText),
      status: request.status,
      statusText: request.statusText,
      headers: request.getAllResponseHeaders()
    }
  }
}

function createInstance(config = {}) {
  var context = new httpClient(config);
  var instance = httpClient.prototype.request.bind(context);
  return instance;
}

// const defaultHttpClient = createInstance();
// defaultHttpClient.create = (config = {}) => createInstance(config);

export default createInstance;
