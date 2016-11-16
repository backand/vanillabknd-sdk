import axios from 'axios'
import BackandStorage from './BackandStorage'
import { URLS } from './BackandConstants'

export default class BackandService {
  constructor () {
    this.instance = axios.create({
      baseURL: URLS.apiUrl
    });

    this.storage = new BackandStorage();
    if (this.storage.user) this._setAuthHeader()
  }
  /*** AUTH ***/
  _clearAuthHeader() {
    delete this.instance.defaults.headers.common['AnonymousToken'];
    delete this.instance.defaults.headers.common['Authorization'];
  }
  _setAuthHeader () {
    this.instance.defaults.headers.common =
      Object.assign(this.instance.defaults.headers.common, this.storage.user.token)
  }
  useAnonymousAuth (successCallback) {
    this._clearAuthHeader();
    this.storage.setUser({
      token: {
        AnonymousToken: this.storage.anonymous_token
      },
      details: {
        username: 'anonymous',
        name: 'anonymous user'
      }
    });
    this._setAuthHeader();
    successCallback({
      status: 200,
      data: this.storage.user
    });
  }
  signin (username, password, successCallback, errorCallback) {
    this._clearAuthHeader();
    this.instance({
      url: URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `username=${username}&password=${password}&appName=${this.storage.app_name}&grant_type=password`
    })
    .then(response => {
      this.storage.setUser({
        token: {
          Authorization: `Bearer ${response.data.access_token}`
        },
        details: response.data
      });
      this._setAuthHeader();
      successCallback(response);
    })
    .catch(error => {
      errorCallback(error.response);
    });
  }
  signup (email, password, confirmPassword, firstName, lastName) {
    this._clearAuthHeader();
    this.instance({
      url: URLS.signup,
      method: 'POST',
      headers: {
        'SignUpToken': this.storage.signUpToken
      },
      data: {
        firstName,
        lastName,
        email,
        password,
        confirmPassword
      }
    })
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.log(error);
    });
  }
  /*** CRUD ***/
  _encodeParameters (allowedParams, params) {
    let uri = '?';
    for (let param in params) {
      if (allowedParams.indexOf(param) != -1) {
        uri = uri.concat(`${param}=${encodeURI(JSON.stringify(params[param]))}`)
      }
    }
    return uri;
  }
  getItems (object, params, successCallback, errorCallback) {
    const allowedParams = ['pageSize','pageNumber','filter','sort','search','exclude','deep','relatedObjects'];
    return this.instance({
      url: `${URLS.actionUrl}${object}${this._encodeParameters(allowedParams, params)}`,
      method: 'GET',
    })
    .then(response => {
      successCallback(response);
    })
    .catch(error=> {
      errorCallback(error.response);
    });
  }
  postItem (object, data, params, successCallback, errorCallback) {
    const allowedParams = ['returnObject','deep'];
    return this.instance({
      url: `${URLS.actionUrl}${object}${this._encodeParameters(allowedParams, params)}`,
      method: 'POST',
      data,
    })
    .then(response => {
      successCallback(response);
    })
    .catch(error=> {
      errorCallback(error.response);
    });
  }
  getItem (object, id, params, successCallback, errorCallback) {
    const allowedParams = ['deep','exclude','level'];
    return this.instance({
      url: `${URLS.actionUrl}${object}/${id}${this._encodeParameters(allowedParams, params)}`,
      method: 'GET',
    })
    .then(response => {
      successCallback(response);
    })
    .catch(error=> {
      errorCallback(error.response);
    });
  }
  updateItem (object, id, data, params, successCallback, errorCallback) {
    const allowedParams = ['returnObject','deep'];
    return this.instance({
      url: `${URLS.actionUrl}${object}/${id}${this._encodeParameters(allowedParams, params)}`,
      method: 'PUT',
      data,
    })
    .then(response => {
      successCallback(response);
    })
    .catch(error=> {
      errorCallback(error.response);
    });
  }
  deleteItem (object, id, successCallback, errorCallback) {
    return this.instance({
      url: `${URLS.actionUrl}${object}/${id}`,
      method: 'DELETE',
    })
    .then(response => {
      successCallback(response);
    })
    .catch(error=> {
      errorCallback(error.response);
    });
  }
}
