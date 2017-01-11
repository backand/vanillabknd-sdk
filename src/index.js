/***********************************************
 * backand JavaScript Library
 * Authors: backand
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 * Compiled At: 26/11/2016
 ***********************************************/
import defaults from './defaults'
import * as constants from './constants'
import * as helpers from './helpers'

import utils from './utils/utils'
import Storage from './utils/storage'
import Http from './utils/http'
import Socket from './utils/socket'

import auth from './services/auth'
import object from './services/object'
import file from './services/file'
import query from './services/query'
import user from './services/user'

// get data from url in social sign-in popup
// let dataMatch = /\?(data|error)=(.+)/.exec(window.location.href);
let dataMatch = /(data|error)=(.+)/.exec(window.location.href);
if (dataMatch && dataMatch[1] && dataMatch[2]) {
  let data = {
    data: JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, '')))
  }
  data.status = (dataMatch[1] === 'data') ? 200 : 0;
  var isIE = false || !!document.documentMode;
  if (!isIE) {
    window.opener.postMessage(JSON.stringify(data), location.origin);
  }
  else {
    localStorage.setItem('SOCIAL_DATA', JSON.stringify(data));
  }
}

let backand = {
  constants,
  helpers,
}
backand.init = (config = {}) => {

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

  // init utils
  Object.assign(utils, {
    storage: new Storage(defaults.storage, defaults.storagePrefix),
    http: Http.create({
      baseURL: defaults.apiUrl
    }),
    isIE: window.document && (false || !!document.documentMode),
    ENV: 'browser',
  });
  if (defaults.runSocket) {
    Object.assign(utils, {
      socket: new Socket(defaults.socketUrl)
    });
  }

  utils.http.config.interceptors = {
    request: function(config) {
      if (config.url.indexOf(constants.URLS.token) ===  -1 && utils.storage.get('user')) {
        config.headers = Object.assign({}, config.headers, utils.storage.get('user').token)
      }
    },
    responseError: function (error, config, resolve, reject, scb, ecb) {
      if (config.url.indexOf(constants.URLS.token) ===  -1
       && defaults.manageRefreshToken
       && error.status === 401
       && error.data && error.data.Message === 'invalid or expired token') {
         auth.__handleRefreshToken__()
           .then(response => {
             utils.http.request(config, scb, ecb);
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

  // expose backand namespace to window
  delete backand.init;
  Object.assign(
    backand,
    auth,
    {
      defaults,
      object,
      file,
      query,
      user,
    }
  );
  if(defaults.runSocket) {
    utils.storage.get('user') && utils.socket.connect(
      utils.storage.get('user').token.Authorization || null,
      defaults.anonymousToken,
      defaults.appName
    );
    Object.assign(backand, {on: utils.socket.on.bind(utils.socket)});
  }

}

module.exports = backand
