/***********************************************
 * backand JavaScript Library
 * Authors: backand
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 * Compiled At: 26/11/2016
 ***********************************************/
import defaults from './defaults'
import * as constants from './constants'
import * as helpers from './helpers'
import Storage from './utils/storage'
import Http from './utils/http'
import Socket from './utils/socket'
import * as auth from './services/auth'
import * as crud from './services/crud'
import * as files from './services/files'

let backand = {
  constants,
  helpers,
}
backand.initiate = (config = {}) => {

  // combine defaults with user config
  Object.assign(defaults, config);
  // console.log(defaults);

  // verify new defaults
  if (!defaults.appName)
    throw new Error('appName is missing');
  if (!defaults.anonymousToken)
    throw new Error('anonymousToken is missing');
  if (!defaults.signUpToken)
    throw new Error('signUpToken is missing');

  // init globals
  let storage = new Storage(defaults.storage, defaults.storagePrefix);
  let http = Http.create({
    baseURL: defaults.apiUrl
  });
  let scope = {
    storage,
    http,
    isIE: window.document && (false || !!document.documentMode),
  }
  let socket = null;
  if (defaults.runSocket) {
    socket = new Socket(defaults.socketUrl);
    scope.socket = socket;
  }

  // bind globals to all service functions
  let service = Object.assign({}, auth, crud, files);
  for (let fn in service) {
    service[fn] = service[fn].bind(scope);
  }

  // set interceptor for authHeaders & refreshToken
  http.config.interceptors = {
    request: function(config) {
      if (config.url.indexOf(constants.URLS.token) ===  -1 && storage.get('user')) {
        config.headers = Object.assign({}, config.headers, storage.get('user').token)
      }
    },
    responseError: function (error, config, resolve, reject, scb, ecb) {
      if (config.url.indexOf(constants.URLS.token) ===  -1
       && defaults.manageRefreshToken
       && error.status === 401
       && error.data && error.data.Message === 'invalid or expired token') {
         auth.__handleRefreshToken__.call(scope, error)
         .then(response => {
           this.request(config, scb, ecb);
         })
         .catch(error => {
           ecb && ecb(error);
           reject(error);
         })
      }
      else {
        ecb && ecb(error);
        reject(error);
      }
    }
  }

  // get data from url in social sign-in popup
  if (!defaults.isMobile) {
    let dataMatch = /\?(data|error)=(.+)/.exec(window.location.href);
    if (dataMatch && dataMatch[1] && dataMatch[2]) {
      let data = {
        data: JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, '')))
      }
      data.status = (dataMatch[1] === 'data') ? 200 : 0;
      localStorage.setItem('SOCIAL_DATA', JSON.stringify(data));
      // var isIE = false || !!document.documentMode;
      // if (!isIE) {
      //   window.opener.postMessage(JSON.stringify(data), location.origin);
      // }
    }
  }

  // expose backand namespace to window
  delete backand.initiate;
  Object.assign(backand, {service});
  if(defaults.runSocket) {
    storage.get('user') && socket.connect(storage.get('user').token.Authorization || null, defaults.anonymousToken, defaults.appName)
    Object.assign(backand, {socket});
  }

}

module.exports = backand
