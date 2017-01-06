(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.backand = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
  // socialLoginWithCode: '1/user/PROVIDER/code',
  socialSigninWithToken: '1/user/PROVIDER/token',
  // socialSingupWithCode: '1/user/PROVIDER/signupCode',
  signout: '1/user/signout',
  profile: 'api/account/profile',
  objects: '1/objects',
  objectsAction: '1/objects/action',
  query: '1/query/data'
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
  storage: window.localStorage,
  storagePrefix: 'BACKAND_',
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

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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

var StorageAbstract = exports.StorageAbstract = function () {
  function StorageAbstract() {
    _classCallCheck(this, StorageAbstract);

    if (this.constructor === StorageAbstract) {
      throw new TypeError("Can not construct abstract class.");
    }
    if (this.setItem === undefined || this.setItem === StorageAbstract.prototype.setItem) {
      throw new TypeError("Must override setItem method.");
    }
    if (this.getItem === undefined || this.getItem === StorageAbstract.prototype.getItem) {
      throw new TypeError("Must override getItem method.");
    }
    if (this.removeItem === undefined || this.removeItem === StorageAbstract.prototype.removeItem) {
      throw new TypeError("Must override removeItem method.");
    }
    if (this.clear === undefined || this.clear === StorageAbstract.prototype.clear) {
      throw new TypeError("Must override clear method.");
    }
    // this.data = {};
  }

  _createClass(StorageAbstract, [{
    key: "setItem",
    value: function setItem(id, val) {
      throw new TypeError("Do not call abstract method setItem from child.");
      // return this.data[id] = String(val);
    }
  }, {
    key: "getItem",
    value: function getItem(id) {
      throw new TypeError("Do not call abstract method getItem from child.");
      // return this.data.hasOwnProperty(id) ? this._data[id] : null;
    }
  }, {
    key: "removeItem",
    value: function removeItem(id) {
      throw new TypeError("Do not call abstract method removeItem from child.");
      // delete this.data[id];
      // return null;
    }
  }, {
    key: "clear",
    value: function clear() {
      throw new TypeError("Do not call abstract method clear from child.");
      // return this.data = {};
    }
  }]);

  return StorageAbstract;
}();

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

var _auth2 = _interopRequireDefault(_auth);

var _object = require('./services/object');

var _object2 = _interopRequireDefault(_object);

var _file = require('./services/file');

var _file2 = _interopRequireDefault(_file);

var _query = require('./services/query');

var _query2 = _interopRequireDefault(_query);

var _user = require('./services/user');

var _user2 = _interopRequireDefault(_user);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// get data from url in social sign-in popup
// let dataMatch = /\?(data|error)=(.+)/.exec(window.location.href);
var dataMatch = /(data|error)=(.+)/.exec(window.location.href);
if (dataMatch && dataMatch[1] && dataMatch[2]) {
  var data = {
    data: JSON.parse(decodeURIComponent(dataMatch[2].replace(/#.*/, '')))
  };
  data.status = dataMatch[1] === 'data' ? 200 : 0;
  var isIE = false || !!document.documentMode;
  if (!isIE) {
    window.opener.postMessage(JSON.stringify(data), location.origin);
  } else {
    localStorage.setItem('SOCIAL_DATA', JSON.stringify(data));
  }
}

var backand = {
  constants: constants,
  helpers: helpers
};
backand.init = function () {
  var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


  // combine defaults with user config
  _extends(_defaults2.default, config);
  // console.log(defaults);

  // verify new defaults
  if (!_defaults2.default.appName) throw new Error('appName is missing');
  if (!_defaults2.default.anonymousToken) throw new Error('anonymousToken is missing');
  if (!_defaults2.default.signUpToken) throw new Error('signUpToken is missing');

  // init utils
  var utils = {
    storage: new _storage2.default(_defaults2.default.storage, _defaults2.default.storagePrefix),
    http: _http2.default.create({
      baseURL: _defaults2.default.apiUrl
    }),
    isIE: window.document && (false || !!document.documentMode),
    ENV: 'browser'
  };
  if (_defaults2.default.runSocket) {
    utils['socket'] = new _socket2.default(_defaults2.default.socketUrl);
  }

  utils.http.config.interceptors = {
    request: function request(config) {
      if (config.url.indexOf(constants.URLS.token) === -1 && backand.utils.storage.get('user')) {
        config.headers = _extends({}, config.headers, backand.utils.storage.get('user').token);
      }
    },
    responseError: function responseError(error, config, resolve, reject, scb, ecb) {
      if (config.url.indexOf(constants.URLS.token) === -1 && _defaults2.default.manageRefreshToken && error.status === 401 && error.data && error.data.Message === 'invalid or expired token') {
        _auth2.default.__handleRefreshToken__.call(utils, error).then(function (response) {
          backand.utils.http.request(config, scb, ecb);
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
  delete backand.init;
  _extends(backand, _auth2.default, {
    object: _object2.default,
    file: _file2.default,
    query: _query2.default,
    user: _user2.default,
    utils: utils,
    defaults: _defaults2.default
  });
  if (_defaults2.default.runSocket) {
    backand.utils.storage.get('user') && backand.utils.socket.connect(backand.utils.storage.get('user').token.Authorization || null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    _extends(backand, { on: backand.utils.socket.on.bind(backand.utils.socket) });
  }
};

module.exports = backand;

},{"./constants":3,"./defaults":4,"./helpers":5,"./services/auth":7,"./services/file":8,"./services/object":9,"./services/query":10,"./services/user":11,"./utils/http":12,"./utils/socket":13,"./utils/storage":14}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _es6Promise = require('es6-promise');

var _constants = require('./../constants');

var _defaults = require('./../defaults');

var _defaults2 = _interopRequireDefault(_defaults);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = {
  __handleRefreshToken__: __handleRefreshToken__,
  useAnonymousAuth: useAnonymousAuth,
  signin: signin,
  signup: signup,
  socialSignin: socialSignin,
  socialSigninWithToken: socialSigninWithToken,
  socialSignup: socialSignup,
  requestResetPassword: requestResetPassword,
  resetPassword: resetPassword,
  changePassword: changePassword,
  signout: signout,
  // getUserDetails,
  getSocialProviders: getSocialProviders
};


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
  if (_defaults2.default.isMobile) return;
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
  return new _es6Promise.Promise(function (resolve, reject) {
    var user = backand.utils.storage.get('user');
    if (!user || !user.details.refresh_token) {
      reject(__generateFakeResponse__(0, '', [], 'No cached user or refreshToken found. authentication is required.'));
    } else {
      __signinWithToken__({
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
  return new _es6Promise.Promise(function (resolve, reject) {
    var details = {
      "access_token": _defaults2.default.anonymousToken,
      "token_type": "AnonymousToken",
      "expires_in": 0,
      "appName": _defaults2.default.appName,
      "username": "Guest",
      "role": "User",
      "firstName": "anonymous",
      "lastName": "anonymous",
      "fullName": "",
      "regId": 0,
      "userId": null
    };
    backand.utils.storage.set('user', {
      token: {
        AnonymousToken: _defaults2.default.anonymousToken
      },
      details: details
    });
    __dispatchEvent__(_constants.EVENTS.SIGNIN);
    if (_defaults2.default.runSocket) {
      backand.utils.socket.connect(null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    }
    scb && scb(__generateFakeResponse__(200, 'OK', [], details));
    resolve(__generateFakeResponse__(200, 'OK', [], details));
  });
}
function signin(username, password, scb, ecb) {
  return new _es6Promise.Promise(function (resolve, reject) {
    backand.utils.http({
      url: _constants.URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: 'username=' + username + '&password=' + password + '&appName=' + _defaults2.default.appName + '&grant_type=password'
    }).then(function (response) {
      backand.utils.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        backand.utils.socket.connect(backand.utils.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      scb && scb(response);
      resolve(response);
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
}
function signup(email, password, confirmPassword, firstName, lastName) {
  var parameters = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : {};
  var scb = arguments[6];
  var ecb = arguments[7];

  return new _es6Promise.Promise(function (resolve, reject) {
    backand.utils.http({
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
        confirmPassword: confirmPassword,
        parameters: parameters
      }
    }, scb, ecb).then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      if (_defaults2.default.runSigninAfterSignup) {
        return signin(response.data.username, password);
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
  return new _es6Promise.Promise(function (resolve, reject) {
    if (!_constants.SOCIAL_PROVIDERS[provider]) {
      reject(__generateFakeResponse__(0, '', [], 'Unknown Social Provider'));
    }
    var url = _defaults2.default.apiUrl + '/1/' + __getSocialUrl__(provider, isSignUp, true) + '&appname=' + _defaults2.default.appName + (email ? '&email=' + email : '') + '&returnAddress='; // ${location.href}
    var popup = null;
    if (!backand.utils.isIE) {
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
      // ie-location-origin-polyfill
      if (!window.location.origin) {
        window.location.origin = window.location.protocol + "//" + window.location.hostname + (window.location.port ? ':' + window.location.port : '');
      }
      if (url.indexOf(window.location.origin) === -1) {
        reject(__generateFakeResponse__(0, '', [], 'Unknown Origin Message'));
      }

      var res = e.type === 'message' ? JSON.parse(e.data) : JSON.parse(e.newValue);
      window.removeEventListener('message', _handler, false);
      window.removeEventListener('storage', _handler, false);
      if (popup && popup.close) {
        popup.close();
      }
      e.type === 'storage' && localStorage.removeItem(e.key);

      if (res.status != 200) {
        reject(res);
      } else {
        resolve(res);
      }
    };
    _handler = _handler.bind(popup);

    window.addEventListener('message', _handler, false);
    window.addEventListener('storage', _handler, false);
  });
}
function socialSignin(provider, scb, ecb) {
  var spec = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'left=1, top=1, width=500, height=560';

  return new _es6Promise.Promise(function (resolve, reject) {
    __socialAuth__(provider, false, spec, '').then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      return __signinWithToken__({
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
function socialSigninWithToken(provider, token, scb, ecb) {
  return new _es6Promise.Promise(function (resolve, reject) {
    backand.utils.http({
      url: _constants.URLS.socialSigninWithToken.replace('PROVIDER', provider),
      method: 'GET',
      params: {
        accessToken: token,
        appName: _defaults2.default.appName,
        signupIfNotSignedIn: true
      }
    }).then(function (response) {
      backand.utils.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        backand.utils.socket.connect(backand.utils.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      // TODO:PATCH
      backand.utils.http({
        url: _constants.URLS.objects + '/users',
        method: 'GET',
        params: {
          filter: [{
            "fieldName": "email",
            "operator": "equals",
            "value": response.data.username
          }]
        }
      }).then(function (patch) {
        var _patch$data$data$ = patch.data.data[0],
            id = _patch$data$data$.id,
            firstName = _patch$data$data$.firstName,
            lastName = _patch$data$data$.lastName;

        var user = backand.utils.storage.get('user');
        var newDetails = { userId: id.toString(), firstName: firstName, lastName: lastName };
        backand.utils.storage.set('user', {
          token: user.token,
          details: _extends({}, user.details, newDetails)
        });
        user = backand.utils.storage.get('user');
        var res = __generateFakeResponse__(response.status, response.statusText, response.headers, user.details);
        scb && scb(res);
        resolve(res);
      }).catch(function (error) {
        ecb && ecb(error);
        reject(error);
      });
      // EOP
    }).catch(function (error) {
      ecb && ecb(error);
      reject(error);
    });
  });
};
function socialSignup(provider, email, scb, ecb) {
  var spec = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'left=1, top=1, width=500, height=560';

  return new _es6Promise.Promise(function (resolve, reject) {
    __socialAuth__(provider, true, spec, email).then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      if (_defaults2.default.runSigninAfterSignup) {
        return __signinWithToken__({
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
  return new _es6Promise.Promise(function (resolve, reject) {
    var data = [];
    for (var obj in tokenData) {
      data.push(encodeURIComponent(obj) + '=' + encodeURIComponent(tokenData[obj]));
    }
    data = data.join("&");

    backand.utils.http({
      url: _constants.URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data + '&appName=' + _defaults2.default.appName + '&grant_type=password'
    }).then(function (response) {
      backand.utils.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        backand.utils.socket.connect(backand.utils.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      resolve(response);
    }).catch(function (error) {
      console.log(error);
      reject(error);
    });
  });
}
function requestResetPassword(username, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.requestResetPassword,
    method: 'POST',
    data: {
      appName: _defaults2.default.appName,
      username: username
    }
  }, scb, ecb);
}
function resetPassword(newPassword, resetToken, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.resetPassword,
    method: 'POST',
    data: {
      newPassword: newPassword,
      resetToken: resetToken
    }
  }, scb, ecb);
}
function changePassword(oldPassword, newPassword, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.changePassword,
    method: 'POST',
    data: {
      oldPassword: oldPassword,
      newPassword: newPassword
    }
  }, scb, ecb);
}
function signout(scb) {
  return new _es6Promise.Promise(function (resolve, reject) {
    backand.utils.http({
      url: _constants.URLS.signout,
      method: 'GET'
    });
    backand.utils.storage.remove('user');
    if (_defaults2.default.runSocket) {
      backand.utils.socket.disconnect();
    }
    __dispatchEvent__(_constants.EVENTS.SIGNOUT);
    scb && scb(__generateFakeResponse__(200, 'OK', [], backand.utils.storage.get('user')));
    resolve(__generateFakeResponse__(200, 'OK', [], backand.utils.storage.get('user')));
  });
}
function getSocialProviders(scb) {
  return new _es6Promise.Promise(function (resolve, reject) {
    scb && scb(_constants.SOCIAL_PROVIDERS);
    resolve(_constants.SOCIAL_PROVIDERS);
  });
}

},{"./../constants":3,"./../defaults":4,"es6-promise":1}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _constants = require('./../constants');

exports.default = {
  upload: upload,
  remove: remove
};


function upload(object, fileAction, filename, filedata, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + fileAction,
    method: 'POST',
    data: {
      filename: filename,
      filedata: filedata.substr(filedata.indexOf(',') + 1, filedata.length)
    }
  }, scb, ecb);
}
function remove(object, fileAction, filename, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + fileAction,
    method: 'DELETE',
    data: {
      filename: filename
    }
  }, scb, ecb);
}

},{"./../constants":3}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _constants = require('./../constants');

exports.default = {
  getList: getList,
  create: create,
  getOne: getOne,
  update: update,
  remove: remove,
  action: {
    get: get,
    post: post
  }
};


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
  return backand.utils.http({
    url: _constants.URLS.objects + '/' + object,
    method: 'GET',
    params: __allowedParams__(allowedParams, params)
  }, null, ecb).then(function (response) {
    var totalRows = response.data['totalRows'];
    response.data = response.data['data'];
    scb && scb(response, totalRows);
    return response;
  });
}
function create(object, data) {
  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  var allowedParams = ['returnObject', 'deep'];
  return backand.utils.http({
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
  return backand.utils.http({
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
  return backand.utils.http({
    url: _constants.URLS.objects + '/' + object + '/' + id,
    method: 'PUT',
    data: data,
    params: __allowedParams__(allowedParams, params)
  }, scb, ecb);
}
function remove(object, id, scb, ecb) {
  return backand.utils.http({
    url: _constants.URLS.objects + '/' + object + '/' + id,
    method: 'DELETE'
  }, scb, ecb);
}

function get(object, action) {
  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  return backand.utils.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + action,
    method: 'GET',
    params: params
  }, scb, ecb);
}
function post(object, action, data) {
  var params = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
  var scb = arguments[4];
  var ecb = arguments[5];

  return backand.utils.http({
    url: _constants.URLS.objectsAction + '/' + object + '?name=' + action,
    method: 'POST',
    data: data,
    params: params
  }, scb, ecb);
}

},{"./../constants":3}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _constants = require('./../constants');

exports.default = {
  get: get,
  post: post
};


function get(name) {
  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var scb = arguments[2];
  var ecb = arguments[3];

  return backand.utils.http({
    url: _constants.URLS.query + '/' + name,
    method: 'GET',
    params: params
  }, scb, ecb);
}
function post(name, data) {
  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var scb = arguments[3];
  var ecb = arguments[4];

  return backand.utils.http({
    url: _constants.URLS.query + '/' + name,
    method: 'POST',
    data: data,
    params: params
  }, scb, ecb);
}

},{"./../constants":3}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _es6Promise = require('es6-promise');

var _constants = require('./../constants');

exports.default = {
  getUserDetails: getUserDetails,
  getUsername: getUsername,
  getUserRole: getUserRole,
  getToken: getToken,
  getRefreshToken: getRefreshToken
};


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
function __getUserDetailsFromStorage__(scb, ecb) {
  return new _es6Promise.Promise(function (resolve, reject) {
    var user = backand.utils.storage.get('user');
    if (!user) {
      ecb && ecb(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
      reject(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
    } else {
      scb && scb(__generateFakeResponse__(200, 'OK', [], user.details));
      resolve(__generateFakeResponse__(200, 'OK', [], user.details));
    }
  });
}
function getUserDetails(scb, ecb) {
  var force = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  if (!force) {
    return __getUserDetailsFromStorage__(scb, ecb);
  } else {
    return backand.utils.http({
      url: _constants.URLS.profile,
      method: 'GET'
    }).then(function (response) {
      var user = backand.utils.storage.get('user');
      var newDetails = response.data;
      backand.utils.storage.set('user', {
        token: user.token,
        details: _extends({}, user.details, newDetails)
      });
      return __getUserDetailsFromStorage__(scb, ecb);
    });
  }
}
function getUsername(scb, ecb) {
  return __getUserDetailsFromStorage__(null, ecb).then(function (response) {
    response.data = response.data['username'];
    scb && scb(response);
    return response;
  });
}
function getUserRole() {
  return __getUserDetailsFromStorage__(null, ecb).then(function (response) {
    response.data = response.data['role'];
    scb && scb(response);
    return response;
  });
}
function getToken() {
  return __getUserDetailsFromStorage__(null, ecb).then(function (response) {
    response.data = response.data['access_token'];
    scb && scb(response);
    return response;
  });
}
function getRefreshToken() {
  return __getUserDetailsFromStorage__(null, ecb).then(function (response) {
    response.data = response.data['refresh_token'];
    scb && scb(response);
    return response;
  });
}

},{"./../constants":3,"es6-promise":1}],12:[function(require,module,exports){
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

    if (!window.XMLHttpRequest) throw new Error('XMLHttpRequest is not supported by this platform');

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
        var val = params[param];
        if ((typeof val === 'undefined' ? 'undefined' : _typeof(val)) === 'object') {
          val = JSON.stringify(val);
        }
        paramsArr.push(param + '=' + encodeURIComponent(val));
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

var http = createInstance();
http.create = function (config) {
  return createInstance(config);
};

exports.default = http;

},{"es6-promise":1}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Storage = function () {
  function Storage(storage) {
    var prefix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

    _classCallCheck(this, Storage);

    if (!storage) throw new Error('The provided Storage is not supported by this platform');
    if (!storage.setItem || !storage.getItem || !storage.removeItem || !storage.clear) throw new Error('The provided Storage not implement the necessary functions');
    this.storage = storage;
    this.prefix = prefix;
    this.delimiter = '__________';
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

},{}]},{},[6])(6)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGZpbGUuanMiLCJzcmNcXHNlcnZpY2VzXFxvYmplY3QuanMiLCJzcmNcXHNlcnZpY2VzXFxxdWVyeS5qcyIsInNyY1xcc2VydmljZXNcXHVzZXIuanMiLCJzcmNcXHV0aWxzXFxodHRwLmpzIiwic3JjXFx1dGlsc1xcc29ja2V0LmpzIiwic3JjXFx1dGlsc1xcc3RvcmFnZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDcG9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3BMTyxJQUFNLDBCQUFTO0FBQ3BCLFVBQVEsUUFEWTtBQUVwQixXQUFTLFNBRlc7QUFH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S0FBSyxNQUE3QixHQUFzQyxHQUF0QyxXQUFvRCxLQUFLLFNBQXpELEdBQXFFLEtBQUssU0FBTCxDQUFlLEdBQWYsQ0FBckU7QUFDRDtBQUNGOzs7MkJBQ08sRyxFQUFLO0FBQ1gsV0FBSyxPQUFMLENBQWEsVUFBYixNQUEyQixLQUFLLE1BQWhDLEdBQXlDLEdBQXpDO0FBQ0Q7Ozs0QkFDUTtBQUNQLFdBQUksSUFBSSxJQUFHLENBQVgsRUFBYyxJQUFJLEtBQUssT0FBTCxDQUFhLE1BQS9CLEVBQXVDLEdBQXZDLEVBQTJDO0FBQ3hDLFlBQUcsS0FBSyxPQUFMLENBQWEsT0FBYixDQUFxQixLQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLENBQWpCLENBQXJCLEVBQTBDLE9BQTFDLENBQWtELEtBQUssTUFBdkQsS0FBa0UsQ0FBQyxDQUF0RSxFQUNDLEtBQUssTUFBTCxDQUFZLEtBQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsQ0FBakIsQ0FBWjtBQUNIO0FBQ0Y7Ozs7OztrQkF6Q2tCLE8iLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohXG4gKiBAb3ZlcnZpZXcgZXM2LXByb21pc2UgLSBhIHRpbnkgaW1wbGVtZW50YXRpb24gb2YgUHJvbWlzZXMvQSsuXG4gKiBAY29weXJpZ2h0IENvcHlyaWdodCAoYykgMjAxNCBZZWh1ZGEgS2F0eiwgVG9tIERhbGUsIFN0ZWZhbiBQZW5uZXIgYW5kIGNvbnRyaWJ1dG9ycyAoQ29udmVyc2lvbiB0byBFUzYgQVBJIGJ5IEpha2UgQXJjaGliYWxkKVxuICogQGxpY2Vuc2UgICBMaWNlbnNlZCB1bmRlciBNSVQgbGljZW5zZVxuICogICAgICAgICAgICBTZWUgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3N0ZWZhbnBlbm5lci9lczYtcHJvbWlzZS9tYXN0ZXIvTElDRU5TRVxuICogQHZlcnNpb24gICA0LjAuNVxuICovXG5cbihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG4gICAgdHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuICAgIHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCA/IGRlZmluZShmYWN0b3J5KSA6XG4gICAgKGdsb2JhbC5FUzZQcm9taXNlID0gZmFjdG9yeSgpKTtcbn0odGhpcywgKGZ1bmN0aW9uICgpIHsgJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBvYmplY3RPckZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xufVxuXG52YXIgX2lzQXJyYXkgPSB1bmRlZmluZWQ7XG5pZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG59IGVsc2Uge1xuICBfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG59XG5cbnZhciBpc0FycmF5ID0gX2lzQXJyYXk7XG5cbnZhciBsZW4gPSAwO1xudmFyIHZlcnR4TmV4dCA9IHVuZGVmaW5lZDtcbnZhciBjdXN0b21TY2hlZHVsZXJGbiA9IHVuZGVmaW5lZDtcblxudmFyIGFzYXAgPSBmdW5jdGlvbiBhc2FwKGNhbGxiYWNrLCBhcmcpIHtcbiAgcXVldWVbbGVuXSA9IGNhbGxiYWNrO1xuICBxdWV1ZVtsZW4gKyAxXSA9IGFyZztcbiAgbGVuICs9IDI7XG4gIGlmIChsZW4gPT09IDIpIHtcbiAgICAvLyBJZiBsZW4gaXMgMiwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgLy8gSWYgYWRkaXRpb25hbCBjYWxsYmFja3MgYXJlIHF1ZXVlZCBiZWZvcmUgdGhlIHF1ZXVlIGlzIGZsdXNoZWQsIHRoZXlcbiAgICAvLyB3aWxsIGJlIHByb2Nlc3NlZCBieSB0aGlzIGZsdXNoIHRoYXQgd2UgYXJlIHNjaGVkdWxpbmcuXG4gICAgaWYgKGN1c3RvbVNjaGVkdWxlckZuKSB7XG4gICAgICBjdXN0b21TY2hlZHVsZXJGbihmbHVzaCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjaGVkdWxlRmx1c2goKTtcbiAgICB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHNldFNjaGVkdWxlcihzY2hlZHVsZUZuKSB7XG4gIGN1c3RvbVNjaGVkdWxlckZuID0gc2NoZWR1bGVGbjtcbn1cblxuZnVuY3Rpb24gc2V0QXNhcChhc2FwRm4pIHtcbiAgYXNhcCA9IGFzYXBGbjtcbn1cblxudmFyIGJyb3dzZXJXaW5kb3cgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHVuZGVmaW5lZDtcbnZhciBicm93c2VyR2xvYmFsID0gYnJvd3NlcldpbmRvdyB8fCB7fTtcbnZhciBCcm93c2VyTXV0YXRpb25PYnNlcnZlciA9IGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBicm93c2VyR2xvYmFsLldlYktpdE11dGF0aW9uT2JzZXJ2ZXI7XG52YXIgaXNOb2RlID0gdHlwZW9mIHNlbGYgPT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiAoe30pLnRvU3RyaW5nLmNhbGwocHJvY2VzcykgPT09ICdbb2JqZWN0IHByb2Nlc3NdJztcblxuLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbnZhciBpc1dvcmtlciA9IHR5cGVvZiBVaW50OENsYW1wZWRBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBNZXNzYWdlQ2hhbm5lbCAhPT0gJ3VuZGVmaW5lZCc7XG5cbi8vIG5vZGVcbmZ1bmN0aW9uIHVzZU5leHRUaWNrKCkge1xuICAvLyBub2RlIHZlcnNpb24gMC4xMC54IGRpc3BsYXlzIGEgZGVwcmVjYXRpb24gd2FybmluZyB3aGVuIG5leHRUaWNrIGlzIHVzZWQgcmVjdXJzaXZlbHlcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHByb2Nlc3MubmV4dFRpY2soZmx1c2gpO1xuICB9O1xufVxuXG4vLyB2ZXJ0eFxuZnVuY3Rpb24gdXNlVmVydHhUaW1lcigpIHtcbiAgaWYgKHR5cGVvZiB2ZXJ0eE5leHQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZlcnR4TmV4dChmbHVzaCk7XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB1c2VTZXRUaW1lb3V0KCk7XG59XG5cbmZ1bmN0aW9uIHVzZU11dGF0aW9uT2JzZXJ2ZXIoKSB7XG4gIHZhciBpdGVyYXRpb25zID0gMDtcbiAgdmFyIG9ic2VydmVyID0gbmV3IEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKGZsdXNoKTtcbiAgdmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gIG9ic2VydmVyLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgbm9kZS5kYXRhID0gaXRlcmF0aW9ucyA9ICsraXRlcmF0aW9ucyAlIDI7XG4gIH07XG59XG5cbi8vIHdlYiB3b3JrZXJcbmZ1bmN0aW9uIHVzZU1lc3NhZ2VDaGFubmVsKCkge1xuICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGZsdXNoO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VTZXRUaW1lb3V0KCkge1xuICAvLyBTdG9yZSBzZXRUaW1lb3V0IHJlZmVyZW5jZSBzbyBlczYtcHJvbWlzZSB3aWxsIGJlIHVuYWZmZWN0ZWQgYnlcbiAgLy8gb3RoZXIgY29kZSBtb2RpZnlpbmcgc2V0VGltZW91dCAobGlrZSBzaW5vbi51c2VGYWtlVGltZXJzKCkpXG4gIHZhciBnbG9iYWxTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gZ2xvYmFsU2V0VGltZW91dChmbHVzaCwgMSk7XG4gIH07XG59XG5cbnZhciBxdWV1ZSA9IG5ldyBBcnJheSgxMDAwKTtcbmZ1bmN0aW9uIGZsdXNoKCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSArPSAyKSB7XG4gICAgdmFyIGNhbGxiYWNrID0gcXVldWVbaV07XG4gICAgdmFyIGFyZyA9IHF1ZXVlW2kgKyAxXTtcblxuICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICBxdWV1ZVtpXSA9IHVuZGVmaW5lZDtcbiAgICBxdWV1ZVtpICsgMV0gPSB1bmRlZmluZWQ7XG4gIH1cblxuICBsZW4gPSAwO1xufVxuXG5mdW5jdGlvbiBhdHRlbXB0VmVydHgoKSB7XG4gIHRyeSB7XG4gICAgdmFyIHIgPSByZXF1aXJlO1xuICAgIHZhciB2ZXJ0eCA9IHIoJ3ZlcnR4Jyk7XG4gICAgdmVydHhOZXh0ID0gdmVydHgucnVuT25Mb29wIHx8IHZlcnR4LnJ1bk9uQ29udGV4dDtcbiAgICByZXR1cm4gdXNlVmVydHhUaW1lcigpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVzZVNldFRpbWVvdXQoKTtcbiAgfVxufVxuXG52YXIgc2NoZWR1bGVGbHVzaCA9IHVuZGVmaW5lZDtcbi8vIERlY2lkZSB3aGF0IGFzeW5jIG1ldGhvZCB0byB1c2UgdG8gdHJpZ2dlcmluZyBwcm9jZXNzaW5nIG9mIHF1ZXVlZCBjYWxsYmFja3M6XG5pZiAoaXNOb2RlKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VOZXh0VGljaygpO1xufSBlbHNlIGlmIChCcm93c2VyTXV0YXRpb25PYnNlcnZlcikge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTXV0YXRpb25PYnNlcnZlcigpO1xufSBlbHNlIGlmIChpc1dvcmtlcikge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTWVzc2FnZUNoYW5uZWwoKTtcbn0gZWxzZSBpZiAoYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSBhdHRlbXB0VmVydHgoKTtcbn0gZWxzZSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VTZXRUaW1lb3V0KCk7XG59XG5cbmZ1bmN0aW9uIHRoZW4ob25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgdmFyIF9hcmd1bWVudHMgPSBhcmd1bWVudHM7XG5cbiAgdmFyIHBhcmVudCA9IHRoaXM7XG5cbiAgdmFyIGNoaWxkID0gbmV3IHRoaXMuY29uc3RydWN0b3Iobm9vcCk7XG5cbiAgaWYgKGNoaWxkW1BST01JU0VfSURdID09PSB1bmRlZmluZWQpIHtcbiAgICBtYWtlUHJvbWlzZShjaGlsZCk7XG4gIH1cblxuICB2YXIgX3N0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICBpZiAoX3N0YXRlKSB7XG4gICAgKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBjYWxsYmFjayA9IF9hcmd1bWVudHNbX3N0YXRlIC0gMV07XG4gICAgICBhc2FwKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGludm9rZUNhbGxiYWNrKF9zdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCBwYXJlbnQuX3Jlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KSgpO1xuICB9IGVsc2Uge1xuICAgIHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gIH1cblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yZXNvbHZlYCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgYmVjb21lIHJlc29sdmVkIHdpdGggdGhlXG4gIHBhc3NlZCBgdmFsdWVgLiBJdCBpcyBzaG9ydGhhbmQgZm9yIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgcmVzb2x2ZSgxKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyB2YWx1ZSA9PT0gMVxuICB9KTtcbiAgYGBgXG5cbiAgSW5zdGVhZCBvZiB3cml0aW5nIHRoZSBhYm92ZSwgeW91ciBjb2RlIG5vdyBzaW1wbHkgYmVjb21lcyB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoMSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyB2YWx1ZSA9PT0gMVxuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCByZXNvbHZlXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBbnl9IHZhbHVlIHZhbHVlIHRoYXQgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSByZXNvbHZlZCB3aXRoXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgd2lsbCBiZWNvbWUgZnVsZmlsbGVkIHdpdGggdGhlIGdpdmVuXG4gIGB2YWx1ZWBcbiovXG5mdW5jdGlvbiByZXNvbHZlKG9iamVjdCkge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcbiAgX3Jlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgcmV0dXJuIHByb21pc2U7XG59XG5cbnZhciBQUk9NSVNFX0lEID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDE2KTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnZhciBQRU5ESU5HID0gdm9pZCAwO1xudmFyIEZVTEZJTExFRCA9IDE7XG52YXIgUkVKRUNURUQgPSAyO1xuXG52YXIgR0VUX1RIRU5fRVJST1IgPSBuZXcgRXJyb3JPYmplY3QoKTtcblxuZnVuY3Rpb24gc2VsZkZ1bGZpbGxtZW50KCkge1xuICByZXR1cm4gbmV3IFR5cGVFcnJvcihcIllvdSBjYW5ub3QgcmVzb2x2ZSBhIHByb21pc2Ugd2l0aCBpdHNlbGZcIik7XG59XG5cbmZ1bmN0aW9uIGNhbm5vdFJldHVybk93bigpIHtcbiAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoJ0EgcHJvbWlzZXMgY2FsbGJhY2sgY2Fubm90IHJldHVybiB0aGF0IHNhbWUgcHJvbWlzZS4nKTtcbn1cblxuZnVuY3Rpb24gZ2V0VGhlbihwcm9taXNlKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBHRVRfVEhFTl9FUlJPUi5lcnJvciA9IGVycm9yO1xuICAgIHJldHVybiBHRVRfVEhFTl9FUlJPUjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cnlUaGVuKHRoZW4sIHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpIHtcbiAgdHJ5IHtcbiAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUsIHRoZW4pIHtcbiAgYXNhcChmdW5jdGlvbiAocHJvbWlzZSkge1xuICAgIHZhciBzZWFsZWQgPSBmYWxzZTtcbiAgICB2YXIgZXJyb3IgPSB0cnlUaGVuKHRoZW4sIHRoZW5hYmxlLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIGlmIChzZWFsZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgaWYgKHNlYWxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuXG4gICAgICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSwgJ1NldHRsZTogJyArIChwcm9taXNlLl9sYWJlbCB8fCAnIHVua25vd24gcHJvbWlzZScpKTtcblxuICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgX3JlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgfVxuICB9LCBwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUpIHtcbiAgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gRlVMRklMTEVEKSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgfSBlbHNlIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IFJFSkVDVEVEKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgfSBlbHNlIHtcbiAgICBzdWJzY3JpYmUodGhlbmFibGUsIHVuZGVmaW5lZCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICByZXR1cm4gX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHJldHVybiBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuJCQpIHtcbiAgaWYgKG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IgPT09IHByb21pc2UuY29uc3RydWN0b3IgJiYgdGhlbiQkID09PSB0aGVuICYmIG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IucmVzb2x2ZSA9PT0gcmVzb2x2ZSkge1xuICAgIGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICB9IGVsc2Uge1xuICAgIGlmICh0aGVuJCQgPT09IEdFVF9USEVOX0VSUk9SKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIEdFVF9USEVOX0VSUk9SLmVycm9yKTtcbiAgICB9IGVsc2UgaWYgKHRoZW4kJCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgIH0gZWxzZSBpZiAoaXNGdW5jdGlvbih0aGVuJCQpKSB7XG4gICAgICBoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbiQkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCBzZWxmRnVsZmlsbG1lbnQoKSk7XG4gIH0gZWxzZSBpZiAob2JqZWN0T3JGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIHZhbHVlLCBnZXRUaGVuKHZhbHVlKSk7XG4gIH0gZWxzZSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHVibGlzaFJlamVjdGlvbihwcm9taXNlKSB7XG4gIGlmIChwcm9taXNlLl9vbmVycm9yKSB7XG4gICAgcHJvbWlzZS5fb25lcnJvcihwcm9taXNlLl9yZXN1bHQpO1xuICB9XG5cbiAgcHVibGlzaChwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gZnVsZmlsbChwcm9taXNlLCB2YWx1ZSkge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlLl9yZXN1bHQgPSB2YWx1ZTtcbiAgcHJvbWlzZS5fc3RhdGUgPSBGVUxGSUxMRUQ7XG5cbiAgaWYgKHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCAhPT0gMCkge1xuICAgIGFzYXAocHVibGlzaCwgcHJvbWlzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gX3JlamVjdChwcm9taXNlLCByZWFzb24pIHtcbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHByb21pc2UuX3N0YXRlID0gUkVKRUNURUQ7XG4gIHByb21pc2UuX3Jlc3VsdCA9IHJlYXNvbjtcblxuICBhc2FwKHB1Ymxpc2hSZWplY3Rpb24sIHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgdmFyIF9zdWJzY3JpYmVycyA9IHBhcmVudC5fc3Vic2NyaWJlcnM7XG4gIHZhciBsZW5ndGggPSBfc3Vic2NyaWJlcnMubGVuZ3RoO1xuXG4gIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgX3N1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgX3N1YnNjcmliZXJzW2xlbmd0aCArIEZVTEZJTExFRF0gPSBvbkZ1bGZpbGxtZW50O1xuICBfc3Vic2NyaWJlcnNbbGVuZ3RoICsgUkVKRUNURURdID0gb25SZWplY3Rpb247XG5cbiAgaWYgKGxlbmd0aCA9PT0gMCAmJiBwYXJlbnQuX3N0YXRlKSB7XG4gICAgYXNhcChwdWJsaXNoLCBwYXJlbnQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHB1Ymxpc2gocHJvbWlzZSkge1xuICB2YXIgc3Vic2NyaWJlcnMgPSBwcm9taXNlLl9zdWJzY3JpYmVycztcbiAgdmFyIHNldHRsZWQgPSBwcm9taXNlLl9zdGF0ZTtcblxuICBpZiAoc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGNoaWxkID0gdW5kZWZpbmVkLFxuICAgICAgY2FsbGJhY2sgPSB1bmRlZmluZWQsXG4gICAgICBkZXRhaWwgPSBwcm9taXNlLl9yZXN1bHQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJzY3JpYmVycy5sZW5ndGg7IGkgKz0gMykge1xuICAgIGNoaWxkID0gc3Vic2NyaWJlcnNbaV07XG4gICAgY2FsbGJhY2sgPSBzdWJzY3JpYmVyc1tpICsgc2V0dGxlZF07XG5cbiAgICBpZiAoY2hpbGQpIHtcbiAgICAgIGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2soZGV0YWlsKTtcbiAgICB9XG4gIH1cblxuICBwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggPSAwO1xufVxuXG5mdW5jdGlvbiBFcnJvck9iamVjdCgpIHtcbiAgdGhpcy5lcnJvciA9IG51bGw7XG59XG5cbnZhciBUUllfQ0FUQ0hfRVJST1IgPSBuZXcgRXJyb3JPYmplY3QoKTtcblxuZnVuY3Rpb24gdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICB0cnkge1xuICAgIHJldHVybiBjYWxsYmFjayhkZXRhaWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgVFJZX0NBVENIX0VSUk9SLmVycm9yID0gZTtcbiAgICByZXR1cm4gVFJZX0NBVENIX0VSUk9SO1xuICB9XG59XG5cbmZ1bmN0aW9uIGludm9rZUNhbGxiYWNrKHNldHRsZWQsIHByb21pc2UsIGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgdmFyIGhhc0NhbGxiYWNrID0gaXNGdW5jdGlvbihjYWxsYmFjayksXG4gICAgICB2YWx1ZSA9IHVuZGVmaW5lZCxcbiAgICAgIGVycm9yID0gdW5kZWZpbmVkLFxuICAgICAgc3VjY2VlZGVkID0gdW5kZWZpbmVkLFxuICAgICAgZmFpbGVkID0gdW5kZWZpbmVkO1xuXG4gIGlmIChoYXNDYWxsYmFjaykge1xuICAgIHZhbHVlID0gdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICBpZiAodmFsdWUgPT09IFRSWV9DQVRDSF9FUlJPUikge1xuICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgIGVycm9yID0gdmFsdWUuZXJyb3I7XG4gICAgICB2YWx1ZSA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGNhbm5vdFJldHVybk93bigpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFsdWUgPSBkZXRhaWw7XG4gICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgfVxuXG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIC8vIG5vb3BcbiAgfSBlbHNlIGlmIChoYXNDYWxsYmFjayAmJiBzdWNjZWVkZWQpIHtcbiAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGZhaWxlZCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBGVUxGSUxMRUQpIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gUkVKRUNURUQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaW5pdGlhbGl6ZVByb21pc2UocHJvbWlzZSwgcmVzb2x2ZXIpIHtcbiAgdHJ5IHtcbiAgICByZXNvbHZlcihmdW5jdGlvbiByZXNvbHZlUHJvbWlzZSh2YWx1ZSkge1xuICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIGUpO1xuICB9XG59XG5cbnZhciBpZCA9IDA7XG5mdW5jdGlvbiBuZXh0SWQoKSB7XG4gIHJldHVybiBpZCsrO1xufVxuXG5mdW5jdGlvbiBtYWtlUHJvbWlzZShwcm9taXNlKSB7XG4gIHByb21pc2VbUFJPTUlTRV9JRF0gPSBpZCsrO1xuICBwcm9taXNlLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgcHJvbWlzZS5fcmVzdWx0ID0gdW5kZWZpbmVkO1xuICBwcm9taXNlLl9zdWJzY3JpYmVycyA9IFtdO1xufVxuXG5mdW5jdGlvbiBFbnVtZXJhdG9yKENvbnN0cnVjdG9yLCBpbnB1dCkge1xuICB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yID0gQ29uc3RydWN0b3I7XG4gIHRoaXMucHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcblxuICBpZiAoIXRoaXMucHJvbWlzZVtQUk9NSVNFX0lEXSkge1xuICAgIG1ha2VQcm9taXNlKHRoaXMucHJvbWlzZSk7XG4gIH1cblxuICBpZiAoaXNBcnJheShpbnB1dCkpIHtcbiAgICB0aGlzLl9pbnB1dCA9IGlucHV0O1xuICAgIHRoaXMubGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuICAgIHRoaXMuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgIHRoaXMuX3Jlc3VsdCA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCk7XG5cbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxlbmd0aCA9IHRoaXMubGVuZ3RoIHx8IDA7XG4gICAgICB0aGlzLl9lbnVtZXJhdGUoKTtcbiAgICAgIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIF9yZWplY3QodGhpcy5wcm9taXNlLCB2YWxpZGF0aW9uRXJyb3IoKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGlvbkVycm9yKCkge1xuICByZXR1cm4gbmV3IEVycm9yKCdBcnJheSBNZXRob2RzIG11c3QgYmUgcHJvdmlkZWQgYW4gQXJyYXknKTtcbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9lbnVtZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgdmFyIF9pbnB1dCA9IHRoaXMuX2lucHV0O1xuXG4gIGZvciAodmFyIGkgPSAwOyB0aGlzLl9zdGF0ZSA9PT0gUEVORElORyAmJiBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB0aGlzLl9lYWNoRW50cnkoX2lucHV0W2ldLCBpKTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX2VhY2hFbnRyeSA9IGZ1bmN0aW9uIChlbnRyeSwgaSkge1xuICB2YXIgYyA9IHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3I7XG4gIHZhciByZXNvbHZlJCQgPSBjLnJlc29sdmU7XG5cbiAgaWYgKHJlc29sdmUkJCA9PT0gcmVzb2x2ZSkge1xuICAgIHZhciBfdGhlbiA9IGdldFRoZW4oZW50cnkpO1xuXG4gICAgaWYgKF90aGVuID09PSB0aGVuICYmIGVudHJ5Ll9zdGF0ZSAhPT0gUEVORElORykge1xuICAgICAgdGhpcy5fc2V0dGxlZEF0KGVudHJ5Ll9zdGF0ZSwgaSwgZW50cnkuX3Jlc3VsdCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgX3RoZW4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuICAgICAgdGhpcy5fcmVzdWx0W2ldID0gZW50cnk7XG4gICAgfSBlbHNlIGlmIChjID09PSBQcm9taXNlKSB7XG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBjKG5vb3ApO1xuICAgICAgaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBlbnRyeSwgX3RoZW4pO1xuICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KHByb21pc2UsIGkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl93aWxsU2V0dGxlQXQobmV3IGMoZnVuY3Rpb24gKHJlc29sdmUkJCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSQkKGVudHJ5KTtcbiAgICAgIH0pLCBpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5fd2lsbFNldHRsZUF0KHJlc29sdmUkJChlbnRyeSksIGkpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fc2V0dGxlZEF0ID0gZnVuY3Rpb24gKHN0YXRlLCBpLCB2YWx1ZSkge1xuICB2YXIgcHJvbWlzZSA9IHRoaXMucHJvbWlzZTtcblxuICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IFBFTkRJTkcpIHtcbiAgICB0aGlzLl9yZW1haW5pbmctLTtcblxuICAgIGlmIChzdGF0ZSA9PT0gUkVKRUNURUQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fd2lsbFNldHRsZUF0ID0gZnVuY3Rpb24gKHByb21pc2UsIGkpIHtcbiAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gIHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBlbnVtZXJhdG9yLl9zZXR0bGVkQXQoRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICByZXR1cm4gZW51bWVyYXRvci5fc2V0dGxlZEF0KFJFSkVDVEVELCBpLCByZWFzb24pO1xuICB9KTtcbn07XG5cbi8qKlxuICBgUHJvbWlzZS5hbGxgIGFjY2VwdHMgYW4gYXJyYXkgb2YgcHJvbWlzZXMsIGFuZCByZXR1cm5zIGEgbmV3IHByb21pc2Ugd2hpY2hcbiAgaXMgZnVsZmlsbGVkIHdpdGggYW4gYXJyYXkgb2YgZnVsZmlsbG1lbnQgdmFsdWVzIGZvciB0aGUgcGFzc2VkIHByb21pc2VzLCBvclxuICByZWplY3RlZCB3aXRoIHRoZSByZWFzb24gb2YgdGhlIGZpcnN0IHBhc3NlZCBwcm9taXNlIHRvIGJlIHJlamVjdGVkLiBJdCBjYXN0cyBhbGxcbiAgZWxlbWVudHMgb2YgdGhlIHBhc3NlZCBpdGVyYWJsZSB0byBwcm9taXNlcyBhcyBpdCBydW5zIHRoaXMgYWxnb3JpdGhtLlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSByZXNvbHZlKDEpO1xuICBsZXQgcHJvbWlzZTIgPSByZXNvbHZlKDIpO1xuICBsZXQgcHJvbWlzZTMgPSByZXNvbHZlKDMpO1xuICBsZXQgcHJvbWlzZXMgPSBbIHByb21pc2UxLCBwcm9taXNlMiwgcHJvbWlzZTMgXTtcblxuICBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbihhcnJheSl7XG4gICAgLy8gVGhlIGFycmF5IGhlcmUgd291bGQgYmUgWyAxLCAyLCAzIF07XG4gIH0pO1xuICBgYGBcblxuICBJZiBhbnkgb2YgdGhlIGBwcm9taXNlc2AgZ2l2ZW4gdG8gYGFsbGAgYXJlIHJlamVjdGVkLCB0aGUgZmlyc3QgcHJvbWlzZVxuICB0aGF0IGlzIHJlamVjdGVkIHdpbGwgYmUgZ2l2ZW4gYXMgYW4gYXJndW1lbnQgdG8gdGhlIHJldHVybmVkIHByb21pc2VzJ3NcbiAgcmVqZWN0aW9uIGhhbmRsZXIuIEZvciBleGFtcGxlOlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSByZXNvbHZlKDEpO1xuICBsZXQgcHJvbWlzZTIgPSByZWplY3QobmV3IEVycm9yKFwiMlwiKSk7XG4gIGxldCBwcm9taXNlMyA9IHJlamVjdChuZXcgRXJyb3IoXCIzXCIpKTtcbiAgbGV0IHByb21pc2VzID0gWyBwcm9taXNlMSwgcHJvbWlzZTIsIHByb21pc2UzIF07XG5cbiAgUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24oYXJyYXkpe1xuICAgIC8vIENvZGUgaGVyZSBuZXZlciBydW5zIGJlY2F1c2UgdGhlcmUgYXJlIHJlamVjdGVkIHByb21pc2VzIVxuICB9LCBmdW5jdGlvbihlcnJvcikge1xuICAgIC8vIGVycm9yLm1lc3NhZ2UgPT09IFwiMlwiXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIGFsbFxuICBAc3RhdGljXG4gIEBwYXJhbSB7QXJyYXl9IGVudHJpZXMgYXJyYXkgb2YgcHJvbWlzZXNcbiAgQHBhcmFtIHtTdHJpbmd9IGxhYmVsIG9wdGlvbmFsIHN0cmluZyBmb3IgbGFiZWxpbmcgdGhlIHByb21pc2UuXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gcHJvbWlzZSB0aGF0IGlzIGZ1bGZpbGxlZCB3aGVuIGFsbCBgcHJvbWlzZXNgIGhhdmUgYmVlblxuICBmdWxmaWxsZWQsIG9yIHJlamVjdGVkIGlmIGFueSBvZiB0aGVtIGJlY29tZSByZWplY3RlZC5cbiAgQHN0YXRpY1xuKi9cbmZ1bmN0aW9uIGFsbChlbnRyaWVzKSB7XG4gIHJldHVybiBuZXcgRW51bWVyYXRvcih0aGlzLCBlbnRyaWVzKS5wcm9taXNlO1xufVxuXG4vKipcbiAgYFByb21pc2UucmFjZWAgcmV0dXJucyBhIG5ldyBwcm9taXNlIHdoaWNoIGlzIHNldHRsZWQgaW4gdGhlIHNhbWUgd2F5IGFzIHRoZVxuICBmaXJzdCBwYXNzZWQgcHJvbWlzZSB0byBzZXR0bGUuXG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAxJyk7XG4gICAgfSwgMjAwKTtcbiAgfSk7XG5cbiAgbGV0IHByb21pc2UyID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDInKTtcbiAgICB9LCAxMDApO1xuICB9KTtcblxuICBQcm9taXNlLnJhY2UoW3Byb21pc2UxLCBwcm9taXNlMl0pLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAvLyByZXN1bHQgPT09ICdwcm9taXNlIDInIGJlY2F1c2UgaXQgd2FzIHJlc29sdmVkIGJlZm9yZSBwcm9taXNlMVxuICAgIC8vIHdhcyByZXNvbHZlZC5cbiAgfSk7XG4gIGBgYFxuXG4gIGBQcm9taXNlLnJhY2VgIGlzIGRldGVybWluaXN0aWMgaW4gdGhhdCBvbmx5IHRoZSBzdGF0ZSBvZiB0aGUgZmlyc3RcbiAgc2V0dGxlZCBwcm9taXNlIG1hdHRlcnMuIEZvciBleGFtcGxlLCBldmVuIGlmIG90aGVyIHByb21pc2VzIGdpdmVuIHRvIHRoZVxuICBgcHJvbWlzZXNgIGFycmF5IGFyZ3VtZW50IGFyZSByZXNvbHZlZCwgYnV0IHRoZSBmaXJzdCBzZXR0bGVkIHByb21pc2UgaGFzXG4gIGJlY29tZSByZWplY3RlZCBiZWZvcmUgdGhlIG90aGVyIHByb21pc2VzIGJlY2FtZSBmdWxmaWxsZWQsIHRoZSByZXR1cm5lZFxuICBwcm9taXNlIHdpbGwgYmVjb21lIHJlamVjdGVkOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDEnKTtcbiAgICB9LCAyMDApO1xuICB9KTtcblxuICBsZXQgcHJvbWlzZTIgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ3Byb21pc2UgMicpKTtcbiAgICB9LCAxMDApO1xuICB9KTtcblxuICBQcm9taXNlLnJhY2UoW3Byb21pc2UxLCBwcm9taXNlMl0pLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAvLyBDb2RlIGhlcmUgbmV2ZXIgcnVuc1xuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAncHJvbWlzZSAyJyBiZWNhdXNlIHByb21pc2UgMiBiZWNhbWUgcmVqZWN0ZWQgYmVmb3JlXG4gICAgLy8gcHJvbWlzZSAxIGJlY2FtZSBmdWxmaWxsZWRcbiAgfSk7XG4gIGBgYFxuXG4gIEFuIGV4YW1wbGUgcmVhbC13b3JsZCB1c2UgY2FzZSBpcyBpbXBsZW1lbnRpbmcgdGltZW91dHM6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBQcm9taXNlLnJhY2UoW2FqYXgoJ2Zvby5qc29uJyksIHRpbWVvdXQoNTAwMCldKVxuICBgYGBcblxuICBAbWV0aG9kIHJhY2VcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FycmF5fSBwcm9taXNlcyBhcnJheSBvZiBwcm9taXNlcyB0byBvYnNlcnZlXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHdoaWNoIHNldHRsZXMgaW4gdGhlIHNhbWUgd2F5IGFzIHRoZSBmaXJzdCBwYXNzZWRcbiAgcHJvbWlzZSB0byBzZXR0bGUuXG4qL1xuZnVuY3Rpb24gcmFjZShlbnRyaWVzKSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgaWYgKCFpc0FycmF5KGVudHJpZXMpKSB7XG4gICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbiAoXywgcmVqZWN0KSB7XG4gICAgICByZXR1cm4gcmVqZWN0KG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYW4gYXJyYXkgdG8gcmFjZS4nKSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICB2YXIgbGVuZ3RoID0gZW50cmllcy5sZW5ndGg7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIENvbnN0cnVjdG9yLnJlc29sdmUoZW50cmllc1tpXSkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yZWplY3RgIHJldHVybnMgYSBwcm9taXNlIHJlamVjdGVkIHdpdGggdGhlIHBhc3NlZCBgcmVhc29uYC5cbiAgSXQgaXMgc2hvcnRoYW5kIGZvciB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHJlamVjdChuZXcgRXJyb3IoJ1dIT09QUycpKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyBDb2RlIGhlcmUgZG9lc24ndCBydW4gYmVjYXVzZSB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCFcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ1dIT09QUydcbiAgfSk7XG4gIGBgYFxuXG4gIEluc3RlYWQgb2Ygd3JpdGluZyB0aGUgYWJvdmUsIHlvdXIgY29kZSBub3cgc2ltcGx5IGJlY29tZXMgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdXSE9PUFMnKSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyBDb2RlIGhlcmUgZG9lc24ndCBydW4gYmVjYXVzZSB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCFcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ1dIT09QUydcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgcmVqZWN0XG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBbnl9IHJlYXNvbiB2YWx1ZSB0aGF0IHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQgd2l0aC5cbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgcmVqZWN0ZWQgd2l0aCB0aGUgZ2l2ZW4gYHJlYXNvbmAuXG4qL1xuZnVuY3Rpb24gcmVqZWN0KHJlYXNvbikge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcbiAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICByZXR1cm4gcHJvbWlzZTtcbn1cblxuZnVuY3Rpb24gbmVlZHNSZXNvbHZlcigpIHtcbiAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xufVxuXG5mdW5jdGlvbiBuZWVkc05ldygpIHtcbiAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ1Byb21pc2UnOiBQbGVhc2UgdXNlIHRoZSAnbmV3JyBvcGVyYXRvciwgdGhpcyBvYmplY3QgY29uc3RydWN0b3IgY2Fubm90IGJlIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLlwiKTtcbn1cblxuLyoqXG4gIFByb21pc2Ugb2JqZWN0cyByZXByZXNlbnQgdGhlIGV2ZW50dWFsIHJlc3VsdCBvZiBhbiBhc3luY2hyb25vdXMgb3BlcmF0aW9uLiBUaGVcbiAgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCwgd2hpY2hcbiAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gIFRlcm1pbm9sb2d5XG4gIC0tLS0tLS0tLS0tXG5cbiAgLSBgcHJvbWlzZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHdpdGggYSBgdGhlbmAgbWV0aG9kIHdob3NlIGJlaGF2aW9yIGNvbmZvcm1zIHRvIHRoaXMgc3BlY2lmaWNhdGlvbi5cbiAgLSBgdGhlbmFibGVgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgYSBgdGhlbmAgbWV0aG9kLlxuICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gIC0gYGV4Y2VwdGlvbmAgaXMgYSB2YWx1ZSB0aGF0IGlzIHRocm93biB1c2luZyB0aGUgdGhyb3cgc3RhdGVtZW50LlxuICAtIGByZWFzb25gIGlzIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2h5IGEgcHJvbWlzZSB3YXMgcmVqZWN0ZWQuXG4gIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gIEEgcHJvbWlzZSBjYW4gYmUgaW4gb25lIG9mIHRocmVlIHN0YXRlczogcGVuZGluZywgZnVsZmlsbGVkLCBvciByZWplY3RlZC5cblxuICBQcm9taXNlcyB0aGF0IGFyZSBmdWxmaWxsZWQgaGF2ZSBhIGZ1bGZpbGxtZW50IHZhbHVlIGFuZCBhcmUgaW4gdGhlIGZ1bGZpbGxlZFxuICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gIHJlamVjdGVkIHN0YXRlLiAgQSBmdWxmaWxsbWVudCB2YWx1ZSBpcyBuZXZlciBhIHRoZW5hYmxlLlxuXG4gIFByb21pc2VzIGNhbiBhbHNvIGJlIHNhaWQgdG8gKnJlc29sdmUqIGEgdmFsdWUuICBJZiB0aGlzIHZhbHVlIGlzIGFsc28gYVxuICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gIHNldHRsZWQgc3RhdGUuICBTbyBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2lsbFxuICBpdHNlbGYgcmVqZWN0LCBhbmQgYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCBmdWxmaWxscyB3aWxsXG4gIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgQmFzaWMgVXNhZ2U6XG4gIC0tLS0tLS0tLS0tLVxuXG4gIGBgYGpzXG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgLy8gb24gc3VjY2Vzc1xuICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgLy8gb24gZmFpbHVyZVxuICAgIHJlamVjdChyZWFzb24pO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAvLyBvbiBmdWxmaWxsbWVudFxuICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAvLyBvbiByZWplY3Rpb25cbiAgfSk7XG4gIGBgYFxuXG4gIEFkdmFuY2VkIFVzYWdlOlxuICAtLS0tLS0tLS0tLS0tLS1cblxuICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gIGBYTUxIdHRwUmVxdWVzdGBzLlxuXG4gIGBgYGpzXG4gIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGhhbmRsZXI7XG4gICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICB4aHIuc2VuZCgpO1xuXG4gICAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLnJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignZ2V0SlNPTjogYCcgKyB1cmwgKyAnYCBmYWlsZWQgd2l0aCBzdGF0dXM6IFsnICsgdGhpcy5zdGF0dXMgKyAnXScpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBnZXRKU09OKCcvcG9zdHMuanNvbicpLnRoZW4oZnVuY3Rpb24oanNvbikge1xuICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgIC8vIG9uIHJlamVjdGlvblxuICB9KTtcbiAgYGBgXG5cbiAgVW5saWtlIGNhbGxiYWNrcywgcHJvbWlzZXMgYXJlIGdyZWF0IGNvbXBvc2FibGUgcHJpbWl0aXZlcy5cblxuICBgYGBqc1xuICBQcm9taXNlLmFsbChbXG4gICAgZ2V0SlNPTignL3Bvc3RzJyksXG4gICAgZ2V0SlNPTignL2NvbW1lbnRzJylcbiAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgIHZhbHVlc1swXSAvLyA9PiBwb3N0c0pTT05cbiAgICB2YWx1ZXNbMV0gLy8gPT4gY29tbWVudHNKU09OXG5cbiAgICByZXR1cm4gdmFsdWVzO1xuICB9KTtcbiAgYGBgXG5cbiAgQGNsYXNzIFByb21pc2VcbiAgQHBhcmFtIHtmdW5jdGlvbn0gcmVzb2x2ZXJcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAY29uc3RydWN0b3JcbiovXG5mdW5jdGlvbiBQcm9taXNlKHJlc29sdmVyKSB7XG4gIHRoaXNbUFJPTUlTRV9JRF0gPSBuZXh0SWQoKTtcbiAgdGhpcy5fcmVzdWx0ID0gdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgaWYgKG5vb3AgIT09IHJlc29sdmVyKSB7XG4gICAgdHlwZW9mIHJlc29sdmVyICE9PSAnZnVuY3Rpb24nICYmIG5lZWRzUmVzb2x2ZXIoKTtcbiAgICB0aGlzIGluc3RhbmNlb2YgUHJvbWlzZSA/IGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKSA6IG5lZWRzTmV3KCk7XG4gIH1cbn1cblxuUHJvbWlzZS5hbGwgPSBhbGw7XG5Qcm9taXNlLnJhY2UgPSByYWNlO1xuUHJvbWlzZS5yZXNvbHZlID0gcmVzb2x2ZTtcblByb21pc2UucmVqZWN0ID0gcmVqZWN0O1xuUHJvbWlzZS5fc2V0U2NoZWR1bGVyID0gc2V0U2NoZWR1bGVyO1xuUHJvbWlzZS5fc2V0QXNhcCA9IHNldEFzYXA7XG5Qcm9taXNlLl9hc2FwID0gYXNhcDtcblxuUHJvbWlzZS5wcm90b3R5cGUgPSB7XG4gIGNvbnN0cnVjdG9yOiBQcm9taXNlLFxuXG4gIC8qKlxuICAgIFRoZSBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLFxuICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgcmVhc29uIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbih1c2VyKXtcbiAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHVzZXIgaXMgdW5hdmFpbGFibGUsIGFuZCB5b3UgYXJlIGdpdmVuIHRoZSByZWFzb24gd2h5XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIENoYWluaW5nXG4gICAgLS0tLS0tLS1cbiAgXG4gICAgVGhlIHJldHVybiB2YWx1ZSBvZiBgdGhlbmAgaXMgaXRzZWxmIGEgcHJvbWlzZS4gIFRoaXMgc2Vjb25kLCAnZG93bnN0cmVhbSdcbiAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgb3IgcmVqZWN0aW9uIGhhbmRsZXIsIG9yIHJlamVjdGVkIGlmIHRoZSBoYW5kbGVyIHRocm93cyBhbiBleGNlcHRpb24uXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHJldHVybiAnZGVmYXVsdCBuYW1lJztcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgLy8gSWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGB1c2VyTmFtZWAgd2lsbCBiZSB0aGUgdXNlcidzIG5hbWUsIG90aGVyd2lzZSBpdFxuICAgICAgLy8gd2lsbCBiZSBgJ2RlZmF1bHQgbmFtZSdgXG4gICAgfSk7XG4gIFxuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScpO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gaWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGByZWFzb25gIHdpbGwgYmUgJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jy5cbiAgICAgIC8vIElmIGBmaW5kVXNlcmAgcmVqZWN0ZWQsIGByZWFzb25gIHdpbGwgYmUgJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknLlxuICAgIH0pO1xuICAgIGBgYFxuICAgIElmIHRoZSBkb3duc3RyZWFtIHByb21pc2UgZG9lcyBub3Qgc3BlY2lmeSBhIHJlamVjdGlvbiBoYW5kbGVyLCByZWplY3Rpb24gcmVhc29ucyB3aWxsIGJlIHByb3BhZ2F0ZWQgZnVydGhlciBkb3duc3RyZWFtLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBlZGFnb2dpY2FsRXhjZXB0aW9uKCdVcHN0cmVhbSBlcnJvcicpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBUaGUgYFBlZGdhZ29jaWFsRXhjZXB0aW9uYCBpcyBwcm9wYWdhdGVkIGFsbCB0aGUgd2F5IGRvd24gdG8gaGVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBBc3NpbWlsYXRpb25cbiAgICAtLS0tLS0tLS0tLS1cbiAgXG4gICAgU29tZXRpbWVzIHRoZSB2YWx1ZSB5b3Ugd2FudCB0byBwcm9wYWdhdGUgdG8gYSBkb3duc3RyZWFtIHByb21pc2UgY2FuIG9ubHkgYmVcbiAgICByZXRyaWV2ZWQgYXN5bmNocm9ub3VzbHkuIFRoaXMgY2FuIGJlIGFjaGlldmVkIGJ5IHJldHVybmluZyBhIHByb21pc2UgaW4gdGhlXG4gICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICB1bnRpbCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBpcyBzZXR0bGVkLiBUaGlzIGlzIGNhbGxlZCAqYXNzaW1pbGF0aW9uKi5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgLy8gVGhlIHVzZXIncyBjb21tZW50cyBhcmUgbm93IGF2YWlsYWJsZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBJZiB0aGUgYXNzaW1saWF0ZWQgcHJvbWlzZSByZWplY3RzLCB0aGVuIHRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCBhbHNvIHJlamVjdC5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCBmdWxmaWxscywgd2UnbGwgaGF2ZSB0aGUgdmFsdWUgaGVyZVxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgcmVqZWN0cywgd2UnbGwgaGF2ZSB0aGUgcmVhc29uIGhlcmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgU2ltcGxlIEV4YW1wbGVcbiAgICAtLS0tLS0tLS0tLS0tLVxuICBcbiAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBsZXQgcmVzdWx0O1xuICBcbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfVxuICAgIGBgYFxuICBcbiAgICBFcnJiYWNrIEV4YW1wbGVcbiAgXG4gICAgYGBganNcbiAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBQcm9taXNlIEV4YW1wbGU7XG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBmaW5kUmVzdWx0KCkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEFkdmFuY2VkIEV4YW1wbGVcbiAgICAtLS0tLS0tLS0tLS0tLVxuICBcbiAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBsZXQgYXV0aG9yLCBib29rcztcbiAgXG4gICAgdHJ5IHtcbiAgICAgIGF1dGhvciA9IGZpbmRBdXRob3IoKTtcbiAgICAgIGJvb2tzICA9IGZpbmRCb29rc0J5QXV0aG9yKGF1dGhvcik7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9XG4gICAgYGBgXG4gIFxuICAgIEVycmJhY2sgRXhhbXBsZVxuICBcbiAgICBgYGBqc1xuICBcbiAgICBmdW5jdGlvbiBmb3VuZEJvb2tzKGJvb2tzKSB7XG4gIFxuICAgIH1cbiAgXG4gICAgZnVuY3Rpb24gZmFpbHVyZShyZWFzb24pIHtcbiAgXG4gICAgfVxuICBcbiAgICBmaW5kQXV0aG9yKGZ1bmN0aW9uKGF1dGhvciwgZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZpbmRCb29va3NCeUF1dGhvcihhdXRob3IsIGZ1bmN0aW9uKGJvb2tzLCBlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgICAgICAgICBmYWlsdXJlKHJlYXNvbik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFByb21pc2UgRXhhbXBsZTtcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGZpbmRBdXRob3IoKS5cbiAgICAgIHRoZW4oZmluZEJvb2tzQnlBdXRob3IpLlxuICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgIC8vIGZvdW5kIGJvb2tzXG4gICAgfSkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEBtZXRob2QgdGhlblxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZFxuICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAqL1xuICB0aGVuOiB0aGVuLFxuXG4gIC8qKlxuICAgIGBjYXRjaGAgaXMgc2ltcGx5IHN1Z2FyIGZvciBgdGhlbih1bmRlZmluZWQsIG9uUmVqZWN0aW9uKWAgd2hpY2ggbWFrZXMgaXQgdGhlIHNhbWVcbiAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuICBcbiAgICBgYGBqc1xuICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgIHRocm93IG5ldyBFcnJvcignY291bGRuJ3QgZmluZCB0aGF0IGF1dGhvcicpO1xuICAgIH1cbiAgXG4gICAgLy8gc3luY2hyb25vdXNcbiAgICB0cnkge1xuICAgICAgZmluZEF1dGhvcigpO1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH1cbiAgXG4gICAgLy8gYXN5bmMgd2l0aCBwcm9taXNlc1xuICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQG1ldGhvZCBjYXRjaFxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICovXG4gICdjYXRjaCc6IGZ1bmN0aW9uIF9jYXRjaChvblJlamVjdGlvbikge1xuICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICB9XG59O1xuXG5mdW5jdGlvbiBwb2x5ZmlsbCgpIHtcbiAgICB2YXIgbG9jYWwgPSB1bmRlZmluZWQ7XG5cbiAgICBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbG9jYWwgPSBnbG9iYWw7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbG9jYWwgPSBzZWxmO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsb2NhbCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncG9seWZpbGwgZmFpbGVkIGJlY2F1c2UgZ2xvYmFsIG9iamVjdCBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgUCA9IGxvY2FsLlByb21pc2U7XG5cbiAgICBpZiAoUCkge1xuICAgICAgICB2YXIgcHJvbWlzZVRvU3RyaW5nID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHByb21pc2VUb1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChQLnJlc29sdmUoKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIHNpbGVudGx5IGlnbm9yZWRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9taXNlVG9TdHJpbmcgPT09ICdbb2JqZWN0IFByb21pc2VdJyAmJiAhUC5jYXN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsb2NhbC5Qcm9taXNlID0gUHJvbWlzZTtcbn1cblxuLy8gU3RyYW5nZSBjb21wYXQuLlxuUHJvbWlzZS5wb2x5ZmlsbCA9IHBvbHlmaWxsO1xuUHJvbWlzZS5Qcm9taXNlID0gUHJvbWlzZTtcblxucmV0dXJuIFByb21pc2U7XG5cbn0pKSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1lczYtcHJvbWlzZS5tYXAiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiZXhwb3J0IGNvbnN0IEVWRU5UUyA9IHtcclxuICBTSUdOSU46ICdTSUdOSU4nLFxyXG4gIFNJR05PVVQ6ICdTSUdOT1VUJyxcclxuICBTSUdOVVA6ICdTSUdOVVAnXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgVVJMUyA9IHtcclxuICB0b2tlbjogJ3Rva2VuJyxcclxuICBzaWdudXA6ICcxL3VzZXIvc2lnbnVwJyxcclxuICByZXF1ZXN0UmVzZXRQYXNzd29yZDogJzEvdXNlci9yZXF1ZXN0UmVzZXRQYXNzd29yZCcsXHJcbiAgcmVzZXRQYXNzd29yZDogJzEvdXNlci9yZXNldFBhc3N3b3JkJyxcclxuICBjaGFuZ2VQYXNzd29yZDogJzEvdXNlci9jaGFuZ2VQYXNzd29yZCcsXHJcbiAgLy8gc29jaWFsTG9naW5XaXRoQ29kZTogJzEvdXNlci9QUk9WSURFUi9jb2RlJyxcclxuICBzb2NpYWxTaWduaW5XaXRoVG9rZW46ICcxL3VzZXIvUFJPVklERVIvdG9rZW4nLFxyXG4gIC8vIHNvY2lhbFNpbmd1cFdpdGhDb2RlOiAnMS91c2VyL1BST1ZJREVSL3NpZ251cENvZGUnLFxyXG4gIHNpZ25vdXQ6ICcxL3VzZXIvc2lnbm91dCcsXHJcbiAgcHJvZmlsZTogJ2FwaS9hY2NvdW50L3Byb2ZpbGUnLFxyXG4gIG9iamVjdHM6ICcxL29iamVjdHMnLFxyXG4gIG9iamVjdHNBY3Rpb246ICcxL29iamVjdHMvYWN0aW9uJyxcclxuICBxdWVyeTogJzEvcXVlcnkvZGF0YScsXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgU09DSUFMX1BST1ZJREVSUyA9IHtcclxuICBnaXRodWI6IHtuYW1lOiAnZ2l0aHViJywgbGFiZWw6ICdHaXRodWInLCB1cmw6ICd3d3cuZ2l0aHViLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyM0NDQnfSwgaWQ6IDF9LFxyXG4gIGdvb2dsZToge25hbWU6ICdnb29nbGUnLCBsYWJlbDogJ0dvb2dsZScsIHVybDogJ3d3dy5nb29nbGUuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnI2RkNGIzOSd9LCBpZDogMn0sXHJcbiAgZmFjZWJvb2s6IHtuYW1lOiAnZmFjZWJvb2snLCBsYWJlbDogJ0ZhY2Vib29rJywgdXJsOiAnd3d3LmZhY2Vib29rLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyMzYjU5OTgnfSwgaWQ6IDN9LFxyXG4gIHR3aXR0ZXI6IHtuYW1lOiAndHdpdHRlcicsIGxhYmVsOiAnVHdpdHRlcicsIHVybDogJ3d3dy50d2l0dGVyLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyM1NWFjZWUnfSwgaWQ6IDR9XHJcbn07XHJcbiIsImV4cG9ydCBkZWZhdWx0IHtcclxuICBhcHBOYW1lOiBudWxsLFxyXG4gIGFub255bW91c1Rva2VuOiBudWxsLFxyXG4gIHNpZ25VcFRva2VuOiBudWxsLFxyXG4gIGFwaVVybDogJ2h0dHBzOi8vYXBpLmJhY2thbmQuY29tJyxcclxuICBzdG9yYWdlOiB3aW5kb3cubG9jYWxTdG9yYWdlLFxyXG4gIHN0b3JhZ2VQcmVmaXg6ICdCQUNLQU5EXycsXHJcbiAgbWFuYWdlUmVmcmVzaFRva2VuOiB0cnVlLFxyXG4gIHJ1blNpZ25pbkFmdGVyU2lnbnVwOiB0cnVlLFxyXG4gIHJ1blNvY2tldDogZmFsc2UsXHJcbiAgc29ja2V0VXJsOiAnaHR0cHM6Ly9zb2NrZXQuYmFja2FuZC5jb20nLFxyXG4gIGlzTW9iaWxlOiBmYWxzZSxcclxufTtcclxuIiwiZXhwb3J0IGNvbnN0IGZpbHRlciA9IHtcclxuICBjcmVhdGU6IChmaWVsZE5hbWUsIG9wZXJhdG9yLCB2YWx1ZSkgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcGVyYXRvcixcclxuICAgICAgdmFsdWVcclxuICAgIH1cclxuICB9LFxyXG4gIG9wZXJhdG9yczoge1xyXG4gICAgbnVtZXJpYzogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgZ3JlYXRlclRoYW46IFwiZ3JlYXRlclRoYW5cIiwgZ3JlYXRlclRoYW5PckVxdWFsc1RvOiBcImdyZWF0ZXJUaGFuT3JFcXVhbHNUb1wiLCBsZXNzVGhhbjogXCJsZXNzVGhhblwiLCBsZXNzVGhhbk9yRXF1YWxzVG86IFwibGVzc1RoYW5PckVxdWFsc1RvXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIGRhdGU6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIGdyZWF0ZXJUaGFuOiBcImdyZWF0ZXJUaGFuXCIsIGdyZWF0ZXJUaGFuT3JFcXVhbHNUbzogXCJncmVhdGVyVGhhbk9yRXF1YWxzVG9cIiwgbGVzc1RoYW46IFwibGVzc1RoYW5cIiwgbGVzc1RoYW5PckVxdWFsc1RvOiBcImxlc3NUaGFuT3JFcXVhbHNUb1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICB0ZXh0OiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBzdGFydHNXaXRoOiBcInN0YXJ0c1dpdGhcIiwgZW5kc1dpdGg6IFwiZW5kc1dpdGhcIiwgY29udGFpbnM6IFwiY29udGFpbnNcIiwgbm90Q29udGFpbnM6IFwibm90Q29udGFpbnNcIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgYm9vbGVhbjogeyBlcXVhbHM6IFwiZXF1YWxzXCIgfSxcclxuICAgIHJlbGF0aW9uOiB7IGluOiBcImluXCIgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNvcnQgPSB7XHJcbiAgY3JlYXRlOiAoZmllbGROYW1lLCBvcmRlcikgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcmRlclxyXG4gICAgfVxyXG4gIH0sXHJcbiAgb3JkZXJzOiB7IGFzYzogXCJhc2NcIiwgZGVzYzogXCJkZXNjXCIgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgZXhjbHVkZSA9IHtcclxuICBvcHRpb25zOiB7IG1ldGFkYXRhOiBcIm1ldGFkYXRhXCIsIHRvdGFsUm93czogXCJ0b3RhbFJvd3NcIiwgYWxsOiBcIm1ldGFkYXRhLHRvdGFsUm93c1wiIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFN0b3JhZ2VBYnN0cmFjdCB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICBpZiAodGhpcy5jb25zdHJ1Y3RvciA9PT0gU3RvcmFnZUFic3RyYWN0KSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW4gbm90IGNvbnN0cnVjdCBhYnN0cmFjdCBjbGFzcy5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zZXRJdGVtID09PSB1bmRlZmluZWQgfHwgdGhpcy5zZXRJdGVtID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLnNldEl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgc2V0SXRlbSBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuZ2V0SXRlbSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0SXRlbSA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5nZXRJdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIGdldEl0ZW0gbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJlbW92ZUl0ZW0gPT09IHVuZGVmaW5lZCB8fCB0aGlzLnJlbW92ZUl0ZW0gPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUucmVtb3ZlSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSByZW1vdmVJdGVtIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5jbGVhciA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuY2xlYXIgPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUuY2xlYXIpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgY2xlYXIgbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIC8vIHRoaXMuZGF0YSA9IHt9O1xyXG4gIH1cclxuICBzZXRJdGVtIChpZCwgdmFsKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIHNldEl0ZW0gZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyByZXR1cm4gdGhpcy5kYXRhW2lkXSA9IFN0cmluZyh2YWwpO1xyXG4gIH1cclxuICBnZXRJdGVtIChpZCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBnZXRJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gcmV0dXJuIHRoaXMuZGF0YS5oYXNPd25Qcm9wZXJ0eShpZCkgPyB0aGlzLl9kYXRhW2lkXSA6IG51bGw7XHJcbiAgfVxyXG4gIHJlbW92ZUl0ZW0gKGlkKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIHJlbW92ZUl0ZW0gZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyBkZWxldGUgdGhpcy5kYXRhW2lkXTtcclxuICAgIC8vIHJldHVybiBudWxsO1xyXG4gICB9XHJcbiAgY2xlYXIgKCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBjbGVhciBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIHJldHVybiB0aGlzLmRhdGEgPSB7fTtcclxuICAgfVxyXG59XHJcbiIsIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gKiBiYWNrYW5kIEphdmFTY3JpcHQgTGlicmFyeVxyXG4gKiBBdXRob3JzOiBiYWNrYW5kXHJcbiAqIExpY2Vuc2U6IE1JVCAoaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHApXHJcbiAqIENvbXBpbGVkIEF0OiAyNi8xMS8yMDE2XHJcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnXHJcbmltcG9ydCAqIGFzIGNvbnN0YW50cyBmcm9tICcuL2NvbnN0YW50cydcclxuaW1wb3J0ICogYXMgaGVscGVycyBmcm9tICcuL2hlbHBlcnMnXHJcbmltcG9ydCBTdG9yYWdlIGZyb20gJy4vdXRpbHMvc3RvcmFnZSdcclxuaW1wb3J0IEh0dHAgZnJvbSAnLi91dGlscy9odHRwJ1xyXG5pbXBvcnQgU29ja2V0IGZyb20gJy4vdXRpbHMvc29ja2V0J1xyXG5pbXBvcnQgYXV0aCBmcm9tICcuL3NlcnZpY2VzL2F1dGgnXHJcbmltcG9ydCBvYmplY3QgZnJvbSAnLi9zZXJ2aWNlcy9vYmplY3QnXHJcbmltcG9ydCBmaWxlIGZyb20gJy4vc2VydmljZXMvZmlsZSdcclxuaW1wb3J0IHF1ZXJ5IGZyb20gJy4vc2VydmljZXMvcXVlcnknXHJcbmltcG9ydCB1c2VyIGZyb20gJy4vc2VydmljZXMvdXNlcidcclxuXHJcbi8vIGdldCBkYXRhIGZyb20gdXJsIGluIHNvY2lhbCBzaWduLWluIHBvcHVwXHJcbi8vIGxldCBkYXRhTWF0Y2ggPSAvXFw/KGRhdGF8ZXJyb3IpPSguKykvLmV4ZWMod2luZG93LmxvY2F0aW9uLmhyZWYpO1xyXG5sZXQgZGF0YU1hdGNoID0gLyhkYXRhfGVycm9yKT0oLispLy5leGVjKHdpbmRvdy5sb2NhdGlvbi5ocmVmKTtcclxuaWYgKGRhdGFNYXRjaCAmJiBkYXRhTWF0Y2hbMV0gJiYgZGF0YU1hdGNoWzJdKSB7XHJcbiAgbGV0IGRhdGEgPSB7XHJcbiAgICBkYXRhOiBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChkYXRhTWF0Y2hbMl0ucmVwbGFjZSgvIy4qLywgJycpKSlcclxuICB9XHJcbiAgZGF0YS5zdGF0dXMgPSAoZGF0YU1hdGNoWzFdID09PSAnZGF0YScpID8gMjAwIDogMDtcclxuICB2YXIgaXNJRSA9IGZhbHNlIHx8ICEhZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xyXG4gIGlmICghaXNJRSkge1xyXG4gICAgd2luZG93Lm9wZW5lci5wb3N0TWVzc2FnZShKU09OLnN0cmluZ2lmeShkYXRhKSwgbG9jYXRpb24ub3JpZ2luKTtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnU09DSUFMX0RBVEEnLCBKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgfVxyXG59XHJcblxyXG5sZXQgYmFja2FuZCA9IHtcclxuICBjb25zdGFudHMsXHJcbiAgaGVscGVycyxcclxufVxyXG5iYWNrYW5kLmluaXQgPSAoY29uZmlnID0ge30pID0+IHtcclxuXHJcbiAgLy8gY29tYmluZSBkZWZhdWx0cyB3aXRoIHVzZXIgY29uZmlnXHJcbiAgT2JqZWN0LmFzc2lnbihkZWZhdWx0cywgY29uZmlnKTtcclxuICAvLyBjb25zb2xlLmxvZyhkZWZhdWx0cyk7XHJcblxyXG4gIC8vIHZlcmlmeSBuZXcgZGVmYXVsdHNcclxuICBpZiAoIWRlZmF1bHRzLmFwcE5hbWUpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwcE5hbWUgaXMgbWlzc2luZycpO1xyXG4gIGlmICghZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4pXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Fub255bW91c1Rva2VuIGlzIG1pc3NpbmcnKTtcclxuICBpZiAoIWRlZmF1bHRzLnNpZ25VcFRva2VuKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdzaWduVXBUb2tlbiBpcyBtaXNzaW5nJyk7XHJcblxyXG4gIC8vIGluaXQgdXRpbHNcclxuICBsZXQgdXRpbHMgPSB7XHJcbiAgICBzdG9yYWdlOiBuZXcgU3RvcmFnZShkZWZhdWx0cy5zdG9yYWdlLCBkZWZhdWx0cy5zdG9yYWdlUHJlZml4KSxcclxuICAgIGh0dHA6IEh0dHAuY3JlYXRlKHtcclxuICAgICAgYmFzZVVSTDogZGVmYXVsdHMuYXBpVXJsXHJcbiAgICB9KSxcclxuICAgIGlzSUU6IHdpbmRvdy5kb2N1bWVudCAmJiAoZmFsc2UgfHwgISFkb2N1bWVudC5kb2N1bWVudE1vZGUpLFxyXG4gICAgRU5WOiAnYnJvd3NlcicsXHJcbiAgfVxyXG4gIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgIHV0aWxzWydzb2NrZXQnXSA9IG5ldyBTb2NrZXQoZGVmYXVsdHMuc29ja2V0VXJsKTtcclxuICB9XHJcblxyXG4gIHV0aWxzLmh0dHAuY29uZmlnLmludGVyY2VwdG9ycyA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gICAgICBpZiAoY29uZmlnLnVybC5pbmRleE9mKGNvbnN0YW50cy5VUkxTLnRva2VuKSA9PT0gIC0xICYmIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKSkge1xyXG4gICAgICAgIGNvbmZpZy5oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnLmhlYWRlcnMsIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbilcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChlcnJvciwgY29uZmlnLCByZXNvbHZlLCByZWplY3QsIHNjYiwgZWNiKSB7XHJcbiAgICAgIGlmIChjb25maWcudXJsLmluZGV4T2YoY29uc3RhbnRzLlVSTFMudG9rZW4pID09PSAgLTFcclxuICAgICAgICYmIGRlZmF1bHRzLm1hbmFnZVJlZnJlc2hUb2tlblxyXG4gICAgICAgJiYgZXJyb3Iuc3RhdHVzID09PSA0MDFcclxuICAgICAgICYmIGVycm9yLmRhdGEgJiYgZXJyb3IuZGF0YS5NZXNzYWdlID09PSAnaW52YWxpZCBvciBleHBpcmVkIHRva2VuJykge1xyXG4gICAgICAgICBhdXRoLl9faGFuZGxlUmVmcmVzaFRva2VuX18uY2FsbCh1dGlscywgZXJyb3IpXHJcbiAgICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgICAgYmFja2FuZC51dGlscy5odHRwLnJlcXVlc3QoY29uZmlnLCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgfSlcclxuICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gZXhwb3NlIGJhY2thbmQgbmFtZXNwYWNlIHRvIHdpbmRvd1xyXG4gIGRlbGV0ZSBiYWNrYW5kLmluaXQ7XHJcbiAgT2JqZWN0LmFzc2lnbihcclxuICAgIGJhY2thbmQsXHJcbiAgICBhdXRoLFxyXG4gICAge1xyXG4gICAgICBvYmplY3QsXHJcbiAgICAgIGZpbGUsXHJcbiAgICAgIHF1ZXJ5LFxyXG4gICAgICB1c2VyLFxyXG4gICAgICB1dGlscyxcclxuICAgICAgZGVmYXVsdHMsXHJcbiAgICB9XHJcbiAgKTtcclxuICBpZihkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKSAmJiBiYWNrYW5kLnV0aWxzLnNvY2tldC5jb25uZWN0KFxyXG4gICAgICBiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiB8fCBudWxsLFxyXG4gICAgICBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbixcclxuICAgICAgZGVmYXVsdHMuYXBwTmFtZVxyXG4gICAgKTtcclxuICAgIE9iamVjdC5hc3NpZ24oYmFja2FuZCwge29uOiBiYWNrYW5kLnV0aWxzLnNvY2tldC5vbi5iaW5kKGJhY2thbmQudXRpbHMuc29ja2V0KX0pO1xyXG4gIH1cclxuXHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gYmFja2FuZFxyXG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcbmltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xyXG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi8uLi9kZWZhdWx0cydcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgX19oYW5kbGVSZWZyZXNoVG9rZW5fXyxcclxuICB1c2VBbm9ueW1vdXNBdXRoLFxyXG4gIHNpZ25pbixcclxuICBzaWdudXAsXHJcbiAgc29jaWFsU2lnbmluLFxyXG4gIHNvY2lhbFNpZ25pbldpdGhUb2tlbixcclxuICBzb2NpYWxTaWdudXAsXHJcbiAgcmVxdWVzdFJlc2V0UGFzc3dvcmQsXHJcbiAgcmVzZXRQYXNzd29yZCxcclxuICBjaGFuZ2VQYXNzd29yZCxcclxuICBzaWdub3V0LFxyXG4gIC8vIGdldFVzZXJEZXRhaWxzLFxyXG4gIGdldFNvY2lhbFByb3ZpZGVycyxcclxufVxyXG5cclxuZnVuY3Rpb24gX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fIChzdGF0dXMgPSAwLCBzdGF0dXNUZXh0ID0gJycsIGhlYWRlcnMgPSBbXSwgZGF0YSA9ICcnKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHN0YXR1cyxcclxuICAgIHN0YXR1c1RleHQsXHJcbiAgICBoZWFkZXJzLFxyXG4gICAgZGF0YVxyXG4gIH1cclxufVxyXG5mdW5jdGlvbiBfX2Rpc3BhdGNoRXZlbnRfXyAobmFtZSkge1xyXG4gIGxldCBldmVudDtcclxuICBpZihkZWZhdWx0cy5pc01vYmlsZSlcclxuICAgIHJldHVybjtcclxuICBpZiAoZG9jdW1lbnQuY3JlYXRlRXZlbnQpIHtcclxuICAgIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XHJcbiAgICBldmVudC5pbml0RXZlbnQobmFtZSwgdHJ1ZSwgdHJ1ZSk7XHJcbiAgICBldmVudC5ldmVudE5hbWUgPSBuYW1lO1xyXG4gICAgd2luZG93LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBldmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50T2JqZWN0KCk7XHJcbiAgICBldmVudC5ldmVudFR5cGUgPSBuYW1lO1xyXG4gICAgZXZlbnQuZXZlbnROYW1lID0gbmFtZTtcclxuICAgIHdpbmRvdy5maXJlRXZlbnQoJ29uJyArIGV2ZW50LmV2ZW50VHlwZSwgZXZlbnQpO1xyXG4gIH1cclxufVxyXG5mdW5jdGlvbiBfX2hhbmRsZVJlZnJlc2hUb2tlbl9fIChlcnJvcikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlciB8fCAhdXNlci5kZXRhaWxzLnJlZnJlc2hfdG9rZW4pIHtcclxuICAgICAgcmVqZWN0KF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdObyBjYWNoZWQgdXNlciBvciByZWZyZXNoVG9rZW4gZm91bmQuIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBfX3NpZ25pbldpdGhUb2tlbl9fKHtcclxuICAgICAgICB1c2VybmFtZTogdXNlci5kZXRhaWxzLnVzZXJuYW1lLFxyXG4gICAgICAgIHJlZnJlc2hUb2tlbjogdXNlci5kZXRhaWxzLnJlZnJlc2hfdG9rZW4sXHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9KVxyXG59O1xyXG5mdW5jdGlvbiB1c2VBbm9ueW1vdXNBdXRoIChzY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRldGFpbHMgPSB7XHJcbiAgICAgIFwiYWNjZXNzX3Rva2VuXCI6IGRlZmF1bHRzLmFub255bW91c1Rva2VuLFxyXG4gICAgICBcInRva2VuX3R5cGVcIjogXCJBbm9ueW1vdXNUb2tlblwiLFxyXG4gICAgICBcImV4cGlyZXNfaW5cIjogMCxcclxuICAgICAgXCJhcHBOYW1lXCI6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgIFwidXNlcm5hbWVcIjogXCJHdWVzdFwiLFxyXG4gICAgICBcInJvbGVcIjogXCJVc2VyXCIsXHJcbiAgICAgIFwiZmlyc3ROYW1lXCI6IFwiYW5vbnltb3VzXCIsXHJcbiAgICAgIFwibGFzdE5hbWVcIjogXCJhbm9ueW1vdXNcIixcclxuICAgICAgXCJmdWxsTmFtZVwiOiBcIlwiLFxyXG4gICAgICBcInJlZ0lkXCI6IDAgLFxyXG4gICAgICBcInVzZXJJZFwiOiBudWxsXHJcbiAgICB9XHJcbiAgICBiYWNrYW5kLnV0aWxzLnN0b3JhZ2Uuc2V0KCd1c2VyJywge1xyXG4gICAgICB0b2tlbjoge1xyXG4gICAgICAgIEFub255bW91c1Rva2VuOiBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlblxyXG4gICAgICB9LFxyXG4gICAgICBkZXRhaWxzLFxyXG4gICAgfSk7XHJcbiAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgYmFja2FuZC51dGlscy5zb2NrZXQuY29ubmVjdChudWxsLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSk7XHJcbiAgICB9XHJcbiAgICBzY2IgJiYgc2NiKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCBkZXRhaWxzKSk7XHJcbiAgICByZXNvbHZlKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCBkZXRhaWxzKSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gc2lnbmluICh1c2VybmFtZSwgcGFzc3dvcmQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYHVzZXJuYW1lPSR7dXNlcm5hbWV9JnBhc3N3b3JkPSR7cGFzc3dvcmR9JmFwcE5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSZncmFudF90eXBlPXBhc3N3b3JkYFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgYmFja2FuZC51dGlscy5zb2NrZXQuY29ubmVjdChiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHNpZ251cCAoZW1haWwsIHBhc3N3b3JkLCBjb25maXJtUGFzc3dvcmQsIGZpcnN0TmFtZSwgbGFzdE5hbWUsIHBhcmFtZXRlcnMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnNpZ251cCxcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnU2lnblVwVG9rZW4nOiBkZWZhdWx0cy5zaWduVXBUb2tlblxyXG4gICAgICB9LFxyXG4gICAgICBkYXRhOiB7XHJcbiAgICAgICAgZmlyc3ROYW1lLFxyXG4gICAgICAgIGxhc3ROYW1lLFxyXG4gICAgICAgIGVtYWlsLFxyXG4gICAgICAgIHBhc3N3b3JkLFxyXG4gICAgICAgIGNvbmZpcm1QYXNzd29yZCxcclxuICAgICAgICBwYXJhbWV0ZXJzXHJcbiAgICAgIH1cclxuICAgIH0sIHNjYiAsIGVjYilcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05VUCk7XHJcbiAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgcmV0dXJuIHNpZ25pbihyZXNwb25zZS5kYXRhLnVzZXJuYW1lLCBwYXNzd29yZCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIF9fZ2V0U29jaWFsVXJsX18gKHByb3ZpZGVyTmFtZSwgaXNTaWdudXAsIGlzQXV0b1NpZ25VcCkge1xyXG4gIGxldCBwcm92aWRlciA9IFNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJOYW1lXTtcclxuICBsZXQgYWN0aW9uID0gaXNTaWdudXAgPyAndXAnIDogJ2luJztcclxuICBsZXQgYXV0b1NpZ25VcFBhcmFtID0gYCZzaWdudXBJZk5vdFNpZ25lZEluPSR7KCFpc1NpZ251cCAmJiBpc0F1dG9TaWduVXApID8gJ3RydWUnIDogJ2ZhbHNlJ31gO1xyXG4gIHJldHVybiBgL3VzZXIvc29jaWFsU2lnbiR7YWN0aW9ufT9wcm92aWRlcj0ke3Byb3ZpZGVyLmxhYmVsfSR7YXV0b1NpZ25VcFBhcmFtfSZyZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD1zZWxmJnJlZGlyZWN0X3VyaT0ke3Byb3ZpZGVyLnVybH0mc3RhdGU9YDtcclxufVxyXG5mdW5jdGlvbiBfX3NvY2lhbEF1dGhfXyAocHJvdmlkZXIsIGlzU2lnblVwLCBzcGVjLCBlbWFpbCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBpZiAoIVNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJdKSB7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBTb2NpYWwgUHJvdmlkZXInKSk7XHJcbiAgICB9XHJcbiAgICBsZXQgdXJsID0gIGAke2RlZmF1bHRzLmFwaVVybH0vMS8ke19fZ2V0U29jaWFsVXJsX18ocHJvdmlkZXIsIGlzU2lnblVwLCB0cnVlKX0mYXBwbmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JHtlbWFpbCA/ICcmZW1haWw9JytlbWFpbCA6ICcnfSZyZXR1cm5BZGRyZXNzPWAgLy8gJHtsb2NhdGlvbi5ocmVmfVxuICAgIGxldCBwb3B1cCA9IG51bGw7XG4gICAgaWYgKCFiYWNrYW5kLnV0aWxzLmlzSUUpIHtcbiAgICAgIHBvcHVwID0gd2luZG93Lm9wZW4odXJsLCAnc29jaWFscG9wdXAnLCBzcGVjKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBwb3B1cCA9IHdpbmRvdy5vcGVuKCcnLCAnJywgc3BlYyk7XG4gICAgICBwb3B1cC5sb2NhdGlvbiA9IHVybDtcbiAgICB9XG4gICAgaWYgKHBvcHVwICYmIHBvcHVwLmZvY3VzKSB7IHBvcHVwLmZvY3VzKCkgfVxyXG5cclxuICAgIGxldCBoYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgICBsZXQgdXJsID0gZS50eXBlID09PSAnbWVzc2FnZScgPyBlLm9yaWdpbiA6IGUudXJsO1xyXG4gICAgICAvLyBpZS1sb2NhdGlvbi1vcmlnaW4tcG9seWZpbGxcclxuICAgICAgaWYgKCF3aW5kb3cubG9jYXRpb24ub3JpZ2luKSB7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLm9yaWdpbiA9IHdpbmRvdy5sb2NhdGlvbi5wcm90b2NvbCArIFwiLy9cIiArIHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZSArICh3aW5kb3cubG9jYXRpb24ucG9ydCA/ICc6JyArIHdpbmRvdy5sb2NhdGlvbi5wb3J0OiAnJyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHVybC5pbmRleE9mKHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4pID09PSAtMSkge1xyXG4gICAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBPcmlnaW4gTWVzc2FnZScpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlcyA9IGUudHlwZSA9PT0gJ21lc3NhZ2UnID8gSlNPTi5wYXJzZShlLmRhdGEpIDogSlNPTi5wYXJzZShlLm5ld1ZhbHVlKTtcclxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBoYW5kbGVyLCBmYWxzZSk7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gICAgICBpZiAocG9wdXAgJiYgcG9wdXAuY2xvc2UpIHsgcG9wdXAuY2xvc2UoKSB9XHJcbiAgICAgIGUudHlwZSA9PT0gJ3N0b3JhZ2UnICYmIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGUua2V5KTtcclxuXHJcbiAgICAgIGlmIChyZXMuc3RhdHVzICE9IDIwMCkge1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHJlc29sdmUocmVzKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgaGFuZGxlciA9IGhhbmRsZXIuYmluZChwb3B1cCk7XHJcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3N0b3JhZ2UnLCBoYW5kbGVyICwgZmFsc2UpO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHNvY2lhbFNpZ25pbiAocHJvdmlkZXIsIHNjYiwgZWNiLCBzcGVjID0gJ2xlZnQ9MSwgdG9wPTEsIHdpZHRoPTUwMCwgaGVpZ2h0PTU2MCcpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgX19zb2NpYWxBdXRoX18ocHJvdmlkZXIsIGZhbHNlLCBzcGVjLCAnJylcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fKHtcclxuICAgICAgICAgIGFjY2Vzc1Rva2VuOiByZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlblxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgfSk7XHJcbn07XHJcbmZ1bmN0aW9uIHNvY2lhbFNpZ25pbldpdGhUb2tlbiAocHJvdmlkZXIsIHRva2VuLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc29jaWFsU2lnbmluV2l0aFRva2VuLnJlcGxhY2UoJ1BST1ZJREVSJywgcHJvdmlkZXIpLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBwYXJhbXM6IHtcclxuICAgICAgICBhY2Nlc3NUb2tlbjogdG9rZW4sXHJcbiAgICAgICAgYXBwTmFtZTogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgICBzaWdudXBJZk5vdFNpZ25lZEluOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgYmFja2FuZC51dGlscy5zb2NrZXQuY29ubmVjdChiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIFRPRE86UEFUQ0hcclxuICAgICAgYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgICAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vdXNlcnNgLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICBmaWx0ZXI6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwiZmllbGROYW1lXCI6IFwiZW1haWxcIixcclxuICAgICAgICAgICAgICBcIm9wZXJhdG9yXCI6IFwiZXF1YWxzXCIsXHJcbiAgICAgICAgICAgICAgXCJ2YWx1ZVwiOiByZXNwb25zZS5kYXRhLnVzZXJuYW1lXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihwYXRjaCA9PiB7XHJcbiAgICAgICAgbGV0IHtpZCwgZmlyc3ROYW1lLCBsYXN0TmFtZX0gPSBwYXRjaC5kYXRhLmRhdGFbMF07XG4gICAgICAgIGxldCB1c2VyID0gYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpO1xuICAgICAgICBsZXQgbmV3RGV0YWlscyA9ICB7dXNlcklkOiBpZC50b1N0cmluZygpLCBmaXJzdE5hbWUsIGxhc3ROYW1lfTtcbiAgICAgICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcbiAgICAgICAgICB0b2tlbjogdXNlci50b2tlbixcbiAgICAgICAgICBkZXRhaWxzOiBPYmplY3QuYXNzaWduKHt9LCB1c2VyLmRldGFpbHMsIG5ld0RldGFpbHMpXG4gICAgICAgIH0pO1xuICAgICAgICB1c2VyID0gYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgICAgIGxldCByZXMgPSBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18ocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCByZXNwb25zZS5oZWFkZXJzLCB1c2VyLmRldGFpbHMpO1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIEVPUFxyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn07XHJcbmZ1bmN0aW9uIHNvY2lhbFNpZ251cCAocHJvdmlkZXIsIGVtYWlsLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fKHByb3ZpZGVyLCB0cnVlLCBzcGVjLCBlbWFpbClcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgICByZXR1cm4gX19zaWduaW5XaXRoVG9rZW5fXyh7XHJcbiAgICAgICAgICAgIGFjY2Vzc1Rva2VuOiByZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlblxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxuXHJcbn1cclxuZnVuY3Rpb24gX19zaWduaW5XaXRoVG9rZW5fXyAodG9rZW5EYXRhKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGxldCBkYXRhID0gW107XHJcbiAgICBmb3IgKGxldCBvYmogaW4gdG9rZW5EYXRhKSB7XHJcbiAgICAgICAgZGF0YS5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChvYmopICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHRva2VuRGF0YVtvYmpdKSk7XHJcbiAgICB9XHJcbiAgICBkYXRhID0gZGF0YS5qb2luKFwiJlwiKTtcclxuXHJcbiAgICBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMudG9rZW4sXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnXHJcbiAgICAgIH0sXHJcbiAgICAgIGRhdGE6IGAke2RhdGF9JmFwcE5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSZncmFudF90eXBlPXBhc3N3b3JkYFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgYmFja2FuZC51dGlscy5zb2NrZXQuY29ubmVjdChiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHJlcXVlc3RSZXNldFBhc3N3b3JkICh1c2VybmFtZSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXF1ZXN0UmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGFwcE5hbWU6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgICAgdXNlcm5hbWVcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiByZXNldFBhc3N3b3JkIChuZXdQYXNzd29yZCwgcmVzZXRUb2tlbiwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXNldFBhc3N3b3JkLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgbmV3UGFzc3dvcmQsXHJcbiAgICAgICAgcmVzZXRUb2tlblxyXG4gICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmZ1bmN0aW9uIGNoYW5nZVBhc3N3b3JkIChvbGRQYXNzd29yZCwgbmV3UGFzc3dvcmQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMuY2hhbmdlUGFzc3dvcmQsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBvbGRQYXNzd29yZCxcclxuICAgICAgICBuZXdQYXNzd29yZFxyXG4gICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmZ1bmN0aW9uIHNpZ25vdXQgKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc2lnbm91dCxcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIH0pXHJcbiAgICBiYWNrYW5kLnV0aWxzLnN0b3JhZ2UucmVtb3ZlKCd1c2VyJyk7XHJcbiAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc29ja2V0LmRpc2Nvbm5lY3QoKTtcclxuICAgIH1cclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOT1VUKTtcclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKSkpO1xyXG4gICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpKSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gZ2V0U29jaWFsUHJvdmlkZXJzIChzY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgc2NiICYmIHNjYihTT0NJQUxfUFJPVklERVJTKTtcclxuICAgIHJlc29sdmUoU09DSUFMX1BST1ZJREVSUyk7XHJcbiAgfSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgVVJMUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gIHVwbG9hZCxcbiAgcmVtb3ZlLFxufVxuXG5mdW5jdGlvbiB1cGxvYWQgKG9iamVjdCwgZmlsZUFjdGlvbiwgZmlsZW5hbWUsIGZpbGVkYXRhLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgZmlsZW5hbWUsXHJcbiAgICAgICAgZmlsZWRhdGE6IGZpbGVkYXRhLnN1YnN0cihmaWxlZGF0YS5pbmRleE9mKCcsJykgKyAxLCBmaWxlZGF0YS5sZW5ndGgpXHJcbiAgICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgZmlsZUFjdGlvbiwgZmlsZW5hbWUsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHtmaWxlQWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdERUxFVEUnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGZpbGVuYW1lLFxyXG4gICAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cbiIsImltcG9ydCB7IFVSTFMgfSBmcm9tICcuLy4uL2NvbnN0YW50cydcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICBnZXRMaXN0LFxyXG4gIGNyZWF0ZSxcclxuICBnZXRPbmUsXHJcbiAgdXBkYXRlLFxyXG4gIHJlbW92ZSxcclxuICBhY3Rpb246IHtcclxuICAgIGdldCxcclxuICAgIHBvc3QsXHJcbiAgfSxcclxufVxyXG5cclxuZnVuY3Rpb24gX19hbGxvd2VkUGFyYW1zX18gKGFsbG93ZWRQYXJhbXMsIHBhcmFtcykge1xyXG4gIGxldCBuZXdQYXJhbXMgPSB7fTtcclxuICBmb3IgKGxldCBwYXJhbSBpbiBwYXJhbXMpIHtcclxuICAgIGlmIChhbGxvd2VkUGFyYW1zLmluZGV4T2YocGFyYW0pICE9IC0xKSB7XHJcbiAgICAgIG5ld1BhcmFtc1twYXJhbV0gPSBwYXJhbXNbcGFyYW1dO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXR1cm4gbmV3UGFyYW1zO1xyXG59XHJcbmZ1bmN0aW9uIGdldExpc3QgKG9iamVjdCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncGFnZVNpemUnLCdwYWdlTnVtYmVyJywnZmlsdGVyJywnc29ydCcsJ3NlYXJjaCcsJ2V4Y2x1ZGUnLCdkZWVwJywncmVsYXRlZE9iamVjdHMnXTtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBudWxsLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGxldCB0b3RhbFJvd3MgPSByZXNwb25zZS5kYXRhWyd0b3RhbFJvd3MnXTtcclxuICAgICAgcmVzcG9uc2UuZGF0YSA9IHJlc3BvbnNlLmRhdGFbJ2RhdGEnXTtcclxuICAgICAgc2NiICYmIHNjYihyZXNwb25zZSwgdG90YWxSb3dzKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSk7XHJcbn1cclxuZnVuY3Rpb24gY3JlYXRlIChvYmplY3QsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmZ1bmN0aW9uIGdldE9uZSAob2JqZWN0LCBpZCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsnZGVlcCcsJ2V4Y2x1ZGUnLCdsZXZlbCddO1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHN9LyR7b2JqZWN0fS8ke2lkfWAsXHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmZ1bmN0aW9uIHVwZGF0ZSAob2JqZWN0LCBpZCwgZGF0YSwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncmV0dXJuT2JqZWN0JywnZGVlcCddO1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHN9LyR7b2JqZWN0fS8ke2lkfWAsXHJcbiAgICBtZXRob2Q6ICdQVVQnLFxyXG4gICAgZGF0YSxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgaWQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ0RFTEVURScsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldCAob2JqZWN0LCBhY3Rpb24sIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7YWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgcGFyYW1zLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG5mdW5jdGlvbiBwb3N0IChvYmplY3QsIGFjdGlvbiwgZGF0YSwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xuICAgIHVybDogYCR7VVJMUy5vYmplY3RzQWN0aW9ufS8ke29iamVjdH0/bmFtZT0ke2FjdGlvbn1gLFxuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGRhdGEsXG4gICAgcGFyYW1zLFxuICB9LCBzY2IsIGVjYilcbn1cbiIsImltcG9ydCB7IFVSTFMgfSBmcm9tICcuLy4uL2NvbnN0YW50cydcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICBnZXQsXHJcbiAgcG9zdCxcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0IChuYW1lLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5xdWVyeX0vJHtuYW1lfWAsXHJcbiAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgcGFyYW1zLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmZ1bmN0aW9uIHBvc3QgKG5hbWUsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLnF1ZXJ5fS8ke25hbWV9YCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YSxcclxuICAgIHBhcmFtcyxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcbmltcG9ydCB7IFVSTFMgfSBmcm9tICcuLy4uL2NvbnN0YW50cydcclxuXHJcbmV4cG9ydCBkZWZhdWx0IHtcclxuICBnZXRVc2VyRGV0YWlscyxcclxuICBnZXRVc2VybmFtZSxcclxuICBnZXRVc2VyUm9sZSxcclxuICBnZXRUb2tlbixcclxuICBnZXRSZWZyZXNoVG9rZW4sXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXyAoc3RhdHVzID0gMCwgc3RhdHVzVGV4dCA9ICcnLCBoZWFkZXJzID0gW10sIGRhdGEgPSAnJykge1xyXG4gIHJldHVybiB7XHJcbiAgICBzdGF0dXMsXHJcbiAgICBzdGF0dXNUZXh0LFxyXG4gICAgaGVhZGVycyxcclxuICAgIGRhdGFcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18gKHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGxldCB1c2VyID0gYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgaWYgKCF1c2VyKSB7XHJcbiAgICAgIGVjYiAmJiBlY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnTm8gY2FjaGVkIHVzZXIgZm91bmQuIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xuICAgICAgc2NiICYmIHNjYihfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdXNlci5kZXRhaWxzKSk7XHJcbiAgICAgIHJlc29sdmUoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHVzZXIuZGV0YWlscykpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIGdldFVzZXJEZXRhaWxzIChzY2IsIGVjYiwgZm9yY2UgPSBmYWxzZSkge1xyXG4gIGlmICghZm9yY2UpIHtcclxuICAgIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXyhzY2IsIGVjYik7XHJcbiAgfVxyXG4gIGVsc2Uge1xyXG4gICAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy5wcm9maWxlLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgbGV0IHVzZXIgPSBiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJyk7XHJcbiAgICAgIGxldCBuZXdEZXRhaWxzID0gcmVzcG9uc2UuZGF0YTtcclxuICAgICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjogdXNlci50b2tlbixcclxuICAgICAgICBkZXRhaWxzOiBPYmplY3QuYXNzaWduKHt9LCB1c2VyLmRldGFpbHMsIG5ld0RldGFpbHMpXHJcbiAgICAgIH0pO1xyXG4gICAgICByZXR1cm4gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18oc2NiLCBlY2IpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbmZ1bmN0aW9uIGdldFVzZXJuYW1lIChzY2IsIGVjYikge1xyXG4gIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXyhudWxsLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHJlc3BvbnNlLmRhdGEgPSByZXNwb25zZS5kYXRhWyd1c2VybmFtZSddO1xyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSk7XHJcbn1cclxuZnVuY3Rpb24gZ2V0VXNlclJvbGUgKCkge1xyXG4gIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXyhudWxsLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHJlc3BvbnNlLmRhdGEgPSByZXNwb25zZS5kYXRhWydyb2xlJ107XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXR1cm4gcmVzcG9uc2U7XHJcbiAgICB9KTtcclxufVxyXG5mdW5jdGlvbiBnZXRUb2tlbiAoKSB7XHJcbiAgcmV0dXJuIF9fZ2V0VXNlckRldGFpbHNGcm9tU3RvcmFnZV9fKG51bGwsIGVjYilcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgcmVzcG9uc2UuZGF0YSA9IHJlc3BvbnNlLmRhdGFbJ2FjY2Vzc190b2tlbiddO1xyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSk7XHJcbn1cclxuZnVuY3Rpb24gZ2V0UmVmcmVzaFRva2VuICgpIHtcclxuICByZXR1cm4gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18obnVsbCwgZWNiKVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICByZXNwb25zZS5kYXRhID0gcmVzcG9uc2UuZGF0YVsncmVmcmVzaF90b2tlbiddO1xyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgUHJvbWlzZSB9IGZyb20gJ2VzNi1wcm9taXNlJ1xyXG5cclxuY2xhc3MgSHR0cCB7XHJcbiAgY29uc3RydWN0b3IgKGNvbmZpZyA9IHt9KSB7XHJcbiAgICBpZiAoIXdpbmRvdy5YTUxIdHRwUmVxdWVzdClcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdYTUxIdHRwUmVxdWVzdCBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoaXMgcGxhdGZvcm0nKTtcclxuXHJcbiAgICB0aGlzLmNvbmZpZyA9IE9iamVjdC5hc3NpZ24oe1xyXG4gICAgICAvLyB1cmw6ICcvJyxcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgaGVhZGVyczoge30sXHJcbiAgICAgIHBhcmFtczoge30sXHJcbiAgICAgIGludGVyY2VwdG9yczoge30sXHJcbiAgICAgIHdpdGhDcmVkZW50aWFsczogZmFsc2UsXHJcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2pzb24nLFxyXG4gICAgICAvLyB0aW1lb3V0OiBudWxsLFxyXG4gICAgICBhdXRoOiB7XHJcbiAgICAgICB1c2VybmFtZTogbnVsbCxcclxuICAgICAgIHBhc3N3b3JkOiBudWxsXHJcbiAgICAgIH1cclxuICAgIH0sIGNvbmZpZylcclxuICB9XHJcbiAgX2dldEhlYWRlcnMgKGhlYWRlcnMpIHtcclxuICAgIHJldHVybiBoZWFkZXJzLnNwbGl0KCdcXHJcXG4nKS5maWx0ZXIoaGVhZGVyID0+IGhlYWRlcikubWFwKGhlYWRlciA9PiB7XHJcbiAgICAgIGxldCBqaGVhZGVyID0ge31cclxuICAgICAgbGV0IHBhcnRzID0gaGVhZGVyLnNwbGl0KCc6Jyk7XHJcbiAgICAgIGpoZWFkZXJbcGFydHNbMF1dID0gcGFydHNbMV1cclxuICAgICAgcmV0dXJuIGpoZWFkZXI7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgX2dldERhdGEgKHR5cGUsIGRhdGEpIHtcclxuICAgIGlmICghdHlwZSkge1xyXG4gICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHR5cGUuaW5kZXhPZignanNvbicpID09PSAtMSkge1xyXG4gICAgICByZXR1cm4gZGF0YTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICByZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcclxuICAgIH1cclxuICB9XHJcbiAgX2NyZWF0ZVJlc3BvbnNlIChyZXEsIGNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiByZXEuc3RhdHVzLFxyXG4gICAgICBzdGF0dXNUZXh0OiByZXEuc3RhdHVzVGV4dCxcclxuICAgICAgaGVhZGVyczogdGhpcy5fZ2V0SGVhZGVycyhyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpLFxyXG4gICAgICBjb25maWcsXHJcbiAgICAgIGRhdGE6IHRoaXMuX2dldERhdGEocmVxLmdldFJlc3BvbnNlSGVhZGVyKFwiQ29udGVudC1UeXBlXCIpLCByZXEucmVzcG9uc2VUZXh0KSxcclxuICAgIH1cclxuICB9XHJcbiAgX2hhbmRsZUVycm9yIChkYXRhLCBjb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1czogMCxcclxuICAgICAgc3RhdHVzVGV4dDogJ0VSUk9SJyxcclxuICAgICAgaGVhZGVyczogW10sXHJcbiAgICAgIGNvbmZpZyxcclxuICAgICAgZGF0YSxcclxuICAgIH1cclxuICB9XHJcbiAgX2VuY29kZVBhcmFtcyAocGFyYW1zKSB7XHJcbiAgICBsZXQgcGFyYW1zQXJyID0gW107XHJcbiAgICBmb3IgKGxldCBwYXJhbSBpbiBwYXJhbXMpIHtcbiAgICAgIGxldCB2YWwgPSBwYXJhbXNbcGFyYW1dO1xuICAgICAgaWYgKHR5cGVvZiB2YWwgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgdmFsID0gSlNPTi5zdHJpbmdpZnkodmFsKTtcclxuICAgICAgfVxyXG4gICAgICBwYXJhbXNBcnIucHVzaChgJHtwYXJhbX09JHtlbmNvZGVVUklDb21wb25lbnQodmFsKX1gKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBhcmFtc0Fyci5qb2luKCcmJyk7XHJcbiAgfVxyXG4gIF9zZXRIZWFkZXJzIChyZXEsIGhlYWRlcnMpIHtcclxuICAgIGZvciAobGV0IGhlYWRlciBpbiBoZWFkZXJzKSB7XHJcbiAgICAgIHJlcS5zZXRSZXF1ZXN0SGVhZGVyKGhlYWRlciwgaGVhZGVyc1toZWFkZXJdKTtcclxuICAgIH1cclxuICB9XHJcbiAgX3NldERhdGEgKHJlcSwgZGF0YSkge1xyXG4gICAgaWYgKCFkYXRhKSB7XHJcbiAgICAgIHJlcS5zZW5kKCk7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh0eXBlb2YgZGF0YSAhPSAnb2JqZWN0Jykge1xyXG4gICAgICByZXEuc2VuZChkYXRhKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICByZXEuc2V0UmVxdWVzdEhlYWRlcihcIkNvbnRlbnQtVHlwZVwiLCBcImFwcGxpY2F0aW9uL2pzb247Y2hhcnNldD1VVEYtOFwiKTtcclxuICAgICAgcmVxLnNlbmQoSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xyXG4gICAgfVxyXG4gIH1cclxuICByZXF1ZXN0IChjZmcsIHNjYiAsIGVjYikge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHJcbiAgICAgIGxldCByZXEgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcclxuICAgICAgbGV0IGNvbmZpZyA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuY29uZmlnLCBjZmcpO1xyXG5cclxuICAgICAgaWYgKCFjb25maWcudXJsIHx8IHR5cGVvZiBjb25maWcudXJsICE9PSAnc3RyaW5nJyB8fCBjb25maWcudXJsLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcigndXJsIHBhcmFtZXRlciBpcyBtaXNzaW5nJywgY29uZmlnKTtcclxuICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGNvbmZpZy53aXRoQ3JlZGVudGlhbHMpIHsgcmVxLndpdGhDcmVkZW50aWFscyA9IHRydWUgfVxyXG4gICAgICBpZiAoY29uZmlnLnRpbWVvdXQpIHsgcmVxLnRpbWVvdXQgPSB0cnVlIH1cclxuICAgICAgY29uZmlnLmludGVyY2VwdG9ycy5yZXF1ZXN0ICYmIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVxdWVzdC5jYWxsKHRoaXMsIGNvbmZpZyk7XHJcbiAgICAgIGxldCBwYXJhbXMgPSB0aGlzLl9lbmNvZGVQYXJhbXMoY29uZmlnLnBhcmFtcyk7XHJcbiAgICAgIHJlcS5vcGVuKGNvbmZpZy5tZXRob2QsIGAke2NvbmZpZy5iYXNlVVJMID8gY29uZmlnLmJhc2VVUkwrJy8nIDogJyd9JHtjb25maWcudXJsfSR7cGFyYW1zID8gJz8nK3BhcmFtcyA6ICcnfWAsIHRydWUsIGNvbmZpZy5hdXRoLnVzZXJuYW1lLCBjb25maWcuYXV0aC5wYXNzd29yZCk7XHJcbiAgICAgIHJlcS5vbnRpbWVvdXQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBsZXQgcmVzID0gdGhpcy5faGFuZGxlRXJyb3IoJ3RpbWVvdXQnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfTtcclxuICAgICAgcmVxLm9uYWJvcnQgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICBsZXQgcmVzID0gdGhpcy5faGFuZGxlRXJyb3IoJ2Fib3J0JywgY29uZmlnKTtcclxuICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH07XHJcbiAgICAgIHJlcS5vbnJlYWR5c3RhdGVjaGFuZ2UgPSAoKSA9PiB7XHJcbiAgICAgICAgaWYgKHJlcS5yZWFkeVN0YXRlID09IFhNTEh0dHBSZXF1ZXN0LkRPTkUpIHtcclxuICAgICAgICAgIGxldCByZXMgPSB0aGlzLl9jcmVhdGVSZXNwb25zZShyZXEsIGNvbmZpZyk7XHJcbiAgICAgICAgICBpZiAocmVzLnN0YXR1cyA9PT0gMjAwKXtcclxuICAgICAgICAgICAgaWYgKGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2UpIHtcclxuICAgICAgICAgICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlLmNhbGwodGhpcywgcmVzLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZUVycm9yKSB7XHJcbiAgICAgICAgICAgICAgY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZUVycm9yLmNhbGwodGhpcywgcmVzLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICB0aGlzLl9zZXRIZWFkZXJzKHJlcSwgY29uZmlnLmhlYWRlcnMpO1xyXG4gICAgICB0aGlzLl9zZXREYXRhKHJlcSwgY29uZmlnLmRhdGEpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxufVxyXG5mdW5jdGlvbiBjcmVhdGVJbnN0YW5jZShjb25maWcgPSB7fSkge1xyXG4gIHZhciBjb250ZXh0ID0gbmV3IEh0dHAoY29uZmlnKTtcclxuICB2YXIgaW5zdGFuY2UgPSAoLi4uYXJncykgPT4gSHR0cC5wcm90b3R5cGUucmVxdWVzdC5hcHBseShjb250ZXh0LCBhcmdzKTtcclxuICBpbnN0YW5jZS5jb25maWcgPSBjb250ZXh0LmNvbmZpZztcclxuICByZXR1cm4gaW5zdGFuY2U7XHJcbn1cclxuXHJcbnZhciBodHRwID0gY3JlYXRlSW5zdGFuY2UoKTtcclxuaHR0cC5jcmVhdGUgPSAoY29uZmlnKSA9PiB7XHJcbiAgcmV0dXJuIGNyZWF0ZUluc3RhbmNlKGNvbmZpZyk7XHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBodHRwO1xyXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTb2NrZXQge1xyXG4gIGNvbnN0cnVjdG9yICh1cmwpIHtcclxuICAgIGlmICghd2luZG93LmlvKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3J1blNvY2tldCBpcyB0cnVlIGJ1dCBzb2NrZXRpby1jbGllbnQgaXMgbm90IGluY2x1ZGVkJyk7XHJcbiAgICB0aGlzLnVybCA9IHVybDtcbiAgICB0aGlzLm9uQXJyID0gW107XG4gICAgdGhpcy5zb2NrZXQgPSBudWxsO1xuICB9XHJcbiAgb24gKGV2ZW50TmFtZSwgY2FsbGJhY2spIHtcclxuICAgIHRoaXMub25BcnIucHVzaCh7ZXZlbnROYW1lLCBjYWxsYmFja30pO1xyXG4gIH1cclxuICBjb25uZWN0ICh0b2tlbiwgYW5vbnltb3VzVG9rZW4sIGFwcE5hbWUpIHtcclxuICAgIHRoaXMuZGlzY29ubmVjdCgpO1xyXG4gICAgdGhpcy5zb2NrZXQgPSBpby5jb25uZWN0KHRoaXMudXJsLCB7J2ZvcmNlTmV3Jzp0cnVlIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdjb25uZWN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHRyeWluZyB0byBlc3RhYmxpc2ggYSBzb2NrZXQgY29ubmVjdGlvbiB0byAke2FwcE5hbWV9IC4uLmApO1xyXG4gICAgICB0aGlzLnNvY2tldC5lbWl0KFwibG9naW5cIiwgdG9rZW4sIGFub255bW91c1Rva2VuLCBhcHBOYW1lKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdhdXRob3JpemVkJywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCBjb25uZWN0ZWRgKTtcclxuICAgICAgdGhpcy5vbkFyci5mb3JFYWNoKGZuID0+IHtcclxuICAgICAgICB0aGlzLnNvY2tldC5vbihmbi5ldmVudE5hbWUsIGRhdGEgPT4ge1xyXG4gICAgICAgICAgZm4uY2FsbGJhY2soZGF0YSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ25vdEF1dGhvcml6ZWQnLCAoKSA9PiB7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5kaXNjb25uZWN0KCksIDEwMDApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ2Rpc2Nvbm5lY3QnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUuaW5mbyhgc29ja2V0IGRpc2Nvbm5lY3RgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdyZWNvbm5lY3RpbmcnLCAoKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUuaW5mbyhgc29ja2V0IHJlY29ubmVjdGluZ2ApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5zb2NrZXQub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XHJcbiAgICAgIGNvbnNvbGUud2FybihgZXJyb3I6ICR7ZXJyb3J9YCk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgZGlzY29ubmVjdCAoKSB7XHJcbiAgICBpZiAodGhpcy5zb2NrZXQpIHtcclxuICAgICAgdGhpcy5zb2NrZXQuY2xvc2UoKTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU3RvcmFnZSB7XHJcbiAgY29uc3RydWN0b3IgKHN0b3JhZ2UsIHByZWZpeCA9ICcnKSB7XHJcbiAgICBpZiAoIXN0b3JhZ2UpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHByb3ZpZGVkIFN0b3JhZ2UgaXMgbm90IHN1cHBvcnRlZCBieSB0aGlzIHBsYXRmb3JtJyk7XHJcbiAgICBpZiAoIXN0b3JhZ2Uuc2V0SXRlbSB8fCAhc3RvcmFnZS5nZXRJdGVtIHx8ICFzdG9yYWdlLnJlbW92ZUl0ZW0gfHwgIXN0b3JhZ2UuY2xlYXIpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHByb3ZpZGVkIFN0b3JhZ2Ugbm90IGltcGxlbWVudCB0aGUgbmVjZXNzYXJ5IGZ1bmN0aW9ucycpO1xyXG4gICAgdGhpcy5zdG9yYWdlID0gc3RvcmFnZTtcclxuICAgIHRoaXMucHJlZml4ID0gcHJlZml4O1xyXG4gICAgdGhpcy5kZWxpbWl0ZXIgPSAnX19fX19fX19fXyc7XHJcbiAgfVxyXG4gIGdldCAoa2V5KSB7XHJcbiAgICBsZXQgaXRlbSA9IHRoaXMuc3RvcmFnZS5nZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWApO1xyXG4gICAgaWYgKCFpdGVtKSB7XHJcbiAgICAgIHJldHVybiBpdGVtXHJcbiAgICB9XHJcbiAgICBlbHNlIHtcbiAgICAgIGxldCBbdHlwZSwgdmFsXSA9IGl0ZW0uc3BsaXQodGhpcy5kZWxpbWl0ZXIpO1xuICAgICAgaWYgKHR5cGUgIT0gJ0pTT04nKSB7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UodmFsKTtcbiAgICAgIH1cbiAgICB9XHJcbiAgfVxyXG4gIHNldCAoa2V5LCB2YWwpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsICE9ICdvYmplY3QnKSB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWAsIGBTVFJJTkcke3RoaXMuZGVsaW1pdGVyfSR7dmFsfWApO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXRJdGVtKGAke3RoaXMucHJlZml4fSR7a2V5fWAsIGBKU09OJHt0aGlzLmRlbGltaXRlcn0ke0pTT04uc3RyaW5naWZ5KHZhbCl9YCk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJlbW92ZSAoa2V5KSB7XHJcbiAgICB0aGlzLnN0b3JhZ2UucmVtb3ZlSXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICB9XHJcbiAgY2xlYXIgKCkge1xyXG4gICAgZm9yKHZhciBpID0wOyBpIDwgdGhpcy5zdG9yYWdlLmxlbmd0aDsgaSsrKXtcclxuICAgICAgIGlmKHRoaXMuc3RvcmFnZS5nZXRJdGVtKHRoaXMuc3RvcmFnZS5rZXkoaSkpLmluZGV4T2YodGhpcy5wcmVmaXgpICE9IC0xKVxyXG4gICAgICAgIHRoaXMucmVtb3ZlKHRoaXMuc3RvcmFnZS5rZXkoaSkpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiJdfQ==
