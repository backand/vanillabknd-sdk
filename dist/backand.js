(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global){
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/stefanpenner/es6-promise/master/LICENSE
 * @version   4.0.5
 */

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global.ES6Promise = factory());
}(this, (function () { 'use strict';

function objectOrFunction(x) {
  return typeof x === 'function' || typeof x === 'object' && x !== null;
}

function isFunction(x) {
  return typeof x === 'function';
}

var _isArray = undefined;
if (!Array.isArray) {
  _isArray = function (x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  };
} else {
  _isArray = Array.isArray;
}

var isArray = _isArray;

var len = 0;
var vertxNext = undefined;
var customSchedulerFn = undefined;

var asap = function asap(callback, arg) {
  queue[len] = callback;
  queue[len + 1] = arg;
  len += 2;
  if (len === 2) {
    // If len is 2, that means that we need to schedule an async flush.
    // If additional callbacks are queued before the queue is flushed, they
    // will be processed by this flush that we are scheduling.
    if (customSchedulerFn) {
      customSchedulerFn(flush);
    } else {
      scheduleFlush();
    }
  }
};

function setScheduler(scheduleFn) {
  customSchedulerFn = scheduleFn;
}

function setAsap(asapFn) {
  asap = asapFn;
}

var browserWindow = typeof window !== 'undefined' ? window : undefined;
var browserGlobal = browserWindow || {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
var isNode = typeof self === 'undefined' && typeof process !== 'undefined' && ({}).toString.call(process) === '[object process]';

// test for web worker but not in IE10
var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';

// node
function useNextTick() {
  // node version 0.10.x displays a deprecation warning when nextTick is used recursively
  // see https://github.com/cujojs/when/issues/410 for details
  return function () {
    return process.nextTick(flush);
  };
}

// vertx
function useVertxTimer() {
  if (typeof vertxNext !== 'undefined') {
    return function () {
      vertxNext(flush);
    };
  }

  return useSetTimeout();
}

function useMutationObserver() {
  var iterations = 0;
  var observer = new BrowserMutationObserver(flush);
  var node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return function () {
    node.data = iterations = ++iterations % 2;
  };
}

// web worker
function useMessageChannel() {
  var channel = new MessageChannel();
  channel.port1.onmessage = flush;
  return function () {
    return channel.port2.postMessage(0);
  };
}

function useSetTimeout() {
  // Store setTimeout reference so es6-promise will be unaffected by
  // other code modifying setTimeout (like sinon.useFakeTimers())
  var globalSetTimeout = setTimeout;
  return function () {
    return globalSetTimeout(flush, 1);
  };
}

var queue = new Array(1000);
function flush() {
  for (var i = 0; i < len; i += 2) {
    var callback = queue[i];
    var arg = queue[i + 1];

    callback(arg);

    queue[i] = undefined;
    queue[i + 1] = undefined;
  }

  len = 0;
}

function attemptVertx() {
  try {
    var r = require;
    var vertx = r('vertx');
    vertxNext = vertx.runOnLoop || vertx.runOnContext;
    return useVertxTimer();
  } catch (e) {
    return useSetTimeout();
  }
}

var scheduleFlush = undefined;
// Decide what async method to use to triggering processing of queued callbacks:
if (isNode) {
  scheduleFlush = useNextTick();
} else if (BrowserMutationObserver) {
  scheduleFlush = useMutationObserver();
} else if (isWorker) {
  scheduleFlush = useMessageChannel();
} else if (browserWindow === undefined && typeof require === 'function') {
  scheduleFlush = attemptVertx();
} else {
  scheduleFlush = useSetTimeout();
}

function then(onFulfillment, onRejection) {
  var _arguments = arguments;

  var parent = this;

  var child = new this.constructor(noop);

  if (child[PROMISE_ID] === undefined) {
    makePromise(child);
  }

  var _state = parent._state;

  if (_state) {
    (function () {
      var callback = _arguments[_state - 1];
      asap(function () {
        return invokeCallback(_state, child, callback, parent._result);
      });
    })();
  } else {
    subscribe(parent, child, onFulfillment, onRejection);
  }

  return child;
}

/**
  `Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {Any} value value that the returned promise will be resolved with
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
function resolve(object) {
  /*jshint validthis:true */
  var Constructor = this;

  if (object && typeof object === 'object' && object.constructor === Constructor) {
    return object;
  }

  var promise = new Constructor(noop);
  _resolve(promise, object);
  return promise;
}

var PROMISE_ID = Math.random().toString(36).substring(16);

function noop() {}

var PENDING = void 0;
var FULFILLED = 1;
var REJECTED = 2;

var GET_THEN_ERROR = new ErrorObject();

function selfFulfillment() {
  return new TypeError("You cannot resolve a promise with itself");
}

function cannotReturnOwn() {
  return new TypeError('A promises callback cannot return that same promise.');
}

function getThen(promise) {
  try {
    return promise.then;
  } catch (error) {
    GET_THEN_ERROR.error = error;
    return GET_THEN_ERROR;
  }
}

function tryThen(then, value, fulfillmentHandler, rejectionHandler) {
  try {
    then.call(value, fulfillmentHandler, rejectionHandler);
  } catch (e) {
    return e;
  }
}

function handleForeignThenable(promise, thenable, then) {
  asap(function (promise) {
    var sealed = false;
    var error = tryThen(then, thenable, function (value) {
      if (sealed) {
        return;
      }
      sealed = true;
      if (thenable !== value) {
        _resolve(promise, value);
      } else {
        fulfill(promise, value);
      }
    }, function (reason) {
      if (sealed) {
        return;
      }
      sealed = true;

      _reject(promise, reason);
    }, 'Settle: ' + (promise._label || ' unknown promise'));

    if (!sealed && error) {
      sealed = true;
      _reject(promise, error);
    }
  }, promise);
}

function handleOwnThenable(promise, thenable) {
  if (thenable._state === FULFILLED) {
    fulfill(promise, thenable._result);
  } else if (thenable._state === REJECTED) {
    _reject(promise, thenable._result);
  } else {
    subscribe(thenable, undefined, function (value) {
      return _resolve(promise, value);
    }, function (reason) {
      return _reject(promise, reason);
    });
  }
}

function handleMaybeThenable(promise, maybeThenable, then$$) {
  if (maybeThenable.constructor === promise.constructor && then$$ === then && maybeThenable.constructor.resolve === resolve) {
    handleOwnThenable(promise, maybeThenable);
  } else {
    if (then$$ === GET_THEN_ERROR) {
      _reject(promise, GET_THEN_ERROR.error);
    } else if (then$$ === undefined) {
      fulfill(promise, maybeThenable);
    } else if (isFunction(then$$)) {
      handleForeignThenable(promise, maybeThenable, then$$);
    } else {
      fulfill(promise, maybeThenable);
    }
  }
}

function _resolve(promise, value) {
  if (promise === value) {
    _reject(promise, selfFulfillment());
  } else if (objectOrFunction(value)) {
    handleMaybeThenable(promise, value, getThen(value));
  } else {
    fulfill(promise, value);
  }
}

function publishRejection(promise) {
  if (promise._onerror) {
    promise._onerror(promise._result);
  }

  publish(promise);
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) {
    return;
  }

  promise._result = value;
  promise._state = FULFILLED;

  if (promise._subscribers.length !== 0) {
    asap(publish, promise);
  }
}

function _reject(promise, reason) {
  if (promise._state !== PENDING) {
    return;
  }
  promise._state = REJECTED;
  promise._result = reason;

  asap(publishRejection, promise);
}

function subscribe(parent, child, onFulfillment, onRejection) {
  var _subscribers = parent._subscribers;
  var length = _subscribers.length;

  parent._onerror = null;

  _subscribers[length] = child;
  _subscribers[length + FULFILLED] = onFulfillment;
  _subscribers[length + REJECTED] = onRejection;

  if (length === 0 && parent._state) {
    asap(publish, parent);
  }
}

function publish(promise) {
  var subscribers = promise._subscribers;
  var settled = promise._state;

  if (subscribers.length === 0) {
    return;
  }

  var child = undefined,
      callback = undefined,
      detail = promise._result;

  for (var i = 0; i < subscribers.length; i += 3) {
    child = subscribers[i];
    callback = subscribers[i + settled];

    if (child) {
      invokeCallback(settled, child, callback, detail);
    } else {
      callback(detail);
    }
  }

  promise._subscribers.length = 0;
}

function ErrorObject() {
  this.error = null;
}

var TRY_CATCH_ERROR = new ErrorObject();

function tryCatch(callback, detail) {
  try {
    return callback(detail);
  } catch (e) {
    TRY_CATCH_ERROR.error = e;
    return TRY_CATCH_ERROR;
  }
}

function invokeCallback(settled, promise, callback, detail) {
  var hasCallback = isFunction(callback),
      value = undefined,
      error = undefined,
      succeeded = undefined,
      failed = undefined;

  if (hasCallback) {
    value = tryCatch(callback, detail);

    if (value === TRY_CATCH_ERROR) {
      failed = true;
      error = value.error;
      value = null;
    } else {
      succeeded = true;
    }

    if (promise === value) {
      _reject(promise, cannotReturnOwn());
      return;
    }
  } else {
    value = detail;
    succeeded = true;
  }

  if (promise._state !== PENDING) {
    // noop
  } else if (hasCallback && succeeded) {
      _resolve(promise, value);
    } else if (failed) {
      _reject(promise, error);
    } else if (settled === FULFILLED) {
      fulfill(promise, value);
    } else if (settled === REJECTED) {
      _reject(promise, value);
    }
}

function initializePromise(promise, resolver) {
  try {
    resolver(function resolvePromise(value) {
      _resolve(promise, value);
    }, function rejectPromise(reason) {
      _reject(promise, reason);
    });
  } catch (e) {
    _reject(promise, e);
  }
}

var id = 0;
function nextId() {
  return id++;
}

function makePromise(promise) {
  promise[PROMISE_ID] = id++;
  promise._state = undefined;
  promise._result = undefined;
  promise._subscribers = [];
}

function Enumerator(Constructor, input) {
  this._instanceConstructor = Constructor;
  this.promise = new Constructor(noop);

  if (!this.promise[PROMISE_ID]) {
    makePromise(this.promise);
  }

  if (isArray(input)) {
    this._input = input;
    this.length = input.length;
    this._remaining = input.length;

    this._result = new Array(this.length);

    if (this.length === 0) {
      fulfill(this.promise, this._result);
    } else {
      this.length = this.length || 0;
      this._enumerate();
      if (this._remaining === 0) {
        fulfill(this.promise, this._result);
      }
    }
  } else {
    _reject(this.promise, validationError());
  }
}

function validationError() {
  return new Error('Array Methods must be provided an Array');
};

Enumerator.prototype._enumerate = function () {
  var length = this.length;
  var _input = this._input;

  for (var i = 0; this._state === PENDING && i < length; i++) {
    this._eachEntry(_input[i], i);
  }
};

Enumerator.prototype._eachEntry = function (entry, i) {
  var c = this._instanceConstructor;
  var resolve$$ = c.resolve;

  if (resolve$$ === resolve) {
    var _then = getThen(entry);

    if (_then === then && entry._state !== PENDING) {
      this._settledAt(entry._state, i, entry._result);
    } else if (typeof _then !== 'function') {
      this._remaining--;
      this._result[i] = entry;
    } else if (c === Promise) {
      var promise = new c(noop);
      handleMaybeThenable(promise, entry, _then);
      this._willSettleAt(promise, i);
    } else {
      this._willSettleAt(new c(function (resolve$$) {
        return resolve$$(entry);
      }), i);
    }
  } else {
    this._willSettleAt(resolve$$(entry), i);
  }
};

Enumerator.prototype._settledAt = function (state, i, value) {
  var promise = this.promise;

  if (promise._state === PENDING) {
    this._remaining--;

    if (state === REJECTED) {
      _reject(promise, value);
    } else {
      this._result[i] = value;
    }
  }

  if (this._remaining === 0) {
    fulfill(promise, this._result);
  }
};

Enumerator.prototype._willSettleAt = function (promise, i) {
  var enumerator = this;

  subscribe(promise, undefined, function (value) {
    return enumerator._settledAt(FULFILLED, i, value);
  }, function (reason) {
    return enumerator._settledAt(REJECTED, i, reason);
  });
};

/**
  `Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = resolve(2);
  let promise3 = resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = reject(new Error("2"));
  let promise3 = reject(new Error("3"));
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
function all(entries) {
  return new Enumerator(this, entries).promise;
}

/**
  `Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 2');
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // result === 'promise 2' because it was resolved before promise1
    // was resolved.
  });
  ```

  `Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error('promise 2'));
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === 'promise 2' because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} promises array of promises to observe
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
function race(entries) {
  /*jshint validthis:true */
  var Constructor = this;

  if (!isArray(entries)) {
    return new Constructor(function (_, reject) {
      return reject(new TypeError('You must pass an array to race.'));
    });
  } else {
    return new Constructor(function (resolve, reject) {
      var length = entries.length;
      for (var i = 0; i < length; i++) {
        Constructor.resolve(entries[i]).then(resolve, reject);
      }
    });
  }
}

/**
  `Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {Any} reason value that the returned promise will be rejected with.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
function reject(reason) {
  /*jshint validthis:true */
  var Constructor = this;
  var promise = new Constructor(noop);
  _reject(promise, reason);
  return promise;
}

function needsResolver() {
  throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
}

function needsNew() {
  throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
}

/**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise's eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  let promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      let xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class Promise
  @param {function} resolver
  Useful for tooling.
  @constructor
*/
function Promise(resolver) {
  this[PROMISE_ID] = nextId();
  this._result = this._state = undefined;
  this._subscribers = [];

  if (noop !== resolver) {
    typeof resolver !== 'function' && needsResolver();
    this instanceof Promise ? initializePromise(this, resolver) : needsNew();
  }
}

Promise.all = all;
Promise.race = race;
Promise.resolve = resolve;
Promise.reject = reject;
Promise._setScheduler = setScheduler;
Promise._setAsap = setAsap;
Promise._asap = asap;

Promise.prototype = {
  constructor: Promise,

  /**
    The primary way of interacting with a promise is through its `then` method,
    which registers callbacks to receive either a promise's eventual value or the
    reason why the promise cannot be fulfilled.
  
    ```js
    findUser().then(function(user){
      // user is available
    }, function(reason){
      // user is unavailable, and you are given the reason why
    });
    ```
  
    Chaining
    --------
  
    The return value of `then` is itself a promise.  This second, 'downstream'
    promise is resolved with the return value of the first promise's fulfillment
    or rejection handler, or rejected if the handler throws an exception.
  
    ```js
    findUser().then(function (user) {
      return user.name;
    }, function (reason) {
      return 'default name';
    }).then(function (userName) {
      // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
      // will be `'default name'`
    });
  
    findUser().then(function (user) {
      throw new Error('Found user, but still unhappy');
    }, function (reason) {
      throw new Error('`findUser` rejected and we're unhappy');
    }).then(function (value) {
      // never reached
    }, function (reason) {
      // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
      // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
    });
    ```
    If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.
  
    ```js
    findUser().then(function (user) {
      throw new PedagogicalException('Upstream error');
    }).then(function (value) {
      // never reached
    }).then(function (value) {
      // never reached
    }, function (reason) {
      // The `PedgagocialException` is propagated all the way down to here
    });
    ```
  
    Assimilation
    ------------
  
    Sometimes the value you want to propagate to a downstream promise can only be
    retrieved asynchronously. This can be achieved by returning a promise in the
    fulfillment or rejection handler. The downstream promise will then be pending
    until the returned promise is settled. This is called *assimilation*.
  
    ```js
    findUser().then(function (user) {
      return findCommentsByAuthor(user);
    }).then(function (comments) {
      // The user's comments are now available
    });
    ```
  
    If the assimliated promise rejects, then the downstream promise will also reject.
  
    ```js
    findUser().then(function (user) {
      return findCommentsByAuthor(user);
    }).then(function (comments) {
      // If `findCommentsByAuthor` fulfills, we'll have the value here
    }, function (reason) {
      // If `findCommentsByAuthor` rejects, we'll have the reason here
    });
    ```
  
    Simple Example
    --------------
  
    Synchronous Example
  
    ```javascript
    let result;
  
    try {
      result = findResult();
      // success
    } catch(reason) {
      // failure
    }
    ```
  
    Errback Example
  
    ```js
    findResult(function(result, err){
      if (err) {
        // failure
      } else {
        // success
      }
    });
    ```
  
    Promise Example;
  
    ```javascript
    findResult().then(function(result){
      // success
    }, function(reason){
      // failure
    });
    ```
  
    Advanced Example
    --------------
  
    Synchronous Example
  
    ```javascript
    let author, books;
  
    try {
      author = findAuthor();
      books  = findBooksByAuthor(author);
      // success
    } catch(reason) {
      // failure
    }
    ```
  
    Errback Example
  
    ```js
  
    function foundBooks(books) {
  
    }
  
    function failure(reason) {
  
    }
  
    findAuthor(function(author, err){
      if (err) {
        failure(err);
        // failure
      } else {
        try {
          findBoooksByAuthor(author, function(books, err) {
            if (err) {
              failure(err);
            } else {
              try {
                foundBooks(books);
              } catch(reason) {
                failure(reason);
              }
            }
          });
        } catch(error) {
          failure(err);
        }
        // success
      }
    });
    ```
  
    Promise Example;
  
    ```javascript
    findAuthor().
      then(findBooksByAuthor).
      then(function(books){
        // found books
    }).catch(function(reason){
      // something went wrong
    });
    ```
  
    @method then
    @param {Function} onFulfilled
    @param {Function} onRejected
    Useful for tooling.
    @return {Promise}
  */
  then: then,

  /**
    `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
    as the catch block of a try/catch statement.
  
    ```js
    function findAuthor(){
      throw new Error('couldn't find that author');
    }
  
    // synchronous
    try {
      findAuthor();
    } catch(reason) {
      // something went wrong
    }
  
    // async with promises
    findAuthor().catch(function(reason){
      // something went wrong
    });
    ```
  
    @method catch
    @param {Function} onRejection
    Useful for tooling.
    @return {Promise}
  */
  'catch': function _catch(onRejection) {
    return this.then(null, onRejection);
  }
};

function polyfill() {
    var local = undefined;

    if (typeof global !== 'undefined') {
        local = global;
    } else if (typeof self !== 'undefined') {
        local = self;
    } else {
        try {
            local = Function('return this')();
        } catch (e) {
            throw new Error('polyfill failed because global object is unavailable in this environment');
        }
    }

    var P = local.Promise;

    if (P) {
        var promiseToString = null;
        try {
            promiseToString = Object.prototype.toString.call(P.resolve());
        } catch (e) {
            // silently ignored
        }

        if (promiseToString === '[object Promise]' && !P.cast) {
            return;
        }
    }

    local.Promise = Promise;
}

// Strange compat..
Promise.polyfill = polyfill;
Promise.Promise = Promise;

return Promise;

})));

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":2}],2:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var EVENTS = exports.EVENTS = {
  SIGNIN: 'SIGNIN',
  SIGNOUT: 'SIGNOUT',
  SIGNUP: 'SIGNUP'
};

var URLS = exports.URLS = {
  token: 'token',
  signup: '1/user/signup',
  requestResetPassword: '1/user/requestResetPassword',
  resetPassword: '1/user/resetPassword',
  changePassword: '1/user/changePassword',
  objects: '1/objects',
  objectsAction: '1/objects/action'
};

var SOCIAL_PROVIDERS = exports.SOCIAL_PROVIDERS = {
  github: { name: 'github', label: 'Github', url: 'www.github.com', css: { backgroundColor: '#444' }, id: 1 },
  google: { name: 'google', label: 'Google', url: 'www.google.com', css: { backgroundColor: '#dd4b39' }, id: 2 },
  facebook: { name: 'facebook', label: 'Facebook', url: 'www.facebook.com', css: { backgroundColor: '#3b5998' }, id: 3 },
  twitter: { name: 'twitter', label: 'Twitter', url: 'www.twitter.com', css: { backgroundColor: '#55acee' }, id: 4 }
};

},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = {
  appName: null,
  anonymousToken: null,
  signUpToken: null,
  apiUrl: 'https://api.backand.com',
  storagePrefix: 'BACKAND_',
  storageType: 'local',
  manageRefreshToken: true,
  runSigninAfterSignup: true,
  runSocket: false,
  socketUrl: 'https://socket.backand.com',
  isMobile: false
};

},{}],5:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var filter = exports.filter = {
  create: function create(fieldName, operator, value) {
    return {
      fieldName: fieldName,
      operator: operator,
      value: value
    };
  },
  operators: {
    numeric: { equals: "equals", notEquals: "notEquals", greaterThan: "greaterThan", greaterThanOrEqualsTo: "greaterThanOrEqualsTo", lessThan: "lessThan", lessThanOrEqualsTo: "lessThanOrEqualsTo", empty: "empty", notEmpty: "notEmpty" },
    date: { equals: "equals", notEquals: "notEquals", greaterThan: "greaterThan", greaterThanOrEqualsTo: "greaterThanOrEqualsTo", lessThan: "lessThan", lessThanOrEqualsTo: "lessThanOrEqualsTo", empty: "empty", notEmpty: "notEmpty" },
    text: { equals: "equals", notEquals: "notEquals", startsWith: "startsWith", endsWith: "endsWith", contains: "contains", notContains: "notContains", empty: "empty", notEmpty: "notEmpty" },
    boolean: { equals: "equals" },
    relation: { in: "in" }
  }
};

var sort = exports.sort = {
  create: function create(fieldName, order) {
    return {
      fieldName: fieldName,
      order: order
    };
  },
  orders: { asc: "asc", desc: "desc" }
};

var exclude = exports.exclude = {
  options: { metadata: "metadata", totalRows: "totalRows", all: "metadata,totalRows" }
};

},{}],6:[function(require,module,exports){
'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; /***********************************************
                                                                                                                                                                                                                                                                   * backand JavaScript Library
                                                                                                                                                                                                                                                                   * Authors: backand
                                                                                                                                                                                                                                                                   * License: MIT (http://www.opensource.org/licenses/mit-license.php)
                                                                                                                                                                                                                                                                   * Compiled At: 26/11/2016
                                                                                                                                                                                                                                                                   ***********************************************/


var _defaults = require('./defaults');

var _defaults2 = _interopRequireDefault(_defaults);

var _constants = require('./constants');

var constants = _interopRequireWildcard(_constants);

var _helpers = require('./helpers');

var helpers = _interopRequireWildcard(_helpers);

var _storage = require('./utils/storage');

var _storage2 = _interopRequireDefault(_storage);

var _http = require('./utils/http');

var _http2 = _interopRequireDefault(_http);

var _socket = require('./utils/socket');

var _socket2 = _interopRequireDefault(_socket);

var _auth = require('./services/auth');

var auth = _interopRequireWildcard(_auth);

var _crud = require('./services/crud');

var crud = _interopRequireWildcard(_crud);

var _files = require('./services/files');

var files = _interopRequireWildcard(_files);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

(function () {
  'use strict';

  window['backand'] = {};
  window['backand'].initiate = function () {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


    // combine defaults with user config
    _extends(_defaults2.default, config);

    // verify new defaults
    if (!_defaults2.default.appName) throw new Error('appName is missing');
    if (!_defaults2.default.anonymousToken) throw new Error('anonymousToken is missing');
    if (!_defaults2.default.signUpToken) throw new Error('signUpToken is missing');

    // init globals
    var storage = new _storage2.default(_defaults2.default.storageType, _defaults2.default.storagePrefix);
    var http = _http2.default.create({
      baseURL: _defaults2.default.apiUrl
    });
    var scope = {
      storage: storage,
      http: http,
      isIE: false || !!document.documentMode
    };
    var socket = null;
    if (_defaults2.default.runSocket) {
      socket = new _socket2.default(_defaults2.default.socketUrl);
      scope.socket = socket;
    }

    // bind globals to all service functions
    var service = _extends({}, auth, crud, files);
    for (var fn in service) {
      service[fn] = service[fn].bind(scope);
    }

    // set interceptor for authHeaders & refreshToken
    http.config.interceptors = {
      request: function request(config) {
        if (config.url.indexOf(constants.URLS.token) === -1 && storage.get('user')) {
          config.headers = _extends({}, config.headers, storage.get('user').token);
        }
      },
      responseError: function responseError(error, config, resolve, reject, scb, ecb) {
        var _this = this;

        if (config.url.indexOf(constants.URLS.token) === -1 && _defaults2.default.manageRefreshToken && error.status === 401 && error.data && error.data.Message === 'invalid or expired token') {
          auth.__handleRefreshToken__.call(scope, error).then(function (response) {
            _this.request(config, scb, ecb);
          }).catch(function (error) {
            ecb && ecb(error);
            reject(error);
          });
        } else {
          ecb && ecb(error);
          reject(error);
        }
      }
    };

    // expose backand namespace to window
    window['backand'] = {
      service: service,
      constants: constants,
      helpers: helpers
    };
    if (_defaults2.default.runSocket) {
      storage.get('user') && socket.connect(storage.get('user').token.Authorization || null, _defaults2.default.anonymousToken, _defaults2.default.appName);
      window['backand'].socket = socket;
    }
  };
})();

},{"./constants":3,"./defaults":4,"./helpers":5,"./services/auth":7,"./services/crud":8,"./services/files":9,"./utils/http":10,"./utils/socket":11,"./utils/storage":12}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.__handleRefreshToken__ = __handleRefreshToken__;
exports.useAnonymousAuth = useAnonymousAuth;
exports.signin = signin;
exports.signup = signup;
exports.socialSignin = socialSignin;
exports.socialSignup = socialSignup;
exports.requestResetPassword = requestResetPassword;
exports.resetPassword = resetPassword;
exports.changePassword = changePassword;
exports.signout = signout;
exports.getUserDetails = getUserDetails;

var _es6Promise = require('es6-promise');

var _constants = require('./../constants');

var _defaults = require('./../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function __generateFakeResponse__() {
  var status = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
  var statusText = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
  var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
  var data = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '';

  return {
    status: status,
    statusText: statusText,
    headers: headers,
    data: data
  };
}
function __dispatchEvent__(name) {
  var event = void 0;
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
function __handleRefreshToken__(error) {
  var _this = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var user = _this.storage.get('user');
    if (!user || !user.details.refresh_token) {
      reject(__generateFakeResponse__(0, '', [], 'No cached user or refreshToken found. authentication is required.'));
    } else {
      __signinWithToken__.call(_this, {
        username: user.details.username,
        refreshToken: user.details.refresh_token
      }).then(function (response) {
        resolve(response);
      }).catch(function (error) {
        reject(error);
      });
    }
  });
};
function useAnonymousAuth(scb) {
  var _this2 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var details = {
      "access_token": _defaults2.default.anonymousToken,
      "token_type": "AnonymousToken",
      "expires_in": 0,
      "appName": _defaults2.default.appName,
      "username": "anonymous",
      "role": "User",
      "firstName": "anonymous",
      "lastName": "anonymous",
      "fullName": "anonymous anonymous",
      "regId": 0,
      "userId": null
    };
    _this2.storage.set('user', {
      token: {
        AnonymousToken: _defaults2.default.anonymousToken
      },
      details: details
    });
    __dispatchEvent__(_constants.EVENTS.SIGNIN);
    if (_defaults2.default.runSocket) {
      _this2.socket.connect(null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    }
    scb && scb(__generateFakeResponse__(200, 'OK', [], details));
    resolve(__generateFakeResponse__(200, 'OK', [], details));
  });
}
function signin(username, password, scb, ecb) {
  var _this3 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    _this3.http({
      url: _constants.URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: 'username=' + username + '&password=' + password + '&appName=' + _defaults2.default.appName + '&grant_type=password'
    }).then(function (response) {
      _this3.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        _this3.socket.connect(_this3.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      scb && scb(response);
      resolve(response);
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
}
function signup(email, password, confirmPassword, firstName, lastName, scb, ecb) {
  var _this4 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    _this4.http({
      url: _constants.URLS.signup,
      method: 'POST',
      headers: {
        'SignUpToken': _defaults2.default.signUpToken
      },
      data: {
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: password,
        confirmPassword: confirmPassword
      }
    }, scb, ecb).then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      if (_defaults2.default.runSigninAfterSignup) {
        return signin.call(_this4, response.data.username, password);
      } else {
        scb && scb(response);
        resolve(response);
      }
    }).then(function (response) {
      scb && scb(response);
      resolve(response);
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
}
function __getSocialUrl__(providerName, isSignup, isAutoSignUp) {
  var provider = _constants.SOCIAL_PROVIDERS[providerName];
  var action = isSignup ? 'up' : 'in';
  var autoSignUpParam = '&signupIfNotSignedIn=' + (!isSignup && isAutoSignUp ? 'true' : 'false');
  return '/user/socialSign' + action + '?provider=' + provider.label + autoSignUpParam + '&response_type=token&client_id=self&redirect_uri=' + provider.url + '&state=';
}
function __socialAuth__(provider, isSignUp, spec, email) {
  var _this5 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    if (!_constants.SOCIAL_PROVIDERS[provider]) {
      reject(__generateFakeResponse__(0, '', [], 'Unknown Social Provider'));
    }
    var url = _defaults2.default.apiUrl + '/1/' + __getSocialUrl__(provider, isSignUp, true) + '&appname=' + _defaults2.default.appName + (email ? '&email=' + email : '') + '&returnAddress='; // ${location.href}
    var popup = null;
    if (!_this5.isIE) {
      popup = window.open(url, 'socialpopup', spec);
    } else {
      popup = window.open('', '', spec);
      popup.location = url;
    }
    if (popup && popup.focus) {
      popup.focus();
    }

    var _handler = function handler(e) {
      var url = e.type === 'message' ? e.origin : e.url;
      if (url.indexOf(location.href) === -1) {
        reject(__generateFakeResponse__(0, '', [], 'Unknown Origin Message'));
      }

      var res = e.type === 'message' ? JSON.parse(e.data) : JSON.parse(e.newValue);
      window.removeEventListener(e.type, _handler, false);
      if (popup && popup.close) {
        popup.close();
      }
      e.type == 'Storage' && localStorage.removeItem(e.key);

      if (res.status != 200) {
        reject(res);
      } else {
        resolve(res);
      }
    };
    _handler = _handler.bind(popup);

    window.addEventListener('storage', _handler, false);
    // window.addEventListener('message', handler, false);
  });
}
function socialSignin(provider, scb, ecb) {
  var _this6 = this;

  var spec = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'left=1, top=1, width=500, height=560';

  return new _es6Promise.Promise(function (resolve, reject) {
    __socialAuth__.call(_this6, provider, false, spec, '').then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      return __signinWithToken__.call(_this6, {
        accessToken: response.data.access_token
      });
    }).then(function (response) {
      scb && scb(response);
      resolve(response);
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
};
function socialSignup(provider, email, scb, ecb) {
  var _this7 = this;

  var spec = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'left=1, top=1, width=500, height=560';

  return new _es6Promise.Promise(function (resolve, reject) {
    __socialAuth__.call(_this7, provider, true, spec, email).then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      if (_defaults2.default.runSigninAfterSignup) {
        return __signinWithToken__.call(_this7, {
          accessToken: response.data.access_token
        });
      } else {
        scb && scb(response);
        resolve(response);
      }
    }).then(function (response) {
      scb && scb(response);
      resolve(response);
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
}
function __signinWithToken__(tokenData) {
  var _this8 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var data = [];
    for (var obj in tokenData) {
      data.push(encodeURIComponent(obj) + '=' + encodeURIComponent(tokenData[obj]));
    }
    data = data.join("&");

    _this8.http({
      url: _constants.URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data + '&appName=' + _defaults2.default.appName + '&grant_type=password'
    }).then(function (response) {
      _this8.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        _this8.socket.connect(_this8.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      resolve(response);
    }).catch(function (error) {
      console.log(error);
      reject(error);
    });
  });
}
function requestResetPassword(username, scb, ecb) {
  return this.http({
    url: _constants.URLS.requestResetPassword,
    method: 'POST',
    data: {
      appName: _defaults2.default.appName,
      username: username
    }
  }, scb, ecb);
}
function resetPassword(newPassword, resetToken, scb, ecb) {
  return this.http({
    url: _constants.URLS.resetPassword,
    method: 'POST',
    data: {
      newPassword: newPassword,
      resetToken: resetToken
    }
  }, scb, ecb);
}
function changePassword(oldPassword, newPassword, scb, ecb) {
  return this.http({
    url: _constants.URLS.changePassword,
    method: 'POST',
    data: {
      oldPassword: oldPassword,
      newPassword: newPassword
    }
  }, scb, ecb);
}
function signout(scb) {
  var _this9 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    _this9.storage.remove('user');
    if (_defaults2.default.runSocket) {
      _this9.socket.disconnect();
    }
    __dispatchEvent__(_constants.EVENTS.SIGNOUT);
    scb && scb(__generateFakeResponse__(200, 'OK', [], _this9.storage.get('user')));
    resolve(__generateFakeResponse__(200, 'OK', [], _this9.storage.get('user')));
  });
}
function getUserDetails(scb, ecb) {
  var _this10 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var user = _this10.storage.get('user');
    if (!user) {
      ecb && ecb(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
      reject(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
    } else {
      scb && scb(__generateFakeResponse__(200, 'OK', [], user.details));
      resolve(__generateFakeResponse__(200, 'OK', [], user.details));
    }
  });
}

// get data from url in social sign-in popup
(function () {
  var dataMatch = /\?(data|error)=(.+)/.exec(location.href);
  if (dataMatch && dataMatch[1] && dataMatch[2]) {
    var data = {
      data: JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, '')))
    };
    data.status = dataMatch[1] === 'data' ? 200 : 0;
    localStorage.setItem('SOCIAL_DATA', JSON.stringify(data));
    // var isIE = false || !!document.documentMode;
    // if (!isIE) {
    //   window.opener.postMessage(JSON.stringify(data), location.origin);
    // }
  }
})();

},{"./../constants":3,"./../defaults":4,"es6-promise":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getList = getList;
exports.create = create;
exports.getOne = getOne;
exports.update = update;
exports.remove = remove;
exports.trigger = trigger;

var _constants = require('./../constants');

function __allowedParams__(allowedParams, params) {
  var newParams = {};
  for (var param in params) {
    if (allowedParams.indexOf(param) != -1) {
      newParams[param] = params[param];
    }
  }
  return newParams;
}
function getList(object) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var scb = arguments[2];
  var ecb = arguments[3];

  var allowedParams = ['pageSize', 'pageNumber', 'filter', 'sort', 'search', 'exclude', 'deep', 'relatedObjects'];
  return this.http({
    url: _constants.URLS.objects + '/' + object,
    method: 'GET',
    params: __allowedParams__(allowedParams, params)
  }, scb, ecb);
}
function create(object, data) {
  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  var allowedParams = ['returnObject', 'deep'];
  return this.http({
    url: _constants.URLS.objects + '/' + object,
    method: 'POST',
    data: data,
    params: __allowedParams__(allowedParams, params)
  }, scb, ecb);
}
function getOne(object, id) {
  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  var allowedParams = ['deep', 'exclude', 'level'];
  return this.http({
    url: _constants.URLS.objects + '/' + object + '/' + id,
    method: 'GET',
    params: __allowedParams__(allowedParams, params)
  }, scb, ecb);
}
function update(object, id, data) {
  var params = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
  var scb = arguments[4];
  var ecb = arguments[5];

  var allowedParams = ['returnObject', 'deep'];
  return this.http({
    url: _constants.URLS.objects + '/' + object + '/' + id,
    method: 'PUT',
    data: data,
    params: __allowedParams__(allowedParams, params)
  }, scb, ecb);
}
function remove(object, id, scb, ecb) {
  return this.http({
    url: _constants.URLS.objects + '/' + object + '/' + id,
    method: 'DELETE'
  }, scb, ecb);
}
function trigger(object, fileAction) {
  var data = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  return this.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + fileAction,
    method: 'POST',
    data: data
  }, scb, ecb);
}

},{"./../constants":3}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.uploadFile = uploadFile;
exports.deleteFile = deleteFile;

var _constants = require('./../constants');

function uploadFile(object, fileAction, filename, filedata, scb, ecb) {
  return this.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + fileAction,
    method: 'POST',
    data: {
      filename: filename,
      filedata: filedata.substr(filedata.indexOf(',') + 1, filedata.length)
    }
  }, scb, ecb);
}
function deleteFile(object, fileAction, filename, scb, ecb) {
  return this.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + fileAction,
    method: 'DELETE',
    data: {
      filename: filename
    }
  }, scb, ecb);
}

},{"./../constants":3}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _es6Promise = require('es6-promise');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Http = function () {
  function Http() {
    var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, Http);

    if (!window.XMLHttpRequest) throw new Error('XMLHttpRequest is not supported by the browser');

    this.config = _extends({
      // url: '/',
      method: 'GET',
      headers: {},
      params: {},
      interceptors: {},
      withCredentials: false,
      responseType: 'json',
      // timeout: null,
      auth: {
        username: null,
        password: null
      }
    }, config);
  }

  _createClass(Http, [{
    key: '_getHeaders',
    value: function _getHeaders(headers) {
      return headers.split('\r\n').filter(function (header) {
        return header;
      }).map(function (header) {
        var jheader = {};
        var parts = header.split(':');
        jheader[parts[0]] = parts[1];
        return jheader;
      });
    }
  }, {
    key: '_getData',
    value: function _getData(type, data) {
      if (!type) {
        return data;
      } else if (type.indexOf('json') === -1) {
        return data;
      } else {
        return JSON.parse(data);
      }
    }
  }, {
    key: '_createResponse',
    value: function _createResponse(req, config) {
      return {
        status: req.status,
        statusText: req.statusText,
        headers: this._getHeaders(req.getAllResponseHeaders()),
        config: config,
        data: this._getData(req.getResponseHeader("Content-Type"), req.responseText)
      };
    }
  }, {
    key: '_handleError',
    value: function _handleError(data, config) {
      return {
        status: 0,
        statusText: 'ERROR',
        headers: [],
        config: config,
        data: data
      };
    }
  }, {
    key: '_encodeParams',
    value: function _encodeParams(params) {
      var paramsArr = [];
      for (var param in params) {
        paramsArr.push(param + '=' + encodeURI(JSON.stringify(params[param])));
      }
      return paramsArr.join('&');
    }
  }, {
    key: '_setHeaders',
    value: function _setHeaders(req, headers) {
      for (var header in headers) {
        req.setRequestHeader(header, headers[header]);
      }
    }
  }, {
    key: '_setData',
    value: function _setData(req, data) {
      if (!data) {
        req.send();
      } else if ((typeof data === 'undefined' ? 'undefined' : _typeof(data)) != 'object') {
        req.send(data);
      } else {
        req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        req.send(JSON.stringify(data));
      }
    }
  }, {
    key: 'request',
    value: function request(cfg, scb, ecb) {
      var _this = this;

      return new _es6Promise.Promise(function (resolve, reject) {

        var req = new XMLHttpRequest();
        var config = _extends({}, _this.config, cfg);

        if (!config.url || typeof config.url !== 'string' || config.url.length === 0) {
          var res = _this._handleError('url parameter is missing', config);
          ecb && ecb(res);
          reject(res);
        }
        if (config.withCredentials) {
          req.withCredentials = true;
        }
        if (config.timeout) {
          req.timeout = true;
        }
        config.interceptors.request && config.interceptors.request.call(_this, config);
        var params = _this._encodeParams(config.params);
        req.open(config.method, '' + (config.baseURL ? config.baseURL + '/' : '') + config.url + (params ? '?' + params : ''), true, config.auth.username, config.auth.password);
        req.ontimeout = function () {
          var res = this._handleError('timeout', config);
          ecb && ecb(res);
          reject(res);
        };
        req.onabort = function () {
          var res = this._handleError('abort', config);
          ecb && ecb(res);
          reject(res);
        };
        req.onreadystatechange = function () {
          if (req.readyState == XMLHttpRequest.DONE) {
            var _res = _this._createResponse(req, config);
            if (_res.status === 200) {
              if (config.interceptors.response) {
                config.interceptors.response.call(_this, _res, config, resolve, reject, scb, ecb);
              } else {
                scb && scb(_res);
                resolve(_res);
              }
            } else {
              if (config.interceptors.responseError) {
                config.interceptors.responseError.call(_this, _res, config, resolve, reject, scb, ecb);
              } else {
                ecb && ecb(_res);
                reject(_res);
              }
            }
          }
        };
        _this._setHeaders(req, config.headers);
        _this._setData(req, config.data);
      });
    }
  }]);

  return Http;
}();

function createInstance() {
  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

  var context = new Http(config);
  var instance = function instance() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return Http.prototype.request.apply(context, args);
  };
  instance.config = context.config;
  return instance;
}

var http = window.http || createInstance();
http.create = function (config) {
  return createInstance(config);
};

exports.default = http;

window.http = http;

},{"es6-promise":1}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Socket = function () {
  function Socket(url) {
    _classCallCheck(this, Socket);

    if (!window.io) throw new Error('runSocket is true but socketio-client is not included');
    this.url = url;
    this.onArr = [];
    this.socket = null;
  }

  _createClass(Socket, [{
    key: 'on',
    value: function on(eventName, callback) {
      this.onArr.push({ eventName: eventName, callback: callback });
    }
  }, {
    key: 'connect',
    value: function connect(token, anonymousToken, appName) {
      var _this = this;

      this.disconnect();
      this.socket = io.connect(this.url, { 'forceNew': true });

      this.socket.on('connect', function () {
        console.info('trying to establish a socket connection to ' + appName + ' ...');
        _this.socket.emit("login", token, anonymousToken, appName);
      });

      this.socket.on('authorized', function () {
        console.info('socket connected');
        _this.onArr.forEach(function (fn) {
          _this.socket.on(fn.eventName, function (data) {
            fn.callback(data);
          });
        });
      });

      this.socket.on('notAuthorized', function () {
        setTimeout(function () {
          return _this.disconnect();
        }, 1000);
      });

      this.socket.on('disconnect', function () {
        console.info('socket disconnect');
      });

      this.socket.on('reconnecting', function () {
        console.info('socket reconnecting');
      });

      this.socket.on('error', function (error) {
        console.warn('error: ' + error);
      });
    }
  }, {
    key: 'disconnect',
    value: function disconnect() {
      if (this.socket) {
        this.socket.close();
      }
    }
  }]);

  return Socket;
}();

exports.default = Socket;

},{}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Storage = function () {
  function Storage(type) {
    var prefix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

    _classCallCheck(this, Storage);

    if (!window[type + 'Storage']) throw new Error(type + 'Storage is not supported by the browser');
    this.prefix = prefix;
    this.delimiter = '__________';
    this.storage = window[type + 'Storage'];
  }

  _createClass(Storage, [{
    key: 'get',
    value: function get(key) {
      var item = this.storage.getItem('' + this.prefix + key);
      if (!item) {
        return item;
      } else {
        var _item$split = item.split(this.delimiter),
            _item$split2 = _slicedToArray(_item$split, 2),
            type = _item$split2[0],
            val = _item$split2[1];

        if (type != 'JSON') {
          return val;
        } else {
          return JSON.parse(val);
        }
      }
    }
  }, {
    key: 'set',
    value: function set(key, val) {
      if ((typeof val === 'undefined' ? 'undefined' : _typeof(val)) != 'object') {
        this.storage.setItem('' + this.prefix + key, 'STRING' + this.delimiter + val);
      } else {
        this.storage.setItem('' + this.prefix + key, 'JSON' + this.delimiter + JSON.stringify(val));
      }
    }
  }, {
    key: 'remove',
    value: function remove(key) {
      this.storage.removeItem('' + this.prefix + key);
    }
  }, {
    key: 'clear',
    value: function clear() {
      for (var i = 0; i < this.storage.length; i++) {
        if (this.storage.getItem(this.storage.key(i)).indexOf(this.prefix) != -1) this.remove(this.storage.key(i));
      }
    }
  }]);

  return Storage;
}();

exports.default = Storage;

},{}]},{},[6])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGNydWQuanMiLCJzcmNcXHNlcnZpY2VzXFxmaWxlcy5qcyIsInNyY1xcdXRpbHNcXGh0dHAuanMiLCJzcmNcXHV0aWxzXFxzb2NrZXQuanMiLCJzcmNcXHV0aWxzXFxzdG9yYWdlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwb0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcExPLElBQU0sMEJBQVM7QUFDcEIsVUFBUSxRQURZO0FBRXBCLFdBQVMsU0FGVztBQUdwQixVQUFRO0FBSFksQ0FBZjs7QUFNQSxJQUFNLHNCQUFPO0FBQ2xCLFNBQU8sT0FEVztB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Q0FBWCxFQUFjLElBQUksS0FBSyxPQUFMLENBQWEsTUFBL0IsRUFBdUMsR0FBdkMsRUFBMkM7QUFDeEMsWUFBRyxLQUFLLE9BQUwsQ0FBYSxPQUFiLENBQXFCLEtBQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsQ0FBakIsQ0FBckIsRUFBMEMsT0FBMUMsQ0FBa0QsS0FBSyxNQUF2RCxLQUFrRSxDQUFDLENBQXRFLEVBQ0MsS0FBSyxNQUFMLENBQVksS0FBSyxPQUFMLENBQWEsR0FBYixDQUFpQixDQUFqQixDQUFaO0FBQ0g7QUFDRjs7Ozs7O2tCQXZDa0IsTyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcbiAqIEBvdmVydmlldyBlczYtcHJvbWlzZSAtIGEgdGlueSBpbXBsZW1lbnRhdGlvbiBvZiBQcm9taXNlcy9BKy5cbiAqIEBjb3B5cmlnaHQgQ29weXJpZ2h0IChjKSAyMDE0IFllaHVkYSBLYXR6LCBUb20gRGFsZSwgU3RlZmFuIFBlbm5lciBhbmQgY29udHJpYnV0b3JzIChDb252ZXJzaW9uIHRvIEVTNiBBUEkgYnkgSmFrZSBBcmNoaWJhbGQpXG4gKiBAbGljZW5zZSAgIExpY2Vuc2VkIHVuZGVyIE1JVCBsaWNlbnNlXG4gKiAgICAgICAgICAgIFNlZSBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vc3RlZmFucGVubmVyL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDQuMC41XG4gKi9cblxuKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcbiAgICB0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKSA6XG4gICAgdHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kID8gZGVmaW5lKGZhY3RvcnkpIDpcbiAgICAoZ2xvYmFsLkVTNlByb21pc2UgPSBmYWN0b3J5KCkpO1xufSh0aGlzLCAoZnVuY3Rpb24gKCkgeyAndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIG9iamVjdE9yRnVuY3Rpb24oeCkge1xuICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oeCkge1xuICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbic7XG59XG5cbnZhciBfaXNBcnJheSA9IHVuZGVmaW5lZDtcbmlmICghQXJyYXkuaXNBcnJheSkge1xuICBfaXNBcnJheSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcbn0gZWxzZSB7XG4gIF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcbn1cblxudmFyIGlzQXJyYXkgPSBfaXNBcnJheTtcblxudmFyIGxlbiA9IDA7XG52YXIgdmVydHhOZXh0ID0gdW5kZWZpbmVkO1xudmFyIGN1c3RvbVNjaGVkdWxlckZuID0gdW5kZWZpbmVkO1xuXG52YXIgYXNhcCA9IGZ1bmN0aW9uIGFzYXAoY2FsbGJhY2ssIGFyZykge1xuICBxdWV1ZVtsZW5dID0gY2FsbGJhY2s7XG4gIHF1ZXVlW2xlbiArIDFdID0gYXJnO1xuICBsZW4gKz0gMjtcbiAgaWYgKGxlbiA9PT0gMikge1xuICAgIC8vIElmIGxlbiBpcyAyLCB0aGF0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byBzY2hlZHVsZSBhbiBhc3luYyBmbHVzaC5cbiAgICAvLyBJZiBhZGRpdGlvbmFsIGNhbGxiYWNrcyBhcmUgcXVldWVkIGJlZm9yZSB0aGUgcXVldWUgaXMgZmx1c2hlZCwgdGhleVxuICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICBpZiAoY3VzdG9tU2NoZWR1bGVyRm4pIHtcbiAgICAgIGN1c3RvbVNjaGVkdWxlckZuKGZsdXNoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZWR1bGVGbHVzaCgpO1xuICAgIH1cbiAgfVxufTtcblxuZnVuY3Rpb24gc2V0U2NoZWR1bGVyKHNjaGVkdWxlRm4pIHtcbiAgY3VzdG9tU2NoZWR1bGVyRm4gPSBzY2hlZHVsZUZuO1xufVxuXG5mdW5jdGlvbiBzZXRBc2FwKGFzYXBGbikge1xuICBhc2FwID0gYXNhcEZuO1xufVxuXG52YXIgYnJvd3NlcldpbmRvdyA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogdW5kZWZpbmVkO1xudmFyIGJyb3dzZXJHbG9iYWwgPSBicm93c2VyV2luZG93IHx8IHt9O1xudmFyIEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyID0gYnJvd3Nlckdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGJyb3dzZXJHbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjtcbnZhciBpc05vZGUgPSB0eXBlb2Ygc2VsZiA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmICh7fSkudG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4vLyB0ZXN0IGZvciB3ZWIgd29ya2VyIGJ1dCBub3QgaW4gSUUxMFxudmFyIGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgaW1wb3J0U2NyaXB0cyAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSAndW5kZWZpbmVkJztcblxuLy8gbm9kZVxuZnVuY3Rpb24gdXNlTmV4dFRpY2soKSB7XG4gIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2N1am9qcy93aGVuL2lzc3Vlcy80MTAgZm9yIGRldGFpbHNcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gcHJvY2Vzcy5uZXh0VGljayhmbHVzaCk7XG4gIH07XG59XG5cbi8vIHZlcnR4XG5mdW5jdGlvbiB1c2VWZXJ0eFRpbWVyKCkge1xuICBpZiAodHlwZW9mIHZlcnR4TmV4dCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmVydHhOZXh0KGZsdXNoKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHVzZVNldFRpbWVvdXQoKTtcbn1cblxuZnVuY3Rpb24gdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgdmFyIGl0ZXJhdGlvbnMgPSAwO1xuICB2YXIgb2JzZXJ2ZXIgPSBuZXcgQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIoZmx1c2gpO1xuICB2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBub2RlLmRhdGEgPSBpdGVyYXRpb25zID0gKytpdGVyYXRpb25zICUgMjtcbiAgfTtcbn1cblxuLy8gd2ViIHdvcmtlclxuZnVuY3Rpb24gdXNlTWVzc2FnZUNoYW5uZWwoKSB7XG4gIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZmx1c2g7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZVNldFRpbWVvdXQoKSB7XG4gIC8vIFN0b3JlIHNldFRpbWVvdXQgcmVmZXJlbmNlIHNvIGVzNi1wcm9taXNlIHdpbGwgYmUgdW5hZmZlY3RlZCBieVxuICAvLyBvdGhlciBjb2RlIG1vZGlmeWluZyBzZXRUaW1lb3V0IChsaWtlIHNpbm9uLnVzZUZha2VUaW1lcnMoKSlcbiAgdmFyIGdsb2JhbFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBnbG9iYWxTZXRUaW1lb3V0KGZsdXNoLCAxKTtcbiAgfTtcbn1cblxudmFyIHF1ZXVlID0gbmV3IEFycmF5KDEwMDApO1xuZnVuY3Rpb24gZmx1c2goKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpICs9IDIpIHtcbiAgICB2YXIgY2FsbGJhY2sgPSBxdWV1ZVtpXTtcbiAgICB2YXIgYXJnID0gcXVldWVbaSArIDFdO1xuXG4gICAgY2FsbGJhY2soYXJnKTtcblxuICAgIHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgIHF1ZXVlW2kgKyAxXSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGxlbiA9IDA7XG59XG5cbmZ1bmN0aW9uIGF0dGVtcHRWZXJ0eCgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgciA9IHJlcXVpcmU7XG4gICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICB2ZXJ0eE5leHQgPSB2ZXJ0eC5ydW5Pbkxvb3AgfHwgdmVydHgucnVuT25Db250ZXh0O1xuICAgIHJldHVybiB1c2VWZXJ0eFRpbWVyKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXNlU2V0VGltZW91dCgpO1xuICB9XG59XG5cbnZhciBzY2hlZHVsZUZsdXNoID0gdW5kZWZpbmVkO1xuLy8gRGVjaWRlIHdoYXQgYXN5bmMgbWV0aG9kIHRvIHVzZSB0byB0cmlnZ2VyaW5nIHByb2Nlc3Npbmcgb2YgcXVldWVkIGNhbGxiYWNrczpcbmlmIChpc05vZGUpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU5leHRUaWNrKCk7XG59IGVsc2UgaWYgKEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG59IGVsc2UgaWYgKGlzV29ya2VyKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VNZXNzYWdlQ2hhbm5lbCgpO1xufSBlbHNlIGlmIChicm93c2VyV2luZG93ID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIHJlcXVpcmUgPT09ICdmdW5jdGlvbicpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IGF0dGVtcHRWZXJ0eCgpO1xufSBlbHNlIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZVNldFRpbWVvdXQoKTtcbn1cblxuZnVuY3Rpb24gdGhlbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICB2YXIgX2FyZ3VtZW50cyA9IGFyZ3VtZW50cztcblxuICB2YXIgcGFyZW50ID0gdGhpcztcblxuICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3Rvcihub29wKTtcblxuICBpZiAoY2hpbGRbUFJPTUlTRV9JRF0gPT09IHVuZGVmaW5lZCkge1xuICAgIG1ha2VQcm9taXNlKGNoaWxkKTtcbiAgfVxuXG4gIHZhciBfc3RhdGUgPSBwYXJlbnQuX3N0YXRlO1xuXG4gIGlmIChfc3RhdGUpIHtcbiAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGNhbGxiYWNrID0gX2FyZ3VtZW50c1tfc3RhdGUgLSAxXTtcbiAgICAgIGFzYXAoZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gaW52b2tlQ2FsbGJhY2soX3N0YXRlLCBjaGlsZCwgY2FsbGJhY2ssIHBhcmVudC5fcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH0pKCk7XG4gIH0gZWxzZSB7XG4gICAgc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuLyoqXG4gIGBQcm9taXNlLnJlc29sdmVgIHJldHVybnMgYSBwcm9taXNlIHRoYXQgd2lsbCBiZWNvbWUgcmVzb2x2ZWQgd2l0aCB0aGVcbiAgcGFzc2VkIGB2YWx1ZWAuIEl0IGlzIHNob3J0aGFuZCBmb3IgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICByZXNvbHZlKDEpO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIHZhbHVlID09PSAxXG4gIH0pO1xuICBgYGBcblxuICBJbnN0ZWFkIG9mIHdyaXRpbmcgdGhlIGFib3ZlLCB5b3VyIGNvZGUgbm93IHNpbXBseSBiZWNvbWVzIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgxKTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIHZhbHVlID09PSAxXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIHJlc29sdmVcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FueX0gdmFsdWUgdmFsdWUgdGhhdCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlc29sdmVkIHdpdGhcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCB3aWxsIGJlY29tZSBmdWxmaWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAgYHZhbHVlYFxuKi9cbmZ1bmN0aW9uIHJlc29sdmUob2JqZWN0KSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgaWYgKG9iamVjdCAmJiB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiBvYmplY3QuY29uc3RydWN0b3IgPT09IENvbnN0cnVjdG9yKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuICBfcmVzb2x2ZShwcm9taXNlLCBvYmplY3QpO1xuICByZXR1cm4gcHJvbWlzZTtcbn1cblxudmFyIFBST01JU0VfSUQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMTYpO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxudmFyIFBFTkRJTkcgPSB2b2lkIDA7XG52YXIgRlVMRklMTEVEID0gMTtcbnZhciBSRUpFQ1RFRCA9IDI7XG5cbnZhciBHRVRfVEhFTl9FUlJPUiA9IG5ldyBFcnJvck9iamVjdCgpO1xuXG5mdW5jdGlvbiBzZWxmRnVsZmlsbG1lbnQoKSB7XG4gIHJldHVybiBuZXcgVHlwZUVycm9yKFwiWW91IGNhbm5vdCByZXNvbHZlIGEgcHJvbWlzZSB3aXRoIGl0c2VsZlwiKTtcbn1cblxuZnVuY3Rpb24gY2Fubm90UmV0dXJuT3duKCkge1xuICByZXR1cm4gbmV3IFR5cGVFcnJvcignQSBwcm9taXNlcyBjYWxsYmFjayBjYW5ub3QgcmV0dXJuIHRoYXQgc2FtZSBwcm9taXNlLicpO1xufVxuXG5mdW5jdGlvbiBnZXRUaGVuKHByb21pc2UpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIEdFVF9USEVOX0VSUk9SLmVycm9yID0gZXJyb3I7XG4gICAgcmV0dXJuIEdFVF9USEVOX0VSUk9SO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRyeVRoZW4odGhlbiwgdmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcikge1xuICB0cnkge1xuICAgIHRoZW4uY2FsbCh2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICBhc2FwKGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgdmFyIHNlYWxlZCA9IGZhbHNlO1xuICAgIHZhciBlcnJvciA9IHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgaWYgKHNlYWxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgaWYgKHRoZW5hYmxlICE9PSB2YWx1ZSkge1xuICAgICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICBpZiAoc2VhbGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlYWxlZCA9IHRydWU7XG5cbiAgICAgIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgaWYgKCFzZWFsZWQgJiYgZXJyb3IpIHtcbiAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICB9XG4gIH0sIHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSkge1xuICBpZiAodGhlbmFibGUuX3N0YXRlID09PSBGVUxGSUxMRUQpIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICB9IGVsc2UgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gUkVKRUNURUQpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICB9IGVsc2Uge1xuICAgIHN1YnNjcmliZSh0aGVuYWJsZSwgdW5kZWZpbmVkLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHJldHVybiBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgcmV0dXJuIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4kJCkge1xuICBpZiAobWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3RvciA9PT0gcHJvbWlzZS5jb25zdHJ1Y3RvciAmJiB0aGVuJCQgPT09IHRoZW4gJiYgbWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3Rvci5yZXNvbHZlID09PSByZXNvbHZlKSB7XG4gICAgaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoZW4kJCA9PT0gR0VUX1RIRU5fRVJST1IpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgR0VUX1RIRU5fRVJST1IuZXJyb3IpO1xuICAgIH0gZWxzZSBpZiAodGhlbiQkID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgfSBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoZW4kJCkpIHtcbiAgICAgIGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuJCQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSkge1xuICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIHNlbGZGdWxmaWxsbWVudCgpKTtcbiAgfSBlbHNlIGlmIChvYmplY3RPckZ1bmN0aW9uKHZhbHVlKSkge1xuICAgIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUsIGdldFRoZW4odmFsdWUpKTtcbiAgfSBlbHNlIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwdWJsaXNoUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgaWYgKHByb21pc2UuX29uZXJyb3IpIHtcbiAgICBwcm9taXNlLl9vbmVycm9yKHByb21pc2UuX3Jlc3VsdCk7XG4gIH1cblxuICBwdWJsaXNoKHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBmdWxmaWxsKHByb21pc2UsIHZhbHVlKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UuX3Jlc3VsdCA9IHZhbHVlO1xuICBwcm9taXNlLl9zdGF0ZSA9IEZVTEZJTExFRDtcblxuICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoICE9PSAwKSB7XG4gICAgYXNhcChwdWJsaXNoLCBwcm9taXNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfcmVqZWN0KHByb21pc2UsIHJlYXNvbikge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcHJvbWlzZS5fc3RhdGUgPSBSRUpFQ1RFRDtcbiAgcHJvbWlzZS5fcmVzdWx0ID0gcmVhc29uO1xuXG4gIGFzYXAocHVibGlzaFJlamVjdGlvbiwgcHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICB2YXIgX3N1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgdmFyIGxlbmd0aCA9IF9zdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgcGFyZW50Ll9vbmVycm9yID0gbnVsbDtcblxuICBfc3Vic2NyaWJlcnNbbGVuZ3RoXSA9IGNoaWxkO1xuICBfc3Vic2NyaWJlcnNbbGVuZ3RoICsgRlVMRklMTEVEXSA9IG9uRnVsZmlsbG1lbnQ7XG4gIF9zdWJzY3JpYmVyc1tsZW5ndGggKyBSRUpFQ1RFRF0gPSBvblJlamVjdGlvbjtcblxuICBpZiAobGVuZ3RoID09PSAwICYmIHBhcmVudC5fc3RhdGUpIHtcbiAgICBhc2FwKHB1Ymxpc2gsIHBhcmVudCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHVibGlzaChwcm9taXNlKSB7XG4gIHZhciBzdWJzY3JpYmVycyA9IHByb21pc2UuX3N1YnNjcmliZXJzO1xuICB2YXIgc2V0dGxlZCA9IHByb21pc2UuX3N0YXRlO1xuXG4gIGlmIChzdWJzY3JpYmVycy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgY2hpbGQgPSB1bmRlZmluZWQsXG4gICAgICBjYWxsYmFjayA9IHVuZGVmaW5lZCxcbiAgICAgIGRldGFpbCA9IHByb21pc2UuX3Jlc3VsdDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnNjcmliZXJzLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgY2hpbGQgPSBzdWJzY3JpYmVyc1tpXTtcbiAgICBjYWxsYmFjayA9IHN1YnNjcmliZXJzW2kgKyBzZXR0bGVkXTtcblxuICAgIGlmIChjaGlsZCkge1xuICAgICAgaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgIH1cbiAgfVxuXG4gIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG59XG5cbmZ1bmN0aW9uIEVycm9yT2JqZWN0KCkge1xuICB0aGlzLmVycm9yID0gbnVsbDtcbn1cblxudmFyIFRSWV9DQVRDSF9FUlJPUiA9IG5ldyBFcnJvck9iamVjdCgpO1xuXG5mdW5jdGlvbiB0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBUUllfQ0FUQ0hfRVJST1IuZXJyb3IgPSBlO1xuICAgIHJldHVybiBUUllfQ0FUQ0hfRVJST1I7XG4gIH1cbn1cblxuZnVuY3Rpb24gaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgcHJvbWlzZSwgY2FsbGJhY2ssIGRldGFpbCkge1xuICB2YXIgaGFzQ2FsbGJhY2sgPSBpc0Z1bmN0aW9uKGNhbGxiYWNrKSxcbiAgICAgIHZhbHVlID0gdW5kZWZpbmVkLFxuICAgICAgZXJyb3IgPSB1bmRlZmluZWQsXG4gICAgICBzdWNjZWVkZWQgPSB1bmRlZmluZWQsXG4gICAgICBmYWlsZWQgPSB1bmRlZmluZWQ7XG5cbiAgaWYgKGhhc0NhbGxiYWNrKSB7XG4gICAgdmFsdWUgPSB0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKTtcblxuICAgIGlmICh2YWx1ZSA9PT0gVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICBmYWlsZWQgPSB0cnVlO1xuICAgICAgZXJyb3IgPSB2YWx1ZS5lcnJvcjtcbiAgICAgIHZhbHVlID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICB9XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgLy8gbm9vcFxuICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoZmFpbGVkKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IEZVTEZJTExFRCkge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBSRUpFQ1RFRCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplUHJvbWlzZShwcm9taXNlLCByZXNvbHZlcikge1xuICB0cnkge1xuICAgIHJlc29sdmVyKGZ1bmN0aW9uIHJlc29sdmVQcm9taXNlKHZhbHVlKSB7XG4gICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gcmVqZWN0UHJvbWlzZShyZWFzb24pIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgZSk7XG4gIH1cbn1cblxudmFyIGlkID0gMDtcbmZ1bmN0aW9uIG5leHRJZCgpIHtcbiAgcmV0dXJuIGlkKys7XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9taXNlKHByb21pc2UpIHtcbiAgcHJvbWlzZVtQUk9NSVNFX0lEXSA9IGlkKys7XG4gIHByb21pc2UuX3N0YXRlID0gdW5kZWZpbmVkO1xuICBwcm9taXNlLl9yZXN1bHQgPSB1bmRlZmluZWQ7XG4gIHByb21pc2UuX3N1YnNjcmliZXJzID0gW107XG59XG5cbmZ1bmN0aW9uIEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0KSB7XG4gIHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3IgPSBDb25zdHJ1Y3RvcjtcbiAgdGhpcy5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuXG4gIGlmICghdGhpcy5wcm9taXNlW1BST01JU0VfSURdKSB7XG4gICAgbWFrZVByb21pc2UodGhpcy5wcm9taXNlKTtcbiAgfVxuXG4gIGlmIChpc0FycmF5KGlucHV0KSkge1xuICAgIHRoaXMuX2lucHV0ID0gaW5wdXQ7XG4gICAgdGhpcy5sZW5ndGggPSBpbnB1dC5sZW5ndGg7XG4gICAgdGhpcy5fcmVtYWluaW5nID0gaW5wdXQubGVuZ3RoO1xuXG4gICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5sZW5ndGggfHwgMDtcbiAgICAgIHRoaXMuX2VudW1lcmF0ZSgpO1xuICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICBmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgX3JlamVjdCh0aGlzLnByb21pc2UsIHZhbGlkYXRpb25FcnJvcigpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0aW9uRXJyb3IoKSB7XG4gIHJldHVybiBuZXcgRXJyb3IoJ0FycmF5IE1ldGhvZHMgbXVzdCBiZSBwcm92aWRlZCBhbiBBcnJheScpO1xufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoO1xuICB2YXIgX2lucHV0ID0gdGhpcy5faW5wdXQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IHRoaXMuX3N0YXRlID09PSBQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHRoaXMuX2VhY2hFbnRyeShfaW5wdXRbaV0sIGkpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24gKGVudHJ5LCBpKSB7XG4gIHZhciBjID0gdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcbiAgdmFyIHJlc29sdmUkJCA9IGMucmVzb2x2ZTtcblxuICBpZiAocmVzb2x2ZSQkID09PSByZXNvbHZlKSB7XG4gICAgdmFyIF90aGVuID0gZ2V0VGhlbihlbnRyeSk7XG5cbiAgICBpZiAoX3RoZW4gPT09IHRoZW4gJiYgZW50cnkuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgICB0aGlzLl9zZXR0bGVkQXQoZW50cnkuX3N0YXRlLCBpLCBlbnRyeS5fcmVzdWx0KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBfdGhlbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG4gICAgICB0aGlzLl9yZXN1bHRbaV0gPSBlbnRyeTtcbiAgICB9IGVsc2UgaWYgKGMgPT09IFByb21pc2UpIHtcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IGMobm9vcCk7XG4gICAgICBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIGVudHJ5LCBfdGhlbik7XG4gICAgICB0aGlzLl93aWxsU2V0dGxlQXQocHJvbWlzZSwgaSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChuZXcgYyhmdW5jdGlvbiAocmVzb2x2ZSQkKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlJCQoZW50cnkpO1xuICAgICAgfSksIGkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzLl93aWxsU2V0dGxlQXQocmVzb2x2ZSQkKGVudHJ5KSwgaSk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9zZXR0bGVkQXQgPSBmdW5jdGlvbiAoc3RhdGUsIGksIHZhbHVlKSB7XG4gIHZhciBwcm9taXNlID0gdGhpcy5wcm9taXNlO1xuXG4gIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gUEVORElORykge1xuICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuXG4gICAgaWYgKHN0YXRlID09PSBSRUpFQ1RFRCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbiAocHJvbWlzZSwgaSkge1xuICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgc3Vic2NyaWJlKHByb21pc2UsIHVuZGVmaW5lZCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGVudW1lcmF0b3IuX3NldHRsZWRBdChGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgIHJldHVybiBlbnVtZXJhdG9yLl9zZXR0bGVkQXQoUkVKRUNURUQsIGksIHJlYXNvbik7XG4gIH0pO1xufTtcblxuLyoqXG4gIGBQcm9taXNlLmFsbGAgYWNjZXB0cyBhbiBhcnJheSBvZiBwcm9taXNlcywgYW5kIHJldHVybnMgYSBuZXcgcHJvbWlzZSB3aGljaFxuICBpcyBmdWxmaWxsZWQgd2l0aCBhbiBhcnJheSBvZiBmdWxmaWxsbWVudCB2YWx1ZXMgZm9yIHRoZSBwYXNzZWQgcHJvbWlzZXMsIG9yXG4gIHJlamVjdGVkIHdpdGggdGhlIHJlYXNvbiBvZiB0aGUgZmlyc3QgcGFzc2VkIHByb21pc2UgdG8gYmUgcmVqZWN0ZWQuIEl0IGNhc3RzIGFsbFxuICBlbGVtZW50cyBvZiB0aGUgcGFzc2VkIGl0ZXJhYmxlIHRvIHByb21pc2VzIGFzIGl0IHJ1bnMgdGhpcyBhbGdvcml0aG0uXG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IHJlc29sdmUoMSk7XG4gIGxldCBwcm9taXNlMiA9IHJlc29sdmUoMik7XG4gIGxldCBwcm9taXNlMyA9IHJlc29sdmUoMyk7XG4gIGxldCBwcm9taXNlcyA9IFsgcHJvbWlzZTEsIHByb21pc2UyLCBwcm9taXNlMyBdO1xuXG4gIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGZ1bmN0aW9uKGFycmF5KXtcbiAgICAvLyBUaGUgYXJyYXkgaGVyZSB3b3VsZCBiZSBbIDEsIDIsIDMgXTtcbiAgfSk7XG4gIGBgYFxuXG4gIElmIGFueSBvZiB0aGUgYHByb21pc2VzYCBnaXZlbiB0byBgYWxsYCBhcmUgcmVqZWN0ZWQsIHRoZSBmaXJzdCBwcm9taXNlXG4gIHRoYXQgaXMgcmVqZWN0ZWQgd2lsbCBiZSBnaXZlbiBhcyBhbiBhcmd1bWVudCB0byB0aGUgcmV0dXJuZWQgcHJvbWlzZXMnc1xuICByZWplY3Rpb24gaGFuZGxlci4gRm9yIGV4YW1wbGU6XG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IHJlc29sdmUoMSk7XG4gIGxldCBwcm9taXNlMiA9IHJlamVjdChuZXcgRXJyb3IoXCIyXCIpKTtcbiAgbGV0IHByb21pc2UzID0gcmVqZWN0KG5ldyBFcnJvcihcIjNcIikpO1xuICBsZXQgcHJvbWlzZXMgPSBbIHByb21pc2UxLCBwcm9taXNlMiwgcHJvbWlzZTMgXTtcblxuICBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbihhcnJheSl7XG4gICAgLy8gQ29kZSBoZXJlIG5ldmVyIHJ1bnMgYmVjYXVzZSB0aGVyZSBhcmUgcmVqZWN0ZWQgcHJvbWlzZXMhXG4gIH0sIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgLy8gZXJyb3IubWVzc2FnZSA9PT0gXCIyXCJcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgYWxsXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBcnJheX0gZW50cmllcyBhcnJheSBvZiBwcm9taXNlc1xuICBAcGFyYW0ge1N0cmluZ30gbGFiZWwgb3B0aW9uYWwgc3RyaW5nIGZvciBsYWJlbGluZyB0aGUgcHJvbWlzZS5cbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBwcm9taXNlIHRoYXQgaXMgZnVsZmlsbGVkIHdoZW4gYWxsIGBwcm9taXNlc2AgaGF2ZSBiZWVuXG4gIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQgaWYgYW55IG9mIHRoZW0gYmVjb21lIHJlamVjdGVkLlxuICBAc3RhdGljXG4qL1xuZnVuY3Rpb24gYWxsKGVudHJpZXMpIHtcbiAgcmV0dXJuIG5ldyBFbnVtZXJhdG9yKHRoaXMsIGVudHJpZXMpLnByb21pc2U7XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yYWNlYCByZXR1cm5zIGEgbmV3IHByb21pc2Ugd2hpY2ggaXMgc2V0dGxlZCBpbiB0aGUgc2FtZSB3YXkgYXMgdGhlXG4gIGZpcnN0IHBhc3NlZCBwcm9taXNlIHRvIHNldHRsZS5cblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDEnKTtcbiAgICB9LCAyMDApO1xuICB9KTtcblxuICBsZXQgcHJvbWlzZTIgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMicpO1xuICAgIH0sIDEwMCk7XG4gIH0pO1xuXG4gIFByb21pc2UucmFjZShbcHJvbWlzZTEsIHByb21pc2UyXSkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgIC8vIHJlc3VsdCA9PT0gJ3Byb21pc2UgMicgYmVjYXVzZSBpdCB3YXMgcmVzb2x2ZWQgYmVmb3JlIHByb21pc2UxXG4gICAgLy8gd2FzIHJlc29sdmVkLlxuICB9KTtcbiAgYGBgXG5cbiAgYFByb21pc2UucmFjZWAgaXMgZGV0ZXJtaW5pc3RpYyBpbiB0aGF0IG9ubHkgdGhlIHN0YXRlIG9mIHRoZSBmaXJzdFxuICBzZXR0bGVkIHByb21pc2UgbWF0dGVycy4gRm9yIGV4YW1wbGUsIGV2ZW4gaWYgb3RoZXIgcHJvbWlzZXMgZ2l2ZW4gdG8gdGhlXG4gIGBwcm9taXNlc2AgYXJyYXkgYXJndW1lbnQgYXJlIHJlc29sdmVkLCBidXQgdGhlIGZpcnN0IHNldHRsZWQgcHJvbWlzZSBoYXNcbiAgYmVjb21lIHJlamVjdGVkIGJlZm9yZSB0aGUgb3RoZXIgcHJvbWlzZXMgYmVjYW1lIGZ1bGZpbGxlZCwgdGhlIHJldHVybmVkXG4gIHByb21pc2Ugd2lsbCBiZWNvbWUgcmVqZWN0ZWQ6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMScpO1xuICAgIH0sIDIwMCk7XG4gIH0pO1xuXG4gIGxldCBwcm9taXNlMiA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcigncHJvbWlzZSAyJykpO1xuICAgIH0sIDEwMCk7XG4gIH0pO1xuXG4gIFByb21pc2UucmFjZShbcHJvbWlzZTEsIHByb21pc2UyXSkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgIC8vIENvZGUgaGVyZSBuZXZlciBydW5zXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdwcm9taXNlIDInIGJlY2F1c2UgcHJvbWlzZSAyIGJlY2FtZSByZWplY3RlZCBiZWZvcmVcbiAgICAvLyBwcm9taXNlIDEgYmVjYW1lIGZ1bGZpbGxlZFxuICB9KTtcbiAgYGBgXG5cbiAgQW4gZXhhbXBsZSByZWFsLXdvcmxkIHVzZSBjYXNlIGlzIGltcGxlbWVudGluZyB0aW1lb3V0czpcblxuICBgYGBqYXZhc2NyaXB0XG4gIFByb21pc2UucmFjZShbYWpheCgnZm9vLmpzb24nKSwgdGltZW91dCg1MDAwKV0pXG4gIGBgYFxuXG4gIEBtZXRob2QgcmFjZVxuICBAc3RhdGljXG4gIEBwYXJhbSB7QXJyYXl9IHByb21pc2VzIGFycmF5IG9mIHByb21pc2VzIHRvIG9ic2VydmVcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2Ugd2hpY2ggc2V0dGxlcyBpbiB0aGUgc2FtZSB3YXkgYXMgdGhlIGZpcnN0IHBhc3NlZFxuICBwcm9taXNlIHRvIHNldHRsZS5cbiovXG5mdW5jdGlvbiByYWNlKGVudHJpZXMpIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICBpZiAoIWlzQXJyYXkoZW50cmllcykpIHtcbiAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uIChfLCByZWplY3QpIHtcbiAgICAgIHJldHVybiByZWplY3QobmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgQ29uc3RydWN0b3IucmVzb2x2ZShlbnRyaWVzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuLyoqXG4gIGBQcm9taXNlLnJlamVjdGAgcmV0dXJucyBhIHByb21pc2UgcmVqZWN0ZWQgd2l0aCB0aGUgcGFzc2VkIGByZWFzb25gLlxuICBJdCBpcyBzaG9ydGhhbmQgZm9yIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgcmVqZWN0KG5ldyBFcnJvcignV0hPT1BTJykpO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIENvZGUgaGVyZSBkb2Vzbid0IHJ1biBiZWNhdXNlIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIVxuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAnV0hPT1BTJ1xuICB9KTtcbiAgYGBgXG5cbiAgSW5zdGVhZCBvZiB3cml0aW5nIHRoZSBhYm92ZSwgeW91ciBjb2RlIG5vdyBzaW1wbHkgYmVjb21lcyB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1dIT09QUycpKTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIENvZGUgaGVyZSBkb2Vzbid0IHJ1biBiZWNhdXNlIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIVxuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAnV0hPT1BTJ1xuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCByZWplY3RcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FueX0gcmVhc29uIHZhbHVlIHRoYXQgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSByZWplY3RlZCB3aXRoLlxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSByZWplY3RlZCB3aXRoIHRoZSBnaXZlbiBgcmVhc29uYC5cbiovXG5mdW5jdGlvbiByZWplY3QocmVhc29uKSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG4gIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG5mdW5jdGlvbiBuZWVkc1Jlc29sdmVyKCkge1xuICB0aHJvdyBuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGEgcmVzb2x2ZXIgZnVuY3Rpb24gYXMgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHRoZSBwcm9taXNlIGNvbnN0cnVjdG9yJyk7XG59XG5cbmZ1bmN0aW9uIG5lZWRzTmV3KCkge1xuICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnUHJvbWlzZSc6IFBsZWFzZSB1c2UgdGhlICduZXcnIG9wZXJhdG9yLCB0aGlzIG9iamVjdCBjb25zdHJ1Y3RvciBjYW5ub3QgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24uXCIpO1xufVxuXG4vKipcbiAgUHJvbWlzZSBvYmplY3RzIHJlcHJlc2VudCB0aGUgZXZlbnR1YWwgcmVzdWx0IG9mIGFuIGFzeW5jaHJvbm91cyBvcGVyYXRpb24uIFRoZVxuICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZSByZWFzb25cbiAgd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgVGVybWlub2xvZ3lcbiAgLS0tLS0tLS0tLS1cblxuICAtIGBwcm9taXNlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gd2l0aCBhIGB0aGVuYCBtZXRob2Qgd2hvc2UgYmVoYXZpb3IgY29uZm9ybXMgdG8gdGhpcyBzcGVjaWZpY2F0aW9uLlxuICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gIC0gYHZhbHVlYCBpcyBhbnkgbGVnYWwgSmF2YVNjcmlwdCB2YWx1ZSAoaW5jbHVkaW5nIHVuZGVmaW5lZCwgYSB0aGVuYWJsZSwgb3IgYSBwcm9taXNlKS5cbiAgLSBgZXhjZXB0aW9uYCBpcyBhIHZhbHVlIHRoYXQgaXMgdGhyb3duIHVzaW5nIHRoZSB0aHJvdyBzdGF0ZW1lbnQuXG4gIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgLSBgc2V0dGxlZGAgdGhlIGZpbmFsIHJlc3Rpbmcgc3RhdGUgb2YgYSBwcm9taXNlLCBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuXG5cbiAgQSBwcm9taXNlIGNhbiBiZSBpbiBvbmUgb2YgdGhyZWUgc3RhdGVzOiBwZW5kaW5nLCBmdWxmaWxsZWQsIG9yIHJlamVjdGVkLlxuXG4gIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gIHN0YXRlLiAgUHJvbWlzZXMgdGhhdCBhcmUgcmVqZWN0ZWQgaGF2ZSBhIHJlamVjdGlvbiByZWFzb24gYW5kIGFyZSBpbiB0aGVcbiAgcmVqZWN0ZWQgc3RhdGUuICBBIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5ldmVyIGEgdGhlbmFibGUuXG5cbiAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gIHByb21pc2UsIHRoZW4gdGhlIG9yaWdpbmFsIHByb21pc2UncyBzZXR0bGVkIHN0YXRlIHdpbGwgbWF0Y2ggdGhlIHZhbHVlJ3NcbiAgc2V0dGxlZCBzdGF0ZS4gIFNvIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aWxsXG4gIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgaXRzZWxmIGZ1bGZpbGwuXG5cblxuICBCYXNpYyBVc2FnZTpcbiAgLS0tLS0tLS0tLS0tXG5cbiAgYGBganNcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAvLyBvbiBzdWNjZXNzXG4gICAgcmVzb2x2ZSh2YWx1ZSk7XG5cbiAgICAvLyBvbiBmYWlsdXJlXG4gICAgcmVqZWN0KHJlYXNvbik7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgIC8vIG9uIHJlamVjdGlvblxuICB9KTtcbiAgYGBgXG5cbiAgQWR2YW5jZWQgVXNhZ2U6XG4gIC0tLS0tLS0tLS0tLS0tLVxuXG4gIFByb21pc2VzIHNoaW5lIHdoZW4gYWJzdHJhY3RpbmcgYXdheSBhc3luY2hyb25vdXMgaW50ZXJhY3Rpb25zIHN1Y2ggYXNcbiAgYFhNTEh0dHBSZXF1ZXN0YHMuXG5cbiAgYGBganNcbiAgZnVuY3Rpb24gZ2V0SlNPTih1cmwpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgeGhyLm9wZW4oJ0dFVCcsIHVybCk7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gaGFuZGxlcjtcbiAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgICAgIHhoci5zZW5kKCk7XG5cbiAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IHRoaXMuRE9ORSkge1xuICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdnZXRKU09OOiBgJyArIHVybCArICdgIGZhaWxlZCB3aXRoIHN0YXR1czogWycgKyB0aGlzLnN0YXR1cyArICddJykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldEpTT04oJy9wb3N0cy5qc29uJykudGhlbihmdW5jdGlvbihqc29uKSB7XG4gICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgLy8gb24gcmVqZWN0aW9uXG4gIH0pO1xuICBgYGBcblxuICBVbmxpa2UgY2FsbGJhY2tzLCBwcm9taXNlcyBhcmUgZ3JlYXQgY29tcG9zYWJsZSBwcmltaXRpdmVzLlxuXG4gIGBgYGpzXG4gIFByb21pc2UuYWxsKFtcbiAgICBnZXRKU09OKCcvcG9zdHMnKSxcbiAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICBdKS50aGVuKGZ1bmN0aW9uKHZhbHVlcyl7XG4gICAgdmFsdWVzWzBdIC8vID0+IHBvc3RzSlNPTlxuICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgIHJldHVybiB2YWx1ZXM7XG4gIH0pO1xuICBgYGBcblxuICBAY2xhc3MgUHJvbWlzZVxuICBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlclxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEBjb25zdHJ1Y3RvclxuKi9cbmZ1bmN0aW9uIFByb21pc2UocmVzb2x2ZXIpIHtcbiAgdGhpc1tQUk9NSVNFX0lEXSA9IG5leHRJZCgpO1xuICB0aGlzLl9yZXN1bHQgPSB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgdGhpcy5fc3Vic2NyaWJlcnMgPSBbXTtcblxuICBpZiAobm9vcCAhPT0gcmVzb2x2ZXIpIHtcbiAgICB0eXBlb2YgcmVzb2x2ZXIgIT09ICdmdW5jdGlvbicgJiYgbmVlZHNSZXNvbHZlcigpO1xuICAgIHRoaXMgaW5zdGFuY2VvZiBQcm9taXNlID8gaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpIDogbmVlZHNOZXcoKTtcbiAgfVxufVxuXG5Qcm9taXNlLmFsbCA9IGFsbDtcblByb21pc2UucmFjZSA9IHJhY2U7XG5Qcm9taXNlLnJlc29sdmUgPSByZXNvbHZlO1xuUHJvbWlzZS5yZWplY3QgPSByZWplY3Q7XG5Qcm9taXNlLl9zZXRTY2hlZHVsZXIgPSBzZXRTY2hlZHVsZXI7XG5Qcm9taXNlLl9zZXRBc2FwID0gc2V0QXNhcDtcblByb21pc2UuX2FzYXAgPSBhc2FwO1xuXG5Qcm9taXNlLnByb3RvdHlwZSA9IHtcbiAgY29uc3RydWN0b3I6IFByb21pc2UsXG5cbiAgLyoqXG4gICAgVGhlIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsXG4gICAgd2hpY2ggcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGVcbiAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uKHVzZXIpe1xuICAgICAgLy8gdXNlciBpcyBhdmFpbGFibGVcbiAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gdXNlciBpcyB1bmF2YWlsYWJsZSwgYW5kIHlvdSBhcmUgZ2l2ZW4gdGhlIHJlYXNvbiB3aHlcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQ2hhaW5pbmdcbiAgICAtLS0tLS0tLVxuICBcbiAgICBUaGUgcmV0dXJuIHZhbHVlIG9mIGB0aGVuYCBpcyBpdHNlbGYgYSBwcm9taXNlLiAgVGhpcyBzZWNvbmQsICdkb3duc3RyZWFtJ1xuICAgIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmaXJzdCBwcm9taXNlJ3MgZnVsZmlsbG1lbnRcbiAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiB1c2VyLm5hbWU7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgcmV0dXJuICdkZWZhdWx0IG5hbWUnO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHVzZXJOYW1lKSB7XG4gICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAvLyB3aWxsIGJlIGAnZGVmYXVsdCBuYW1lJ2BcbiAgICB9KTtcbiAgXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jyk7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgLy8gSWYgYGZpbmRVc2VyYCByZWplY3RlZCwgYHJlYXNvbmAgd2lsbCBiZSAnYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScuXG4gICAgfSk7XG4gICAgYGBgXG4gICAgSWYgdGhlIGRvd25zdHJlYW0gcHJvbWlzZSBkb2VzIG5vdCBzcGVjaWZ5IGEgcmVqZWN0aW9uIGhhbmRsZXIsIHJlamVjdGlvbiByZWFzb25zIHdpbGwgYmUgcHJvcGFnYXRlZCBmdXJ0aGVyIGRvd25zdHJlYW0uXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEFzc2ltaWxhdGlvblxuICAgIC0tLS0tLS0tLS0tLVxuICBcbiAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgIHJldHJpZXZlZCBhc3luY2hyb25vdXNseS4gVGhpcyBjYW4gYmUgYWNoaWV2ZWQgYnkgcmV0dXJuaW5nIGEgcHJvbWlzZSBpbiB0aGVcbiAgICBmdWxmaWxsbWVudCBvciByZWplY3Rpb24gaGFuZGxlci4gVGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIHRoZW4gYmUgcGVuZGluZ1xuICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAvLyBUaGUgdXNlcidzIGNvbW1lbnRzIGFyZSBub3cgYXZhaWxhYmxlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIGZ1bGZpbGxzLCB3ZSdsbCBoYXZlIHRoZSB2YWx1ZSBoZXJlXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBTaW1wbGUgRXhhbXBsZVxuICAgIC0tLS0tLS0tLS0tLS0tXG4gIFxuICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGxldCByZXN1bHQ7XG4gIFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBmaW5kUmVzdWx0KCk7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9XG4gICAgYGBgXG4gIFxuICAgIEVycmJhY2sgRXhhbXBsZVxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRSZXN1bHQoZnVuY3Rpb24ocmVzdWx0LCBlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFByb21pc2UgRXhhbXBsZTtcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGZpbmRSZXN1bHQoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgIC0tLS0tLS0tLS0tLS0tXG4gIFxuICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGxldCBhdXRob3IsIGJvb2tzO1xuICBcbiAgICB0cnkge1xuICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgYm9va3MgID0gZmluZEJvb2tzQnlBdXRob3IoYXV0aG9yKTtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH1cbiAgICBgYGBcbiAgXG4gICAgRXJyYmFjayBFeGFtcGxlXG4gIFxuICAgIGBgYGpzXG4gIFxuICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcbiAgXG4gICAgfVxuICBcbiAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuICBcbiAgICB9XG4gIFxuICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGZvdW5kQm9va3MoYm9va3MpO1xuICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgIGZhaWx1cmUocmVhc29uKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH1cbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgUHJvbWlzZSBFeGFtcGxlO1xuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgZmluZEF1dGhvcigpLlxuICAgICAgdGhlbihmaW5kQm9va3NCeUF1dGhvcikuXG4gICAgICB0aGVuKGZ1bmN0aW9uKGJvb2tzKXtcbiAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQG1ldGhvZCB0aGVuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25GdWxmaWxsZWRcbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICovXG4gIHRoZW46IHRoZW4sXG5cbiAgLyoqXG4gICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgIGFzIHRoZSBjYXRjaCBibG9jayBvZiBhIHRyeS9jYXRjaCBzdGF0ZW1lbnQuXG4gIFxuICAgIGBgYGpzXG4gICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgfVxuICBcbiAgICAvLyBzeW5jaHJvbm91c1xuICAgIHRyeSB7XG4gICAgICBmaW5kQXV0aG9yKCk7XG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfVxuICBcbiAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgZmluZEF1dGhvcigpLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBAbWV0aG9kIGNhdGNoXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgQHJldHVybiB7UHJvbWlzZX1cbiAgKi9cbiAgJ2NhdGNoJzogZnVuY3Rpb24gX2NhdGNoKG9uUmVqZWN0aW9uKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihudWxsLCBvblJlamVjdGlvbik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHBvbHlmaWxsKCkge1xuICAgIHZhciBsb2NhbCA9IHVuZGVmaW5lZDtcblxuICAgIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsb2NhbCA9IGdsb2JhbDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxvY2FsID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwb2x5ZmlsbCBmYWlsZWQgYmVjYXVzZSBnbG9iYWwgb2JqZWN0IGlzIHVuYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQID0gbG9jYWwuUHJvbWlzZTtcblxuICAgIGlmIChQKSB7XG4gICAgICAgIHZhciBwcm9taXNlVG9TdHJpbmcgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcHJvbWlzZVRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKFAucmVzb2x2ZSgpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgLy8gc2lsZW50bHkgaWdub3JlZFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2VUb1N0cmluZyA9PT0gJ1tvYmplY3QgUHJvbWlzZV0nICYmICFQLmNhc3QpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxvY2FsLlByb21pc2UgPSBQcm9taXNlO1xufVxuXG4vLyBTdHJhbmdlIGNvbXBhdC4uXG5Qcm9taXNlLnBvbHlmaWxsID0gcG9seWZpbGw7XG5Qcm9taXNlLlByb21pc2UgPSBQcm9taXNlO1xuXG5yZXR1cm4gUHJvbWlzZTtcblxufSkpKTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWVzNi1wcm9taXNlLm1hcCIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBjYWNoZWQgZnJvbSB3aGF0ZXZlciBnbG9iYWwgaXMgcHJlc2VudCBzbyB0aGF0IHRlc3QgcnVubmVycyB0aGF0IHN0dWIgaXRcbi8vIGRvbid0IGJyZWFrIHRoaW5ncy4gIEJ1dCB3ZSBuZWVkIHRvIHdyYXAgaXQgaW4gYSB0cnkgY2F0Y2ggaW4gY2FzZSBpdCBpc1xuLy8gd3JhcHBlZCBpbiBzdHJpY3QgbW9kZSBjb2RlIHdoaWNoIGRvZXNuJ3QgZGVmaW5lIGFueSBnbG9iYWxzLiAgSXQncyBpbnNpZGUgYVxuLy8gZnVuY3Rpb24gYmVjYXVzZSB0cnkvY2F0Y2hlcyBkZW9wdGltaXplIGluIGNlcnRhaW4gZW5naW5lcy5cblxudmFyIGNhY2hlZFNldFRpbWVvdXQ7XG52YXIgY2FjaGVkQ2xlYXJUaW1lb3V0O1xuXG5mdW5jdGlvbiBkZWZhdWx0U2V0VGltb3V0KCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2V0VGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuZnVuY3Rpb24gZGVmYXVsdENsZWFyVGltZW91dCAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGVhclRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgfVxufSAoKSlcbmZ1bmN0aW9uIHJ1blRpbWVvdXQoZnVuKSB7XG4gICAgaWYgKGNhY2hlZFNldFRpbWVvdXQgPT09IHNldFRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIC8vIGlmIHNldFRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRTZXRUaW1lb3V0ID09PSBkZWZhdWx0U2V0VGltb3V0IHx8ICFjYWNoZWRTZXRUaW1lb3V0KSAmJiBzZXRUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfSBjYXRjaChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbChudWxsLCBmdW4sIDApO1xuICAgICAgICB9IGNhdGNoKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3JcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwodGhpcywgZnVuLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG59XG5mdW5jdGlvbiBydW5DbGVhclRpbWVvdXQobWFya2VyKSB7XG4gICAgaWYgKGNhY2hlZENsZWFyVGltZW91dCA9PT0gY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIC8vIGlmIGNsZWFyVGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZENsZWFyVGltZW91dCA9PT0gZGVmYXVsdENsZWFyVGltZW91dCB8fCAhY2FjaGVkQ2xlYXJUaW1lb3V0KSAmJiBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0ICB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKG51bGwsIG1hcmtlcik7XG4gICAgICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3IuXG4gICAgICAgICAgICAvLyBTb21lIHZlcnNpb25zIG9mIEkuRS4gaGF2ZSBkaWZmZXJlbnQgcnVsZXMgZm9yIGNsZWFyVGltZW91dCB2cyBzZXRUaW1lb3V0XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwodGhpcywgbWFya2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbn1cbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHJ1blRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIHJ1bkNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHJ1blRpbWVvdXQoZHJhaW5RdWV1ZSk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJleHBvcnQgY29uc3QgRVZFTlRTID0ge1xyXG4gIFNJR05JTjogJ1NJR05JTicsXHJcbiAgU0lHTk9VVDogJ1NJR05PVVQnLFxyXG4gIFNJR05VUDogJ1NJR05VUCdcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBVUkxTID0ge1xyXG4gIHRva2VuOiAndG9rZW4nLFxyXG4gIHNpZ251cDogJzEvdXNlci9zaWdudXAnLFxyXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkOiAnMS91c2VyL3JlcXVlc3RSZXNldFBhc3N3b3JkJyxcclxuICByZXNldFBhc3N3b3JkOiAnMS91c2VyL3Jlc2V0UGFzc3dvcmQnLFxyXG4gIGNoYW5nZVBhc3N3b3JkOiAnMS91c2VyL2NoYW5nZVBhc3N3b3JkJyxcclxuICBvYmplY3RzOiAnMS9vYmplY3RzJyxcclxuICBvYmplY3RzQWN0aW9uOiAnMS9vYmplY3RzL2FjdGlvbidcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBTT0NJQUxfUFJPVklERVJTID0ge1xyXG4gIGdpdGh1Yjoge25hbWU6ICdnaXRodWInLCBsYWJlbDogJ0dpdGh1YicsIHVybDogJ3d3dy5naXRodWIuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzQ0NCd9LCBpZDogMX0sXHJcbiAgZ29vZ2xlOiB7bmFtZTogJ2dvb2dsZScsIGxhYmVsOiAnR29vZ2xlJywgdXJsOiAnd3d3Lmdvb2dsZS5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjZGQ0YjM5J30sIGlkOiAyfSxcclxuICBmYWNlYm9vazoge25hbWU6ICdmYWNlYm9vaycsIGxhYmVsOiAnRmFjZWJvb2snLCB1cmw6ICd3d3cuZmFjZWJvb2suY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzNiNTk5OCd9LCBpZDogM30sXHJcbiAgdHdpdHRlcjoge25hbWU6ICd0d2l0dGVyJywgbGFiZWw6ICdUd2l0dGVyJywgdXJsOiAnd3d3LnR3aXR0ZXIuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzU1YWNlZSd9LCBpZDogNH1cclxufTtcclxuIiwiZXhwb3J0IGRlZmF1bHQge1xyXG4gIGFwcE5hbWU6IG51bGwsXHJcbiAgYW5vbnltb3VzVG9rZW46IG51bGwsXHJcbiAgc2lnblVwVG9rZW46IG51bGwsXHJcbiAgYXBpVXJsOiAnaHR0cHM6Ly9hcGkuYmFja2FuZC5jb20nLFxyXG4gIHN0b3JhZ2VQcmVmaXg6ICdCQUNLQU5EXycsXHJcbiAgc3RvcmFnZVR5cGU6ICdsb2NhbCcsXHJcbiAgbWFuYWdlUmVmcmVzaFRva2VuOiB0cnVlLFxyXG4gIHJ1blNpZ25pbkFmdGVyU2lnbnVwOiB0cnVlLFxyXG4gIHJ1blNvY2tldDogZmFsc2UsXHJcbiAgc29ja2V0VXJsOiAnaHR0cHM6Ly9zb2NrZXQuYmFja2FuZC5jb20nLFxyXG4gIGlzTW9iaWxlOiBmYWxzZSxcclxufTtcclxuIiwiZXhwb3J0IGNvbnN0IGZpbHRlciA9IHtcclxuICBjcmVhdGU6IChmaWVsZE5hbWUsIG9wZXJhdG9yLCB2YWx1ZSkgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcGVyYXRvcixcclxuICAgICAgdmFsdWVcclxuICAgIH1cclxuICB9LFxyXG4gIG9wZXJhdG9yczoge1xyXG4gICAgbnVtZXJpYzogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgZ3JlYXRlclRoYW46IFwiZ3JlYXRlclRoYW5cIiwgZ3JlYXRlclRoYW5PckVxdWFsc1RvOiBcImdyZWF0ZXJUaGFuT3JFcXVhbHNUb1wiLCBsZXNzVGhhbjogXCJsZXNzVGhhblwiLCBsZXNzVGhhbk9yRXF1YWxzVG86IFwibGVzc1RoYW5PckVxdWFsc1RvXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIGRhdGU6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIGdyZWF0ZXJUaGFuOiBcImdyZWF0ZXJUaGFuXCIsIGdyZWF0ZXJUaGFuT3JFcXVhbHNUbzogXCJncmVhdGVyVGhhbk9yRXF1YWxzVG9cIiwgbGVzc1RoYW46IFwibGVzc1RoYW5cIiwgbGVzc1RoYW5PckVxdWFsc1RvOiBcImxlc3NUaGFuT3JFcXVhbHNUb1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICB0ZXh0OiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBzdGFydHNXaXRoOiBcInN0YXJ0c1dpdGhcIiwgZW5kc1dpdGg6IFwiZW5kc1dpdGhcIiwgY29udGFpbnM6IFwiY29udGFpbnNcIiwgbm90Q29udGFpbnM6IFwibm90Q29udGFpbnNcIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgYm9vbGVhbjogeyBlcXVhbHM6IFwiZXF1YWxzXCIgfSxcclxuICAgIHJlbGF0aW9uOiB7IGluOiBcImluXCIgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNvcnQgPSB7XHJcbiAgY3JlYXRlOiAoZmllbGROYW1lLCBvcmRlcikgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcmRlclxyXG4gICAgfVxyXG4gIH0sXHJcbiAgb3JkZXJzOiB7IGFzYzogXCJhc2NcIiwgZGVzYzogXCJkZXNjXCIgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgZXhjbHVkZSA9IHtcclxuICBvcHRpb25zOiB7IG1ldGFkYXRhOiBcIm1ldGFkYXRhXCIsIHRvdGFsUm93czogXCJ0b3RhbFJvd3NcIiwgYWxsOiBcIm1ldGFkYXRhLHRvdGFsUm93c1wiIH1cclxufVxyXG4iLCIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICogYmFja2FuZCBKYXZhU2NyaXB0IExpYnJhcnlcclxuICogQXV0aG9yczogYmFja2FuZFxyXG4gKiBMaWNlbnNlOiBNSVQgKGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwKVxyXG4gKiBDb21waWxlZCBBdDogMjYvMTEvMjAxNlxyXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJ1xyXG5pbXBvcnQgKiBhcyBjb25zdGFudHMgZnJvbSAnLi9jb25zdGFudHMnXHJcbmltcG9ydCAqIGFzIGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJ1xyXG5pbXBvcnQgU3RvcmFnZSBmcm9tICcuL3V0aWxzL3N0b3JhZ2UnXHJcbmltcG9ydCBIdHRwIGZyb20gJy4vdXRpbHMvaHR0cCdcclxuaW1wb3J0IFNvY2tldCBmcm9tICcuL3V0aWxzL3NvY2tldCdcclxuaW1wb3J0ICogYXMgYXV0aCBmcm9tICcuL3NlcnZpY2VzL2F1dGgnXHJcbmltcG9ydCAqIGFzIGNydWQgZnJvbSAnLi9zZXJ2aWNlcy9jcnVkJ1xyXG5pbXBvcnQgKiBhcyBmaWxlcyBmcm9tICcuL3NlcnZpY2VzL2ZpbGVzJ1xyXG5cclxuKCgpID0+IHtcclxuICAndXNlIHN0cmljdCc7XHJcbiAgd2luZG93WydiYWNrYW5kJ10gPSB7fTtcclxuICB3aW5kb3dbJ2JhY2thbmQnXS5pbml0aWF0ZSA9IChjb25maWcgPSB7fSkgPT4ge1xyXG5cclxuICAgIC8vIGNvbWJpbmUgZGVmYXVsdHMgd2l0aCB1c2VyIGNvbmZpZ1xyXG4gICAgT2JqZWN0LmFzc2lnbihkZWZhdWx0cywgY29uZmlnKTtcblxuICAgIC8vIHZlcmlmeSBuZXcgZGVmYXVsdHNcclxuICAgIGlmICghZGVmYXVsdHMuYXBwTmFtZSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdhcHBOYW1lIGlzIG1pc3NpbmcnKTtcclxuICAgIGlmICghZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4pXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignYW5vbnltb3VzVG9rZW4gaXMgbWlzc2luZycpO1xyXG4gICAgaWYgKCFkZWZhdWx0cy5zaWduVXBUb2tlbilcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzaWduVXBUb2tlbiBpcyBtaXNzaW5nJyk7XHJcblxyXG4gICAgLy8gaW5pdCBnbG9iYWxzXHJcbiAgICBsZXQgc3RvcmFnZSA9IG5ldyBTdG9yYWdlKGRlZmF1bHRzLnN0b3JhZ2VUeXBlLCBkZWZhdWx0cy5zdG9yYWdlUHJlZml4KTtcclxuICAgIGxldCBodHRwID0gSHR0cC5jcmVhdGUoe1xyXG4gICAgICBiYXNlVVJMOiBkZWZhdWx0cy5hcGlVcmxcclxuICAgIH0pO1xyXG4gICAgbGV0IHNjb3BlID0ge1xyXG4gICAgICBzdG9yYWdlLFxyXG4gICAgICBodHRwLFxyXG4gICAgICBpc0lFOiBmYWxzZSB8fCAhIWRvY3VtZW50LmRvY3VtZW50TW9kZSxcclxuICAgIH1cclxuICAgIGxldCBzb2NrZXQgPSBudWxsO1xyXG4gICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICBzb2NrZXQgPSBuZXcgU29ja2V0KGRlZmF1bHRzLnNvY2tldFVybCk7XHJcbiAgICAgIHNjb3BlLnNvY2tldCA9IHNvY2tldDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBiaW5kIGdsb2JhbHMgdG8gYWxsIHNlcnZpY2UgZnVuY3Rpb25zXHJcbiAgICBsZXQgc2VydmljZSA9IE9iamVjdC5hc3NpZ24oe30sIGF1dGgsIGNydWQsIGZpbGVzKTtcclxuICAgIGZvciAobGV0IGZuIGluIHNlcnZpY2UpIHtcclxuICAgICAgc2VydmljZVtmbl0gPSBzZXJ2aWNlW2ZuXS5iaW5kKHNjb3BlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBzZXQgaW50ZXJjZXB0b3IgZm9yIGF1dGhIZWFkZXJzICYgcmVmcmVzaFRva2VuXHJcbiAgICBodHRwLmNvbmZpZy5pbnRlcmNlcHRvcnMgPSB7XHJcbiAgICAgIHJlcXVlc3Q6IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gICAgICAgIGlmIChjb25maWcudXJsLmluZGV4T2YoY29uc3RhbnRzLlVSTFMudG9rZW4pID09PSAgLTEgJiYgc3RvcmFnZS5nZXQoJ3VzZXInKSkge1xyXG4gICAgICAgICAgY29uZmlnLmhlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWcuaGVhZGVycywgc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbilcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChlcnJvciwgY29uZmlnLCByZXNvbHZlLCByZWplY3QsIHNjYiwgZWNiKSB7XHJcbiAgICAgICAgaWYgKGNvbmZpZy51cmwuaW5kZXhPZihjb25zdGFudHMuVVJMUy50b2tlbikgPT09ICAtMVxyXG4gICAgICAgICAmJiBkZWZhdWx0cy5tYW5hZ2VSZWZyZXNoVG9rZW5cclxuICAgICAgICAgJiYgZXJyb3Iuc3RhdHVzID09PSA0MDFcclxuICAgICAgICAgJiYgZXJyb3IuZGF0YSAmJiBlcnJvci5kYXRhLk1lc3NhZ2UgPT09ICdpbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nKSB7XHJcbiAgICAgICAgICAgYXV0aC5fX2hhbmRsZVJlZnJlc2hUb2tlbl9fLmNhbGwoc2NvcGUsIGVycm9yKVxyXG4gICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgIHRoaXMucmVxdWVzdChjb25maWcsIHNjYiwgZWNiKTtcclxuICAgICAgICAgICB9KVxyXG4gICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gZXhwb3NlIGJhY2thbmQgbmFtZXNwYWNlIHRvIHdpbmRvd1xyXG4gICAgd2luZG93WydiYWNrYW5kJ10gPSB7XHJcbiAgICAgIHNlcnZpY2UsXHJcbiAgICAgIGNvbnN0YW50cyxcclxuICAgICAgaGVscGVycyxcclxuICAgIH07XHJcbiAgICBpZihkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgc3RvcmFnZS5nZXQoJ3VzZXInKSAmJiBzb2NrZXQuY29ubmVjdChzdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24gfHwgbnVsbCwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpXHJcbiAgICAgIHdpbmRvd1snYmFja2FuZCddLnNvY2tldCA9IHNvY2tldDtcclxuICAgIH1cclxuXHJcbiAgfVxyXG59KSgpO1xyXG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcbmltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xyXG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi8uLi9kZWZhdWx0cydcblxyXG5mdW5jdGlvbiBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18gKHN0YXR1cyA9IDAsIHN0YXR1c1RleHQgPSAnJywgaGVhZGVycyA9IFtdLCBkYXRhID0gJycpIHtcclxuICByZXR1cm4ge1xyXG4gICAgc3RhdHVzLFxyXG4gICAgc3RhdHVzVGV4dCxcclxuICAgIGhlYWRlcnMsXHJcbiAgICBkYXRhXHJcbiAgfVxyXG59XHJcbmZ1bmN0aW9uIF9fZGlzcGF0Y2hFdmVudF9fIChuYW1lKSB7XHJcbiAgbGV0IGV2ZW50O1xyXG4gIGlmIChkb2N1bWVudC5jcmVhdGVFdmVudCkge1xyXG4gICAgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcclxuICAgIGV2ZW50LmluaXRFdmVudChuYW1lLCB0cnVlLCB0cnVlKTtcclxuICAgIGV2ZW50LmV2ZW50TmFtZSA9IG5hbWU7XHJcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChldmVudCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnRPYmplY3QoKTtcclxuICAgIGV2ZW50LmV2ZW50VHlwZSA9IG5hbWU7XHJcbiAgICBldmVudC5ldmVudE5hbWUgPSBuYW1lO1xyXG4gICAgd2luZG93LmZpcmVFdmVudCgnb24nICsgZXZlbnQuZXZlbnRUeXBlLCBldmVudCk7XHJcbiAgfVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBfX2hhbmRsZVJlZnJlc2hUb2tlbl9fIChlcnJvcikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlciB8fCAhdXNlci5kZXRhaWxzLnJlZnJlc2hfdG9rZW4pIHtcclxuICAgICAgcmVqZWN0KF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdObyBjYWNoZWQgdXNlciBvciByZWZyZXNoVG9rZW4gZm91bmQuIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgIHVzZXJuYW1lOiB1c2VyLmRldGFpbHMudXNlcm5hbWUsXHJcbiAgICAgICAgcmVmcmVzaFRva2VuOiB1c2VyLmRldGFpbHMucmVmcmVzaF90b2tlbixcclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH0pXHJcbn07XHJcbmV4cG9ydCBmdW5jdGlvbiB1c2VBbm9ueW1vdXNBdXRoIChzY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRldGFpbHMgPSB7XHJcbiAgICAgIFwiYWNjZXNzX3Rva2VuXCI6IGRlZmF1bHRzLmFub255bW91c1Rva2VuLFxyXG4gICAgICBcInRva2VuX3R5cGVcIjogXCJBbm9ueW1vdXNUb2tlblwiLFxyXG4gICAgICBcImV4cGlyZXNfaW5cIjogMCxcclxuICAgICAgXCJhcHBOYW1lXCI6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgIFwidXNlcm5hbWVcIjogXCJhbm9ueW1vdXNcIixcclxuICAgICAgXCJyb2xlXCI6IFwiVXNlclwiLFxyXG4gICAgICBcImZpcnN0TmFtZVwiOiBcImFub255bW91c1wiLFxyXG4gICAgICBcImxhc3ROYW1lXCI6IFwiYW5vbnltb3VzXCIsXHJcbiAgICAgIFwiZnVsbE5hbWVcIjogXCJhbm9ueW1vdXMgYW5vbnltb3VzXCIsXHJcbiAgICAgIFwicmVnSWRcIjogMCAsXHJcbiAgICAgIFwidXNlcklkXCI6IG51bGxcclxuICAgIH1cclxuICAgIHRoaXMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgQW5vbnltb3VzVG9rZW46IGRlZmF1bHRzLmFub255bW91c1Rva2VuXHJcbiAgICAgIH0sXHJcbiAgICAgIGRldGFpbHMsXHJcbiAgICB9KTtcclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICB0aGlzLnNvY2tldC5jb25uZWN0KG51bGwsIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgIH1cclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICAgIHJlc29sdmUoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2lnbmluICh1c2VybmFtZSwgcGFzc3dvcmQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYHVzZXJuYW1lPSR7dXNlcm5hbWV9JnBhc3N3b3JkPSR7cGFzc3dvcmR9JmFwcE5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSZncmFudF90eXBlPXBhc3N3b3JkYFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzaWdudXAgKGVtYWlsLCBwYXNzd29yZCwgY29uZmlybVBhc3N3b3JkLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc2lnbnVwLFxyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdTaWduVXBUb2tlbic6IGRlZmF1bHRzLnNpZ25VcFRva2VuXHJcbiAgICAgIH0sXHJcbiAgICAgIGRhdGE6IHtcclxuICAgICAgICBmaXJzdE5hbWUsXHJcbiAgICAgICAgbGFzdE5hbWUsXHJcbiAgICAgICAgZW1haWwsXHJcbiAgICAgICAgcGFzc3dvcmQsXHJcbiAgICAgICAgY29uZmlybVBhc3N3b3JkXHJcbiAgICAgIH1cclxuICAgIH0sIHNjYiAsIGVjYilcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05VUCk7XHJcbiAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpZ25pbi5jYWxsKHRoaXMsIHJlc3BvbnNlLmRhdGEudXNlcm5hbWUsIHBhc3N3b3JkKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gX19nZXRTb2NpYWxVcmxfXyAocHJvdmlkZXJOYW1lLCBpc1NpZ251cCwgaXNBdXRvU2lnblVwKSB7XHJcbiAgbGV0IHByb3ZpZGVyID0gU09DSUFMX1BST1ZJREVSU1twcm92aWRlck5hbWVdO1xyXG4gIGxldCBhY3Rpb24gPSBpc1NpZ251cCA/ICd1cCcgOiAnaW4nO1xyXG4gIGxldCBhdXRvU2lnblVwUGFyYW0gPSBgJnNpZ251cElmTm90U2lnbmVkSW49JHsoIWlzU2lnbnVwICYmIGlzQXV0b1NpZ25VcCkgPyAndHJ1ZScgOiAnZmFsc2UnfWA7XHJcbiAgcmV0dXJuIGAvdXNlci9zb2NpYWxTaWduJHthY3Rpb259P3Byb3ZpZGVyPSR7cHJvdmlkZXIubGFiZWx9JHthdXRvU2lnblVwUGFyYW19JnJlc3BvbnNlX3R5cGU9dG9rZW4mY2xpZW50X2lkPXNlbGYmcmVkaXJlY3RfdXJpPSR7cHJvdmlkZXIudXJsfSZzdGF0ZT1gO1xyXG59XHJcbmZ1bmN0aW9uIF9fc29jaWFsQXV0aF9fIChwcm92aWRlciwgaXNTaWduVXAsIHNwZWMsIGVtYWlsKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGlmICghU09DSUFMX1BST1ZJREVSU1twcm92aWRlcl0pIHtcclxuICAgICAgcmVqZWN0KF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdVbmtub3duIFNvY2lhbCBQcm92aWRlcicpKTtcclxuICAgIH1cclxuICAgIGxldCB1cmwgPSAgYCR7ZGVmYXVsdHMuYXBpVXJsfS8xLyR7X19nZXRTb2NpYWxVcmxfXyhwcm92aWRlciwgaXNTaWduVXAsIHRydWUpfSZhcHBuYW1lPSR7ZGVmYXVsdHMuYXBwTmFtZX0ke2VtYWlsID8gJyZlbWFpbD0nK2VtYWlsIDogJyd9JnJldHVybkFkZHJlc3M9YCAvLyAke2xvY2F0aW9uLmhyZWZ9XG4gICAgbGV0IHBvcHVwID0gbnVsbDtcbiAgICBpZiAoIXRoaXMuaXNJRSkge1xuICAgICAgcG9wdXAgPSB3aW5kb3cub3Blbih1cmwsICdzb2NpYWxwb3B1cCcsIHNwZWMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHBvcHVwID0gd2luZG93Lm9wZW4oJycsICcnLCBzcGVjKTtcbiAgICAgIHBvcHVwLmxvY2F0aW9uID0gdXJsO1xuICAgIH1cbiAgICBpZiAocG9wdXAgJiYgcG9wdXAuZm9jdXMpIHsgcG9wdXAuZm9jdXMoKSB9XHJcblxyXG4gICAgbGV0IGhhbmRsZXIgPSBmdW5jdGlvbihlKSB7XHJcbiAgICAgIGxldCB1cmwgPSBlLnR5cGUgPT09ICdtZXNzYWdlJyA/IGUub3JpZ2luIDogZS51cmw7XHJcbiAgICAgIGlmICh1cmwuaW5kZXhPZihsb2NhdGlvbi5ocmVmKSA9PT0gLTEpIHtcclxuICAgICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ1Vua25vd24gT3JpZ2luIE1lc3NhZ2UnKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCByZXMgPSBlLnR5cGUgPT09ICdtZXNzYWdlJyA/IEpTT04ucGFyc2UoZS5kYXRhKSA6IEpTT04ucGFyc2UoZS5uZXdWYWx1ZSk7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKGUudHlwZSwgaGFuZGxlciwgZmFsc2UpO1xyXG4gICAgICBpZiAocG9wdXAgJiYgcG9wdXAuY2xvc2UpIHsgcG9wdXAuY2xvc2UoKSB9XHJcbiAgICAgIGUudHlwZSA9PSAnU3RvcmFnZScgJiYgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oZS5rZXkpO1xyXG5cclxuICAgICAgaWYgKHJlcy5zdGF0dXMgIT0gMjAwKSB7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfVxyXG4gICAgaGFuZGxlciA9IGhhbmRsZXIuYmluZChwb3B1cCk7XHJcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgaGFuZGxlciAsIGZhbHNlKTtcclxuICAgIC8vIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWduaW4gKHByb3ZpZGVyLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fLmNhbGwodGhpcywgcHJvdmlkZXIsIGZhbHNlLCBzcGVjLCAnJylcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHNvY2lhbFNpZ251cCAocHJvdmlkZXIsIGVtYWlsLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fLmNhbGwodGhpcywgcHJvdmlkZXIsIHRydWUsIHNwZWMsIGVtYWlsKVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05VUCk7XHJcbiAgICAgICAgaWYoZGVmYXVsdHMucnVuU2lnbmluQWZ0ZXJTaWdudXApIHtcclxuICAgICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgICAgICBhY2Nlc3NUb2tlbjogcmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW5cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgfSk7XHJcblxyXG59XHJcbmZ1bmN0aW9uIF9fc2lnbmluV2l0aFRva2VuX18gKHRva2VuRGF0YSkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgZGF0YSA9IFtdO1xyXG4gICAgZm9yIChsZXQgb2JqIGluIHRva2VuRGF0YSkge1xyXG4gICAgICAgIGRhdGEucHVzaChlbmNvZGVVUklDb21wb25lbnQob2JqKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudCh0b2tlbkRhdGFbb2JqXSkpO1xyXG4gICAgfVxyXG4gICAgZGF0YSA9IGRhdGEuam9pbihcIiZcIik7XHJcblxyXG4gICAgdGhpcy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnRva2VuLFxyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJ1xyXG4gICAgICB9LFxyXG4gICAgICBkYXRhOiBgJHtkYXRhfSZhcHBOYW1lPSR7ZGVmYXVsdHMuYXBwTmFtZX0mZ3JhbnRfdHlwZT1wYXNzd29yZGBcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlbn1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWxzOiByZXNwb25zZS5kYXRhXHJcbiAgICAgIH0pO1xyXG4gICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICAgIHRoaXMuc29ja2V0LmNvbm5lY3QodGhpcy5zdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24sIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgICAgfVxyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gcmVxdWVzdFJlc2V0UGFzc3dvcmQgKHVzZXJuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBVUkxTLnJlcXVlc3RSZXNldFBhc3N3b3JkLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgYXBwTmFtZTogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgICB1c2VybmFtZVxyXG4gICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiByZXNldFBhc3N3b3JkIChuZXdQYXNzd29yZCwgcmVzZXRUb2tlbiwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXNldFBhc3N3b3JkLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgbmV3UGFzc3dvcmQsXHJcbiAgICAgICAgcmVzZXRUb2tlblxyXG4gICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBjaGFuZ2VQYXNzd29yZCAob2xkUGFzc3dvcmQsIG5ld1Bhc3N3b3JkLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBVUkxTLmNoYW5nZVBhc3N3b3JkLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgb2xkUGFzc3dvcmQsXHJcbiAgICAgICAgbmV3UGFzc3dvcmRcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2lnbm91dCAoc2NiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuc3RvcmFnZS5yZW1vdmUoJ3VzZXInKTtcclxuICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgdGhpcy5zb2NrZXQuZGlzY29ubmVjdCgpO1xyXG4gICAgfVxyXG4gICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05PVVQpO1xyXG4gICAgc2NiICYmIHNjYihfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdGhpcy5zdG9yYWdlLmdldCgndXNlcicpKSk7XHJcbiAgICByZXNvbHZlKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCB0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykpKTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0VXNlckRldGFpbHMoc2NiLCBlY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IHVzZXIgPSB0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJyk7XHJcbiAgICBpZiAoIXVzZXIpIHtcclxuICAgICAgZWNiICYmIGVjYihfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnTm8gY2FjaGVkIHVzZXIgZm91bmQuIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpKTtcclxuICAgICAgcmVqZWN0KF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdObyBjYWNoZWQgdXNlciBmb3VuZC4gYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuJykpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHVzZXIuZGV0YWlscykpO1xyXG4gICAgICByZXNvbHZlKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCB1c2VyLmRldGFpbHMpKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cblxyXG4vLyBnZXQgZGF0YSBmcm9tIHVybCBpbiBzb2NpYWwgc2lnbi1pbiBwb3B1cFxyXG4oKCkgPT4ge1xyXG4gIGxldCBkYXRhTWF0Y2ggPSAvXFw/KGRhdGF8ZXJyb3IpPSguKykvLmV4ZWMobG9jYXRpb24uaHJlZik7XHJcbiAgaWYgKGRhdGFNYXRjaCAmJiBkYXRhTWF0Y2hbMV0gJiYgZGF0YU1hdGNoWzJdKSB7XHJcbiAgICBsZXQgZGF0YSA9IHtcclxuICAgICAgZGF0YTogSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQoZGF0YU1hdGNoWzJdLnJlcGxhY2UoLyMuKi8sICcnKSkpXHJcbiAgICB9XHJcbiAgICBkYXRhLnN0YXR1cyA9IChkYXRhTWF0Y2hbMV0gPT09ICdkYXRhJykgPyAyMDAgOiAwO1xuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdTT0NJQUxfREFUQScsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcbiAgICAvLyB2YXIgaXNJRSA9IGZhbHNlIHx8ICEhZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xuICAgIC8vIGlmICghaXNJRSkge1xuICAgIC8vICAgd2luZG93Lm9wZW5lci5wb3N0TWVzc2FnZShKU09OLnN0cmluZ2lmeShkYXRhKSwgbG9jYXRpb24ub3JpZ2luKTtcbiAgICAvLyB9XG4gIH1cclxufSkoKTtcclxuIiwiaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5mdW5jdGlvbiBfX2FsbG93ZWRQYXJhbXNfXyAoYWxsb3dlZFBhcmFtcywgcGFyYW1zKSB7XHJcbiAgbGV0IG5ld1BhcmFtcyA9IHt9O1xyXG4gIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xyXG4gICAgaWYgKGFsbG93ZWRQYXJhbXMuaW5kZXhPZihwYXJhbSkgIT0gLTEpIHtcclxuICAgICAgbmV3UGFyYW1zW3BhcmFtXSA9IHBhcmFtc1twYXJhbV07XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBuZXdQYXJhbXM7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3QgKG9iamVjdCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncGFnZVNpemUnLCdwYWdlTnVtYmVyJywnZmlsdGVyJywnc29ydCcsJ3NlYXJjaCcsJ2V4Y2x1ZGUnLCdkZWVwJywncmVsYXRlZE9iamVjdHMnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlIChvYmplY3QsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRPbmUgKG9iamVjdCwgaWQsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ2RlZXAnLCdleGNsdWRlJywnbGV2ZWwnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlIChvYmplY3QsIGlkLCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICBjb25zdCBhbGxvd2VkUGFyYW1zID0gWydyZXR1cm5PYmplY3QnLCdkZWVwJ107XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgaWQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ0RFTEVURScsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIgKG9iamVjdCwgZmlsZUFjdGlvbiwgZGF0YSA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbiIsImltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkRmlsZSAob2JqZWN0LCBmaWxlQWN0aW9uLCBmaWxlbmFtZSwgZmlsZWRhdGEsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHtmaWxlQWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgICBmaWxlZGF0YTogZmlsZWRhdGEuc3Vic3RyKGZpbGVkYXRhLmluZGV4T2YoJywnKSArIDEsIGZpbGVkYXRhLmxlbmd0aClcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVGaWxlIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcblxyXG5jbGFzcyBIdHRwIHtcclxuICBjb25zdHJ1Y3RvciAoY29uZmlnID0ge30pIHtcclxuICAgIGlmICghd2luZG93LlhNTEh0dHBSZXF1ZXN0KVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1hNTEh0dHBSZXF1ZXN0IGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGJyb3dzZXInKTtcclxuXHJcbiAgICB0aGlzLmNvbmZpZyA9IE9iamVjdC5hc3NpZ24oe1xyXG4gICAgICAvLyB1cmw6ICcvJyxcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgaGVhZGVyczoge30sXHJcbiAgICAgIHBhcmFtczoge30sXHJcbiAgICAgIGludGVyY2VwdG9yczoge30sXHJcbiAgICAgIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXHJcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2pzb24nLFxyXG4gICAgICAvLyB0aW1lb3V0OiBudWxsLFxyXG4gICAgICBhdXRoOiB7XHJcbiAgICAgICB1c2VybmFtZTogbnVsbCxcclxuICAgICAgIHBhc3N3b3JkOiBudWxsXHJcbiAgICAgIH1cclxuICAgIH0sIGNvbmZpZylcclxuICB9XHJcbiAgX2dldEhlYWRlcnMgKGhlYWRlcnMpIHtcclxuICAgIHJldHVybiBoZWFkZXJzLnNwbGl0KCdcXHJcXG4nKS5maWx0ZXIoaGVhZGVyID0+IGhlYWRlcikubWFwKGhlYWRlciA9PiB7XHJcbiAgICAgIGxldCBqaGVhZGVyID0ge31cclxuICAgICAgbGV0IHBhcnRzID0gaGVhZGVyLnNwbGl0KCc6Jyk7XHJcbiAgICAgIGpoZWFkZXJbcGFydHNbMF1dID0gcGFydHNbMV1cclxuICAgICAgcmV0dXJuIGpoZWFkZXI7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgX2dldERhdGEgKHR5cGUsIGRhdGEpIHtcclxuICAgIGlmICghdHlwZSkge1xyXG4gICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHR5cGUuaW5kZXhPZignanNvbicpID09PSAtMSkge1xyXG4gICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICByZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcclxuICAgIH1cclxuICB9XHJcbiAgX2NyZWF0ZVJlc3BvbnNlIChyZXEsIGNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiByZXEuc3RhdHVzLFxyXG4gICAgICBzdGF0dXNUZXh0OiByZXEuc3RhdHVzVGV4dCxcclxuICAgICAgaGVhZGVyczogdGhpcy5fZ2V0SGVhZGVycyhyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpLFxyXG4gICAgICBjb25maWcsXHJcbiAgICAgIGRhdGE6IHRoaXMuX2dldERhdGEocmVxLmdldFJlc3BvbnNlSGVhZGVyKFwiQ29udGVudC1UeXBlXCIpLCByZXEucmVzcG9uc2VUZXh0KSxcclxuICAgIH1cclxuICB9XHJcbiAgX2hhbmRsZUVycm9yIChkYXRhLCBjb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1czogMCxcclxuICAgICAgc3RhdHVzVGV4dDogJ0VSUk9SJyxcclxuICAgICAgaGVhZGVyczogW10sXHJcbiAgICAgIGNvbmZpZyxcclxuICAgICAgZGF0YSxcclxuICAgIH1cclxuICB9XHJcbiAgX2VuY29kZVBhcmFtcyAocGFyYW1zKSB7XHJcbiAgICBsZXQgcGFyYW1zQXJyID0gW107XHJcbiAgICBmb3IgKGxldCBwYXJhbSBpbiBwYXJhbXMpIHtcclxuICAgICAgcGFyYW1zQXJyLnB1c2goYCR7cGFyYW19PSR7ZW5jb2RlVVJJKEpTT04uc3RyaW5naWZ5KHBhcmFtc1twYXJhbV0pKX1gKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBhcmFtc0Fyci5qb2luKCcmJyk7XHJcbiAgfVxyXG4gIF9zZXRIZWFkZXJzIChyZXEsIGhlYWRlcnMpIHtcclxuICAgIGZvciAobGV0IGhlYWRlciBpbiBoZWFkZXJzKSB7XHJcbiAgICAgIHJlcS5zZXRSZXF1ZXN0SGVhZGVyKGhlYWRlciwgaGVhZGVyc1toZWFkZXJdKTtcclxuICAgIH1cclxuICB9XHJcbiAgX3NldERhdGEgKHJlcSwgZGF0YSkge1xyXG4gICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgIHJlcS5zZW5kKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh0eXBlb2YgZGF0YSAhPSAnb2JqZWN0Jykge1xyXG4gICAgICByZXEuc2VuZChkYXRhKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICByZXEuc2V0UmVxdWVzdEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb247Y2hhcnNldD1VVEYtOFwiKTtcclxuICAgICAgcmVxLnNlbmQoSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXF1ZXN0IChjZmcsIHNjYiAsIGVjYikge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHJcbiAgICAgIGxldCByZXEgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgICAgbGV0IGNvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuY29uZmlnLCBjZmcpO1xyXG5cclxuICAgICAgaWYgKCFjb25maWcudXJsIHx8IHR5cGVvZiBjb25maWcudXJsICE9PSAnc3RyaW5nJyB8fCBjb25maWcudXJsLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcigndXJsIHBhcmFtZXRlciBpcyBtaXNzaW5nJywgY29uZmlnKTtcclxuICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGNvbmZpZy53aXRoQ3JlZGVudGlhbHMpIHsgcmVxLndpdGhDcmVkZW50aWFscyA9IHRydWUgfVxyXG4gICAgICBpZiAoY29uZmlnLnRpbWVvdXQpIHsgcmVxLnRpbWVvdXQgPSB0cnVlIH1cclxuICAgICAgY29uZmlnLmludGVyY2VwdG9ycy5yZXF1ZXN0ICYmIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVxdWVzdC5jYWxsKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgIGxldCBwYXJhbXMgPSB0aGlzLl9lbmNvZGVQYXJhbXMoY29uZmlnLnBhcmFtcyk7XHJcbiAgICAgIHJlcS5vcGVuKGNvbmZpZy5tZXRob2QsIGAke2NvbmZpZy5iYXNlVVJMID8gY29uZmlnLmJhc2VVUkwrJy8nIDogJyd9JHtjb25maWcudXJsfSR7cGFyYW1zID8gJz8nK3BhcmFtcyA6ICcnfWAsIHRydWUsIGNvbmZpZy5hdXRoLnVzZXJuYW1lLCBjb25maWcuYXV0aC5wYXNzd29yZCk7XHJcbiAgICAgIHJlcS5vbnRpbWVvdXQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBsZXQgcmVzID0gdGhpcy5faGFuZGxlRXJyb3IoJ3RpbWVvdXQnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfTtcclxuICAgICAgcmVxLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBsZXQgcmVzID0gdGhpcy5faGFuZGxlRXJyb3IoJ2Fib3J0JywgY29uZmlnKTtcclxuICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH07XHJcbiAgICAgIHJlcS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSAoKSA9PiB7XHJcbiAgICAgICAgaWYgKHJlcS5yZWFkeVN0YXRlID09IFhNTEh0dHBSZXF1ZXN0LkRPTkUpIHtcclxuICAgICAgICAgIGxldCByZXMgPSB0aGlzLl9jcmVhdGVSZXNwb25zZShyZXEsIGNvbmZpZyk7XHJcbiAgICAgICAgICBpZiAocmVzLnN0YXR1cyA9PT0gMjAwKXtcclxuICAgICAgICAgICAgaWYgKGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlLmNhbGwodGhpcywgcmVzLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZUVycm9yKSB7XHJcbiAgICAgICAgICAgICAgY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZUVycm9yLmNhbGwodGhpcywgcmVzLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICB0aGlzLl9zZXRIZWFkZXJzKHJlcSwgY29uZmlnLmhlYWRlcnMpO1xyXG4gICAgICB0aGlzLl9zZXREYXRhKHJlcSwgY29uZmlnLmRhdGEpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxufVxyXG5mdW5jdGlvbiBjcmVhdGVJbnN0YW5jZShjb25maWcgPSB7fSkge1xyXG4gIHZhciBjb250ZXh0ID0gbmV3IEh0dHAoY29uZmlnKTtcclxuICB2YXIgaW5zdGFuY2UgPSAoLi4uYXJncykgPT4gSHR0cC5wcm90b3R5cGUucmVxdWVzdC5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuICBpbnN0YW5jZS5jb25maWcgPSBjb250ZXh0LmNvbmZpZztcclxuICByZXR1cm4gaW5zdGFuY2U7XHJcbn1cclxuXHJcbnZhciBodHRwID0gd2luZG93Lmh0dHAgfHwgY3JlYXRlSW5zdGFuY2UoKTtcclxuaHR0cC5jcmVhdGUgPSAoY29uZmlnKSA9PiB7XHJcbiAgcmV0dXJuIGNyZWF0ZUluc3RhbmNlKGNvbmZpZyk7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBodHRwO1xyXG53aW5kb3cuaHR0cCA9IGh0dHA7XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNvY2tldCB7XHJcbiAgY29uc3RydWN0b3IgKHVybCkge1xyXG4gICAgaWYgKCF3aW5kb3cuaW8pXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcigncnVuU29ja2V0IGlzIHRydWUgYnV0IHNvY2tldGlvLWNsaWVudCBpcyBub3QgaW5jbHVkZWQnKTtcclxuICAgIHRoaXMudXJsID0gdXJsO1xuICAgIHRoaXMub25BcnIgPSBbXTtcbiAgICB0aGlzLnNvY2tldCA9IG51bGw7XG4gIH1cclxuICBvbiAoZXZlbnROYW1lLCBjYWxsYmFjaykge1xyXG4gICAgdGhpcy5vbkFyci5wdXNoKHtldmVudE5hbWUsIGNhbGxiYWNrfSk7XHJcbiAgfVxyXG4gIGNvbm5lY3QgKHRva2VuLCBhbm9ueW1vdXNUb2tlbiwgYXBwTmFtZSkge1xyXG4gICAgdGhpcy5kaXNjb25uZWN0KCk7XHJcbiAgICB0aGlzLnNvY2tldCA9IGlvLmNvbm5lY3QodGhpcy51cmwsIHsnZm9yY2VOZXcnOnRydWUgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ2Nvbm5lY3QnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUuaW5mbyhgdHJ5aW5nIHRvIGVzdGFibGlzaCBhIHNvY2tldCBjb25uZWN0aW9uIHRvICR7YXBwTmFtZX0gLi4uYCk7XHJcbiAgICAgIHRoaXMuc29ja2V0LmVtaXQoXCJsb2dpblwiLCB0b2tlbiwgYW5vbnltb3VzVG9rZW4sIGFwcE5hbWUpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ2F1dGhvcml6ZWQnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUuaW5mbyhgc29ja2V0IGNvbm5lY3RlZGApO1xyXG4gICAgICB0aGlzLm9uQXJyLmZvckVhY2goZm4gPT4ge1xyXG4gICAgICAgIHRoaXMuc29ja2V0Lm9uKGZuLmV2ZW50TmFtZSwgZGF0YSA9PiB7XHJcbiAgICAgICAgICBmbi5jYWxsYmFjayhkYXRhKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignbm90QXV0aG9yaXplZCcsICgpID0+IHtcclxuICAgICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmRpc2Nvbm5lY3QoKSwgMTAwMCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgZGlzY29ubmVjdGApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ3JlY29ubmVjdGluZycsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgcmVjb25uZWN0aW5nYCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcclxuICAgICAgY29uc29sZS53YXJuKGBlcnJvcjogJHtlcnJvcn1gKTtcclxuICAgIH0pO1xyXG4gIH1cclxuICBkaXNjb25uZWN0ICgpIHtcclxuICAgIGlmICh0aGlzLnNvY2tldCkge1xyXG4gICAgICB0aGlzLnNvY2tldC5jbG9zZSgpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTdG9yYWdlIHtcclxuICBjb25zdHJ1Y3RvciAodHlwZSwgcHJlZml4ID0gJycpIHtcclxuICAgIGlmICghd2luZG93W3R5cGUgKyAnU3RvcmFnZSddKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IodHlwZSArICdTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIGJyb3dzZXInKTtcclxuICAgIHRoaXMucHJlZml4ID0gcHJlZml4O1xyXG4gICAgdGhpcy5kZWxpbWl0ZXIgPSAnX19fX19fX19fXyc7XHJcbiAgICB0aGlzLnN0b3JhZ2UgPSB3aW5kb3dbdHlwZSArICdTdG9yYWdlJ107XHJcbiAgfVxyXG4gIGdldCAoa2V5KSB7XHJcbiAgICBsZXQgaXRlbSA9IHRoaXMuc3RvcmFnZS5nZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWApO1xyXG4gICAgaWYgKCFpdGVtKSB7XHJcbiAgICAgIHJldHVybiBpdGVtXHJcbiAgICB9XHJcbiAgICBlbHNlIHtcbiAgICAgIGxldCBbdHlwZSwgdmFsXSA9IGl0ZW0uc3BsaXQodGhpcy5kZWxpbWl0ZXIpO1xuICAgICAgaWYgKHR5cGUgIT0gJ0pTT04nKSB7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UodmFsKTtcbiAgICAgIH1cbiAgICB9XHJcbiAgfVxyXG4gIHNldCAoa2V5LCB2YWwpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsICE9ICdvYmplY3QnKSB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWAsIGBTVFJJTkcke3RoaXMuZGVsaW1pdGVyfSR7dmFsfWApO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWAsIGBKU09OJHt0aGlzLmRlbGltaXRlcn0ke0pTT04uc3RyaW5naWZ5KHZhbCl9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJlbW92ZSAoa2V5KSB7XHJcbiAgICB0aGlzLnN0b3JhZ2UucmVtb3ZlSXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICB9XHJcbiAgY2xlYXIoKSB7XHJcbiAgICBmb3IodmFyIGkgPTA7IGkgPCB0aGlzLnN0b3JhZ2UubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgaWYodGhpcy5zdG9yYWdlLmdldEl0ZW0odGhpcy5zdG9yYWdlLmtleShpKSkuaW5kZXhPZih0aGlzLnByZWZpeCkgIT0gLTEpXHJcbiAgICAgICAgdGhpcy5yZW1vdmUodGhpcy5zdG9yYWdlLmtleShpKSlcclxuICAgIH1cclxuICB9XHJcbn1cclxuIl19
