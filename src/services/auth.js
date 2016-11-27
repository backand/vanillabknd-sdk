import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'
import defaults from './../defaults'

export function __initiate__ () {
  this.storage.get('user') && __setAuth__.call(this, this.storage.get('user'));
}
function __generateFakeResponse__ (status = 0, statusText = '', headers = [], data = '') {
  return {
    status,
    statusText,
    headers,
    data
  }
}
function __dispatchEvent__ (name) {
  let event;
  if (document.createEvent) {
    event = document.createEvent('Event');
    event.initEvent(name, true, true);
    event.eventName = name;
    window.dispatchEvent(event);
  } else {
    event = document.createEventObject();
    event.eventType = name;
    event.eventName = name;
    window.fireEvent('on' + event.eventType, event);
  }
}
function __clearAuth__ () {
  this.storage.remove('user');
  delete this.http.config.headers['AnonymousToken'];
  delete this.http.config.headers['Authorization'];
}
function __setAuth__ (data) {
  this.storage.set('user', data);
  this.http.config.headers =
    Object.assign(this.http.config.headers, this.storage.get('user').token)
}
// function _handleRefreshToken () {
//   BKStorage.token.clear();
//
//   var user = BKStorage.user.get();
//   var refreshToken;
//   if (!user || !(refreshToken = BKStorage.user.get().refresh_token)) {
//       return;
//   }
//
//   var tokenData = {
//       grant_type: 'password',
//       refreshToken: refreshToken,
//       username: username,
//       appName: config.appName
//   };
//   return authenticate(tokenData);
// };
export function useAnonymousAuth (scb) {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    __setAuth__.call(this, {
      token: {
        AnonymousToken: defaults.anonymousToken
      },
      details: {
        username: 'anonymous',
        name: 'anonymous user'
      }
    });
    scb && scb(__generateFakeResponse__(200, 'OK', [], this.storage.get('user')));
    resolve(__generateFakeResponse__(200, 'OK', [], this.storage.get('user')));
  });
}
export function signin (username, password, scb, ecb) {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    this.http({
      url: URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `username=${username}&password=${password}&appName=${defaults.appName}&grant_type=password`
    })
    .then(response => {
      __setAuth__.call(this, {
        token: {
          Authorization: `Bearer ${response.data.access_token}`
        },
        details: response.data
      });
      __dispatchEvent__(EVENTS.SIGNIN);
      if (defaults.runSocket) {
        this.socket.connect(this.storage.get('user').token.Authorization, defaults.anonymousToken, defaults.appName);
      }
      scb && scb(response);
      resolve(response);
    })
    .catch(error => {
      ecb && ecb(error);
      reject(error);
    });
  });
}
export function signup (email, password, confirmPassword, firstName, lastName, scb, ecb) {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    this.http({
      url: URLS.signup,
      method: 'POST',
      headers: {
        'SignUpToken': defaults.signUpToken
      },
      data: {
        firstName,
        lastName,
        email,
        password,
        confirmPassword
      }
    }, scb , ecb)
    .then(response => {
      __dispatchEvent__(EVENTS.SIGNUP);
      if(defaults.runSigninAfterSignup) {
        return __signinWithToken__.call(this, {
          accessToken: response.data.access_token
        });
      }
      else {
        scb && scb(response);
        resolve(response);
      }
    })
    .then(response => {
      scb && scb(response);
      resolve(response);
    })
    .catch(error => {
      ecb && ecb(error);
      reject(error);
    });
  });
}
function __getSocialUrl__ (providerName, isSignup, isAutoSignUp) {
  let provider = SOCIAL_PROVIDERS[providerName];
  let action = isSignup ? 'up' : 'in';
  let autoSignUpParam = (!isSignup && isAutoSignUp) ? "&signupIfNotSignedIn=true" : '';
  return `/user/socialSign${action}?provider=${provider.label}${autoSignUpParam}&response_type=token&client_id=self&redirect_uri=${provider.url}&state=`;
}
function __checkSocialAuthWindowForData__ (socialAuthWindow) {
  let timer = setInterval(() => {
    if(socialAuthWindow.closed) { clearInterval(timer); }
    let locationCopy = Object.assign({}, socialAuthWindow.location);
    let dataMatch = /\?(data|error)=(.+)/.exec(locationCopy.href);
    if (dataMatch && dataMatch[1] && dataMatch[2]) {
       clearInterval(timer);
       let data = dataMatch[1] === 'data' ?
        __generateFakeResponse__(200, 'OK', [], JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, '')))) :
        __generateFakeResponse__(0, '', [], JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, ''))))
        socialAuthWindow.opener.postMessage(JSON.stringify(data), locationCopy.origin);
    }
  }, 333);
}
function __socialAuth__ (provider, isSignUp, spec, email, scb, ecb) {
  return new Promise((resolve, reject) => {
    if (!SOCIAL_PROVIDERS[provider]) {
      ecb && ecb(__generateFakeResponse__(0, '', [], 'Unknown Social Provider'));
      reject(__generateFakeResponse__(0, '', [], 'Unknown Social Provider'));
    }
    let windowUrl =  `${defaults.apiUrl}/1/${__getSocialUrl__(provider, isSignUp, true)}&appname=${defaults.appName}${email ? '&email='+email : ''}&returnAddress=`
    let socialAuthWindow = window.open('', '', spec);
    socialAuthWindow.location = windowUrl;
    socialAuthWindow.focus();
    window.addEventListener('message', e => {
      let origin = e.origin || e.originalEvent.origin;
      if (origin !== location.origin) {
        ecb && ecb(this._generateFakeResponse(0, '', [], 'Unknown Origin Message'));
        reject(this._generateFakeResponse(0, '', [], 'Unknown Origin Message'));
      }
      window.removeEventListener('message', null, false);
      socialAuthWindow.close();
      // setTimeout(socialAuthWindow = null, 1000);

      let res = JSON.parse(e.data)
      if (res.status != 200) {
        ecb && ecb(res);
        reject(res);
      }
      else {
        scb && scb(res);
        resolve(res);
      }
    }, false);
    __checkSocialAuthWindowForData__(socialAuthWindow);
  });
}
export function socialSignin (provider, scb, ecb, spec = 'left=1, top=1, width=600, height=600') {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    __socialAuth__(provider, false, spec, null, scb, ecb)
      .then(response => {
        __dispatchEvent__(EVENTS.SIGNUP);
        return __signinWithToken__.call(this, {
          accessToken: response.data.access_token
        });
      })
      .then(response => {
        scb && scb(response);
        resolve(response);
      })
      .catch(error => {
        ecb && ecb(error);
        reject(error);
      });
  });
};
export function socialSignup (provider, email, scb, ecb, spec = 'left=1, top=1, width=600, height=600') {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    _socialAuth(provider, true, spec, email, scb, ecb)
      .then(response => {
        __dispatchEvent__(EVENTS.SIGNUP);
        if(defaults.runSigninAfterSignup) {
          return __signinWithToken__.call(this, {
            accessToken: response.data.access_token
          });
        }
        else {
          scb && scb(response);
          resolve(response);
        }
      })
      .then(response => {
        scb && scb(response);
        resolve(response);
      })
      .catch(error => {
        ecb && ecb(error);
        reject(error);
      });
  });

}
function __signinWithToken__ (tokenData, scb, ecb) {
  return new Promise((resolve, reject) => {
    __clearAuth__.call(this);
    let data = [];
    for (let obj in tokenData) {
        data.push(encodeURIComponent(obj) + '=' + encodeURIComponent(tokenData[obj]));
    }
    data = data.join("&");

    this.http({
      url: URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `${data}&appName=${defaults.appName}&grant_type=password`
    })
    .then(response => {
      __setAuth__.call(this, {
        token: {
          Authorization: `Bearer ${response.data.access_token}`
        },
        details: response.data
      });
      __dispatchEvent__(EVENTS.SIGNIN);
      if (defaults.runSocket) {
        this.socket.connect(this.storage.get('user').token.Authorization, defaults.anonymousToken, defaults.appName);
      }
      scb && scb(response);
      resolve(response);
    })
    .catch(error => {
      ecb && ecb(error);
      reject(error);
    });
  });
}
export function requestResetPassword (username, scb, ecb) {
  return this.http({
    url: URLS.requestResetPassword,
    method: 'POST',
    data: {
        appName: defaults.appName,
        username
    }
  }, scb, ecb)
}
export function resetPassword (newPassword, resetToken, scb, ecb) {
  return this.http({
    url: URLS.resetPassword,
    method: 'POST',
    data: {
        newPassword,
        resetToken
    }
  }, scb, ecb)
}
export function changePassword (oldPassword, newPassword, scb, ecb) {
  return this.http({
    url: URLS.changePassword,
    method: 'POST',
    data: {
        oldPassword,
        newPassword
    }
  }, scb, ecb)
}
export function signout (scb) {
  __clearAuth__.call(this);
  __dispatchEvent__(EVENTS.SIGNOUT);
}
export function getUserDetails() {
  return this.storage.get('user').details;
}
