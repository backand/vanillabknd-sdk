export const EVENTS = {
  SIGNIN: 'SIGNIN',
  SIGNOUT: 'SIGNOUT',
  SIGNUP: 'SIGNUP'
};

export const URLS = {
  token: 'token',
  signup: '1/user/signup',
  requestResetPassword: '1/user/requestResetPassword',
  resetPassword: '1/user/resetPassword',
  changePassword: '1/user/changePassword',
  objects: '1/objects',
  objectsAction: '1/objects/action'
};

export const SOCIAL_PROVIDERS = {
  github: {name: 'github', label: 'Github', url: 'www.github.com', css: {backgroundColor: '#444'}, id: 1},
  google: {name: 'google', label: 'Google', url: 'www.google.com', css: {backgroundColor: '#dd4b39'}, id: 2},
  facebook: {name: 'facebook', label: 'Facebook', url: 'www.facebook.com', css: {backgroundColor: '#3b5998'}, id: 3},
  twitter: {name: 'twitter', label: 'Twitter', url: 'www.twitter.com', css: {backgroundColor: '#55acee'}, id: 4}
};
