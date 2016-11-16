export const EVENTS = {
    SIGNIN: 'SIGNIN',
    SIGNOUT: 'SIGNOUT',
    SIGNUP: 'SIGNUP'
};

export const URLS = {
    signup: '/1/user/signup',
    token: '/token',
    requestResetPassword: '/1/user/requestResetPassword',
    resetPassword: '/1/user/resetPassword',
    changePassword: '/1/user/changePassword',
    socialLoginWithToken: '/1/user/PROVIDER/token',
    apiUrl: 'https://api.backand.com',
    actionUrl: '/1/objects/',
    socketUrl: 'https://socket.backand.com'
};

export const ERRORS = {
    NO_EMAIL_SOCIAL_ERROR: 'NO_EMAIL_SOCIAL',
    NOT_SIGNEDIN_ERROR: 'The user is not signed up to',
    ALREADY_SIGNEDUP_ERROR: 'The user already signed up to'
};
