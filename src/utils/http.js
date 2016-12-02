import { Promise } from 'es6-promise'

class Http {
  constructor (config = {}) {
    if (!window.XMLHttpRequest)
      throw new Error('XMLHttpRequest is not supported by the browser');

    this.config = Object.assign({url: '/', method: 'GET', headers: {}}, config)
  }
  _getHeaders (headers) {
    return headers.split('\r\n').filter(header => header).map(header => {
      let jheader = {}
      let parts = header.split(':');
      jheader[parts[0]] = parts[1]
      return jheader;
    });
  }
  _getData (type, data) {
    if (!type) {
      return data;
    }
    else if (type.indexOf('json') === -1) {
      return data;
    }
    else {
      return JSON.parse(data);
    }
  }
  _createResponse (req) {
    return {
      status: req.status,
      statusText: req.statusText,
      headers: this._getHeaders(req.getAllResponseHeaders()),
      data: this._getData(req.getResponseHeader("Content-Type"), req.responseText)
    }
  }
  _setHeaders (req, headers) {
    for (let header in headers) {
      req.setRequestHeader(header, headers[header]);
    }
  }
  _setData (req, data) {
    if (!data) {
      req.send();
    }
    else if (typeof data != 'object') {
      req.send(data);
    }
    else {
      req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      req.send(JSON.stringify(data));
    }
  }
  request (cfg, scb , ecb) {
    return new Promise((resolve, reject) => {
      let req = new XMLHttpRequest();
      let config = Object.assign({}, this.config, cfg);
      config.interceptors.request && config.interceptors.request(config);

      req.open(config.method, `${config.baseURL ? config.baseURL+'/' : ''}${config.url}`, true);
      req.onreadystatechange = () => {
        if (req.readyState == XMLHttpRequest.DONE) {
          let res = this._createResponse(req);
          if (res.status === 200){
            if (config.interceptors.response) {
              config.interceptors.response.call(this, res, config, resolve, reject, scb, ecb);
            }
            else {
              scb && scb(res);
              resolve(res);
            }
          }
          else {
            if (config.interceptors.responseError) {
              config.interceptors.responseError.call(this, res, config, resolve, reject, scb, ecb);
            }
            else {
              ecb && ecb(res);
              reject(res);
            }
          }
        }
      }
      this._setHeaders(req, config.headers);
      this._setData(req, config.data);
    });
  }

}

function createInstance(config = {}) {
  var context = new Http(config);
  var instance = (...args) => Http.prototype.request.apply(context, args);
  instance.config = context.config;
  return instance;
}
export default createInstance;

// var context = new Http(config);
// var instance = (...args) => httpClient.prototype.request.apply(context, args);
// instance.config = context.config;
// export default instance;
