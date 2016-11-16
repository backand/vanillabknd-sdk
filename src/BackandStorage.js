export default class BackandStorage {
  constructor () {
    this.prefix = 'BACKAND:::';
    this.type = 'local';
    if (typeof window === 'undefined' && typeof window[this.type + 'Storage'] === 'undefined')
      throw new Error('BackandStorage is not supported by the browser');
    this._initiateStorage();
  }
  get (key) {
    return localStorage.getItem(`${this.prefix}${key}`);
  }
  set (key, val) {
    localStorage.setItem(`${this.prefix}${key}`, val);
  }
  remove (key) {
    localStorage.removeItem(`${this.prefix}${key}`);
  }
  clear() {
    for(var i =0; i < localStorage.length; i++){
       if(localStorage.getItem(localStorage.key(i)).indexOf(this.prefix) != -1)
        this.remove(localStorage.key(i))
    }
  }
  _initiateStorage () {
    this.app_name = this.get('app_name');
    this.signup_token = this.get('signup_token');
    this.anonymous_token = this.get('anonymous_token');
    this.user = JSON.parse(this.get('user'));
  }
  setAppName (appName) {
    this.app_name = appName;
    this.set('app_name', appName);
  }
  setSignUpToken (signUpToken) {
    this.signup_token = signUpToken;
    this.set('signup_token', signUpToken);
  }
  setAnonymousToken (anonymousToken) {
    this.anonymous_token = anonymousToken;
    this.set('anonymous_token', anonymousToken);
  }
  setUser (user) {
    this.user = user;
    this.set('user', JSON.stringify(user));
  }
}
