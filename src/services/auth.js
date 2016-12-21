import { Promise } from 'es6-promise'
import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'
import defaults from './../defaults'

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
  if(defaults.isMobile)
    return;
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
export function __handleRefreshToken__ (error) {
  return new Promise((resolve, reject) => {
    let user = this.storage.get('user');
    if (!user || !user.details.refresh_token) {
      reject(__generateFakeResponse__(0, '', [], 'No cached user or refreshToken found. authentication is required.'));
    }
    else {
      __signinWithToken__.call(this, {
        username: user.details.username,
        refreshToken: user.details.refresh_token,
      })
      .then(response => {
        resolve(response);
      })
      .catch(error => {
        reject(error);
      });
    }
  })
};
export function useAnonymousAuth (scb) {
  return new Promise((resolve, reject) => {
    let details = {
      "access_token": defaults.anonymousToken,
      "token_type": "AnonymousToken",
      "expires_in": 0,
      "appName": defaults.appName,
      "username": "Guest",
      "role": "User",
      "firstName": "anonymous",
      "lastName": "anonymous",
      "fullName": "",
      "regId": 0 ,
      "userId": null
    }
    this.storage.set('user', {
      token: {
        AnonymousToken: defaults.anonymousToken
      },
      details,
    });
    __dispatchEvent__(EVENTS.SIGNIN);
    if (defaults.runSocket) {
      this.socket.connect(null, defaults.anonymousToken, defaults.appName);
    }
    scb && scb(__generateFakeResponse__(200, 'OK', [], details));
    resolve(__generateFakeResponse__(200, 'OK', [], details));
  });
}
export function signin (username, password, scb, ecb) {
  return new Promise((resolve, reject) => {
    this.http({
      url: URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: `username=${username}&password=${password}&appName=${defaults.appName}&grant_type=password`
    })
    .then(response => {
      this.storage.set('user', {
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
export function signup (email, password, confirmPassword, firstName, lastName, parameters = {}, scb, ecb) {
  return new Promise((resolve, reject) => {
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
        confirmPassword,
        parameters
      }
    }, scb , ecb)
    .then(response => {
      __dispatchEvent__(EVENTS.SIGNUP);
      if(defaults.runSigninAfterSignup) {
        return signin.call(this, response.data.username, password);
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
  let autoSignUpParam = `&signupIfNotSignedIn=${(!isSignup && isAutoSignUp) ? 'true' : 'false'}`;
  return `/user/socialSign${action}?provider=${provider.label}${autoSignUpParam}&response_type=token&client_id=self&redirect_uri=${provider.url}&state=`;
}
function __socialAuth__ (provider, isSignUp, spec, email) {
  return new Promise((resolve, reject) => {
    if (!SOCIAL_PROVIDERS[provider]) {
      reject(__generateFakeResponse__(0, '', [], 'Unknown Social Provider'));
    }
    let url =  `${defaults.apiUrl}/1/${__getSocialUrl__(provider, isSignUp, true)}&appname=${defaults.appName}${email ? '&email='+email : ''}&returnAddress=` // ${location.href}
    let popup = null;
    if (!this.isIE) {
      popup = window.open(url, 'socialpopup', spec);
    }
    else {
      popup = window.open('', '', spec);
      popup.location = url;
    }
    if (popup && popup.focus) { popup.focus() }

    let handler = function(e) {
      let url = e.type === 'message' ? e.origin : e.url;
      if (url.indexOf(window.location.href) === -1) {
        reject(__generateFakeResponse__(0, '', [], 'Unknown Origin Message'));
      }

      let res = e.type === 'message' ? JSON.parse(e.data) : JSON.parse(e.newValue);
      window.removeEventListener(e.type, handler, false);
      if (popup && popup.close) { popup.close() }
      e.type === 'storage' && localStorage.removeItem(e.key);

      if (res.status != 200) {
        reject(res);
      }
      else {
        resolve(res);
      }

    }
    handler = handler.bind(popup);

    window.addEventListener('storage', handler , false);
    // window.addEventListener('message', handler, false);
  });
}
export function socialSignin (provider, scb, ecb, spec = 'left=1, top=1, width=500, height=560') {
  return new Promise((resolve, reject) => {
    __socialAuth__.call(this, provider, false, spec, '')
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
export function socialSigninWithToken (provider, token, scb, ecb) {
  return new Promise((resolve, reject) => {
    this.http({
      url: URLS.socialSigninWithToken.replace('PROVIDER', provider),
      method: 'GET',
      params: {
        accessToken: token,
        appName: defaults.appName,
        signupIfNotSignedIn: true,
      },
    })
    .then(response => {
      this.storage.set('user', {
        token: {
          Authorization: `Bearer ${response.data.access_token}`
        },
        details: response.data
      });
      __dispatchEvent__(EVENTS.SIGNIN);
      if (defaults.runSocket) {
        this.socket.connect(this.storage.get('user').token.Authorization, defaults.anonymousToken, defaults.appName);
      }
      // TODO:PATCH
      this.http({
        url: `${URLS.objects}/users`,
        method: 'GET',
        params: {
          filter: [
            {
              "fieldName": "email",
              "operator": "equals",
              "value": response.data.username
            }
          ]
        },
      })
      .then(patch => {
        let {id, firstName, lastName} = patch.data.data[0];
        let user = this.storage.get('user');
        let newDetails =  {userId: id.toString(), firstName, lastName};
        this.storage.set('user', {
          token: user.token,
          details: Object.assign({}, user.details, newDetails)
        });
        user = this.storage.get('user');
        let res = __generateFakeResponse__(response.status, response.statusText, response.headers, user.details);
        scb && scb(res);
        resolve(res);
      })
      .catch(error => {
        ecb && ecb(error);
        reject(error);
      });
      // EOP
    })
    .catch(error => {
      ecb && ecb(error);
      reject(error);
    });
  });
};
export function socialSignup (provider, email, scb, ecb, spec = 'left=1, top=1, width=500, height=560') {
  return new Promise((resolve, reject) => {
    __socialAuth__.call(this, provider, true, spec, email)
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
function __signinWithToken__ (tokenData) {
  return new Promise((resolve, reject) => {
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
      this.storage.set('user', {
        token: {
          Authorization: `Bearer ${response.data.access_token}`
        },
        details: response.data
      });
      __dispatchEvent__(EVENTS.SIGNIN);
      if (defaults.runSocket) {
        this.socket.connect(this.storage.get('user').token.Authorization, defaults.anonymousToken, defaults.appName);
      }
      resolve(response);
    })
    .catch(error => {
      console.log(error);
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
  return new Promise((resolve, reject) => {
    this.storage.remove('user');
    if (defaults.runSocket) {
      this.socket.disconnect();
    }
    __dispatchEvent__(EVENTS.SIGNOUT);
    scb && scb(__generateFakeResponse__(200, 'OK', [], this.storage.get('user')));
    resolve(__generateFakeResponse__(200, 'OK', [], this.storage.get('user')));
  });
}
function __getUserDetailsFromStorage__ () {
  return new Promise((resolve, reject) => {
    let user = this.storage.get('user');
    if (!user) {
      reject(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
    }
    else {
      resolve(__generateFakeResponse__(200, 'OK', [], user.details));
    }
  });
}
export function getUserDetails(scb, ecb, force = false) {
  return new Promise((resolve, reject) => {
    if (force) {
      this.http({
        url: URLS.profile,
        method: 'GET',
      })
      .then(response => {
        let user = this.storage.get('user');
        let newDetails = response.data;
        this.storage.set('user', {
          token: user.token,
          details: Object.assign({}, user.details, newDetails)
        });
        return __getUserDetailsFromStorage__.call(this);
      })
      .then(response => {
        scb && scb(response);
        resolve(response);
      })
      .catch(error => {
        ecb && ecb(error);
        reject(error);
      });
    }
    else {
      __getUserDetailsFromStorage__.call(this)
      .then(response => {
        scb && scb(response);
        resolve(response);
      })
      .catch(error => {
        ecb && ecb(error);
        reject(error);
      });
    }
  });
}
