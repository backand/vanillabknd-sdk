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

(() => {
  'use strict';
  window['backand'] = {};
  window['backand'].initiate = (config = {}) => {
    Object.assign(defaults, config);
    if (!defaults.appName)
      throw new Error('appName is missing');
    if (!defaults.anonymousToken)
      throw new Error('anonymousToken is missing');
    if (!defaults.signUpToken)
      throw new Error('signUpToken is missing');

    let storage = new Storage(defaults.storageType, defaults.storagePrefix);
    let http = Http({
      baseURL: defaults.apiUrl
    });
    let socket = null;

    let scope = {
      storage,
      http,
    }

    if (defaults.runSocket) {
      socket = new Socket(defaults.socketUrl);
      scope.socket = socket;
    }

    let service = Object.assign({}, auth, crud, files);
    for (let fn in service) {
      // console.log(fn);
      service[fn] = service[fn].bind(scope);
    }
    service.__initiate__();

    window['backand'] = {
      service,
      constants,
      helpers,
    };
    if(defaults.runSocket) {
      storage.get('user') && storage.get('user').token.Authorization && socket.connect(storage.get('user').token.Authorization, defaults.anonymousToken, defaults.appName)
      window['backand'].socket = socket;
    }
  }
})();
