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
  objects: '1/objects',
  objectsAction: '1/objects/action',
  // socialLoginWithCode: '1/user/PROVIDER/code',
  // socialSingupWithCode: '1/user/PROVIDER/signupCode',
  socialSigninWithToken: '1/user/PROVIDER/token',
  profile: '/api/account/profile'
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

var auth = _interopRequireWildcard(_auth);

var _crud = require('./services/crud');

var crud = _interopRequireWildcard(_crud);

var _files = require('./services/files');

var files = _interopRequireWildcard(_files);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

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

  // init globals
  var storage = new _storage2.default(_defaults2.default.storage, _defaults2.default.storagePrefix);
  var http = _http2.default.create({
    baseURL: _defaults2.default.apiUrl
  });
  var scope = {
    storage: storage,
    http: http,
    isIE: window.document && (false || !!document.documentMode)
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

  // get data from url in social sign-in popup
  if (!_defaults2.default.isMobile) {
    var dataMatch = /\?(data|error)=(.+)/.exec(window.location.href);
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
  }

  // expose backand namespace to window
  delete backand.init;
  _extends(backand, service);
  if (_defaults2.default.runSocket) {
    storage.get('user') && socket.connect(storage.get('user').token.Authorization || null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    _extends(backand, { on: socket.on.bind(socket) });
  }
};

module.exports = backand;

},{"./constants":3,"./defaults":4,"./helpers":5,"./services/auth":7,"./services/crud":8,"./services/files":9,"./utils/http":10,"./utils/socket":11,"./utils/storage":12}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.__handleRefreshToken__ = __handleRefreshToken__;
exports.useAnonymousAuth = useAnonymousAuth;
exports.signin = signin;
exports.signup = signup;
exports.socialSignin = socialSignin;
exports.socialSigninWithToken = socialSigninWithToken;
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
      "username": "Guest",
      "role": "User",
      "firstName": "anonymous",
      "lastName": "anonymous",
      "fullName": "",
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
function signup(email, password, confirmPassword, firstName, lastName) {
  var parameters = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : {};

  var _this4 = this;

  var scb = arguments[6];
  var ecb = arguments[7];

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
        confirmPassword: confirmPassword,
        parameters: parameters
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
      if (url.indexOf(window.location.href) === -1) {
        reject(__generateFakeResponse__(0, '', [], 'Unknown Origin Message'));
      }

      var res = e.type === 'message' ? JSON.parse(e.data) : JSON.parse(e.newValue);
      window.removeEventListener(e.type, _handler, false);
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
function socialSigninWithToken(provider, token, scb, ecb) {
  var _this7 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    _this7.http({
      url: _constants.URLS.socialSigninWithToken.replace('PROVIDER', provider),
      method: 'GET',
      params: {
        accessToken: token,
        appName: _defaults2.default.appName,
        signupIfNotSignedIn: true
      }
    }).then(function (response) {
      _this7.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        _this7.socket.connect(_this7.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
      }
      // TODO:PATCH
      _this7.http({
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

        var user = _this7.storage.get('user');
        var newDetails = { userId: id.toString(), firstName: firstName, lastName: lastName };
        _this7.storage.set('user', {
          token: user.token,
          details: _extends({}, user.details, newDetails)
        });
        user = _this7.storage.get('user');
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
  var _this8 = this;

  var spec = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 'left=1, top=1, width=500, height=560';

  return new _es6Promise.Promise(function (resolve, reject) {
    __socialAuth__.call(_this8, provider, true, spec, email).then(function (response) {
      __dispatchEvent__(_constants.EVENTS.SIGNUP);
      if (_defaults2.default.runSigninAfterSignup) {
        return __signinWithToken__.call(_this8, {
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
  var _this9 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var data = [];
    for (var obj in tokenData) {
      data.push(encodeURIComponent(obj) + '=' + encodeURIComponent(tokenData[obj]));
    }
    data = data.join("&");

    _this9.http({
      url: _constants.URLS.token,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data + '&appName=' + _defaults2.default.appName + '&grant_type=password'
    }).then(function (response) {
      _this9.storage.set('user', {
        token: {
          Authorization: 'Bearer ' + response.data.access_token
        },
        details: response.data
      });
      __dispatchEvent__(_constants.EVENTS.SIGNIN);
      if (_defaults2.default.runSocket) {
        _this9.socket.connect(_this9.storage.get('user').token.Authorization, _defaults2.default.anonymousToken, _defaults2.default.appName);
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
  var _this10 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    _this10.storage.remove('user');
    if (_defaults2.default.runSocket) {
      _this10.socket.disconnect();
    }
    __dispatchEvent__(_constants.EVENTS.SIGNOUT);
    scb && scb(__generateFakeResponse__(200, 'OK', [], _this10.storage.get('user')));
    resolve(__generateFakeResponse__(200, 'OK', [], _this10.storage.get('user')));
  });
}
function __getUserDetailsFromStorage__() {
  var _this11 = this;

  return new _es6Promise.Promise(function (resolve, reject) {
    var user = _this11.storage.get('user');
    if (!user) {
      reject(__generateFakeResponse__(0, '', [], 'No cached user found. authentication is required.'));
    } else {
      resolve(__generateFakeResponse__(200, 'OK', [], user.details));
    }
  });
}
function getUserDetails(scb, ecb) {
  var _this12 = this;

  var force = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  return new _es6Promise.Promise(function (resolve, reject) {
    if (force) {
      _this12.http({
        url: _constants.URLS.profile,
        method: 'GET'
      }).then(function (response) {
        var user = _this12.storage.get('user');
        var newDetails = response.data;
        _this12.storage.set('user', {
          token: user.token,
          details: _extends({}, user.details, newDetails)
        });
        return __getUserDetailsFromStorage__.call(_this12);
      }).then(function (response) {
        scb && scb(response);
        resolve(response);
      }).catch(function (error) {
        ecb && ecb(error);
        reject(error);
      });
    } else {
      __getUserDetailsFromStorage__.call(_this12).then(function (response) {
        scb && scb(response);
        resolve(response);
      }).catch(function (error) {
        ecb && ecb(error);
        reject(error);
      });
    }
  });
}

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

window.http = window.http || http;

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGNydWQuanMiLCJzcmNcXHNlcnZpY2VzXFxmaWxlcy5qcyIsInNyY1xcdXRpbHNcXGh0dHAuanMiLCJzcmNcXHV0aWxzXFxzb2NrZXQuanMiLCJzcmNcXHV0aWxzXFxzdG9yYWdlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwb0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcExPLElBQU0sMEJBQVM7QUFDcEIsVUFBUSxRQURZO0FBRXBCLFdBQVMsU0FGVztBQUdwQixVQUFRO0FBSFksQ0FBZjs7QUFNQSxJQUFNLHNCQUFPO0FBQ2xCLFNBQU8sT0FEVztB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SyxPQUFMLENBQWEsR0FBYixDQUFpQixDQUFqQixDQUFyQixFQUEwQyxPQUExQyxDQUFrRCxLQUFLLE1BQXZELEtBQWtFLENBQUMsQ0FBdEUsRUFDQyxLQUFLLE1BQUwsQ0FBWSxLQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLENBQWpCLENBQVo7QUFDSDtBQUNGOzs7Ozs7a0JBekNrQixPIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9zdGVmYW5wZW5uZXIvZXM2LXByb21pc2UvbWFzdGVyL0xJQ0VOU0VcbiAqIEB2ZXJzaW9uICAgNC4wLjVcbiAqL1xuXG4oZnVuY3Rpb24gKGdsb2JhbCwgZmFjdG9yeSkge1xuICAgIHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyA/IG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpIDpcbiAgICB0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuICAgIChnbG9iYWwuRVM2UHJvbWlzZSA9IGZhY3RvcnkoKSk7XG59KHRoaXMsIChmdW5jdGlvbiAoKSB7ICd1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNGdW5jdGlvbih4KSB7XG4gIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJztcbn1cblxudmFyIF9pc0FycmF5ID0gdW5kZWZpbmVkO1xuaWYgKCFBcnJheS5pc0FycmF5KSB7XG4gIF9pc0FycmF5ID0gZnVuY3Rpb24gKHgpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9O1xufSBlbHNlIHtcbiAgX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xufVxuXG52YXIgaXNBcnJheSA9IF9pc0FycmF5O1xuXG52YXIgbGVuID0gMDtcbnZhciB2ZXJ0eE5leHQgPSB1bmRlZmluZWQ7XG52YXIgY3VzdG9tU2NoZWR1bGVyRm4gPSB1bmRlZmluZWQ7XG5cbnZhciBhc2FwID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gIHF1ZXVlW2xlbl0gPSBjYWxsYmFjaztcbiAgcXVldWVbbGVuICsgMV0gPSBhcmc7XG4gIGxlbiArPSAyO1xuICBpZiAobGVuID09PSAyKSB7XG4gICAgLy8gSWYgbGVuIGlzIDIsIHRoYXQgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHNjaGVkdWxlIGFuIGFzeW5jIGZsdXNoLlxuICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgLy8gd2lsbCBiZSBwcm9jZXNzZWQgYnkgdGhpcyBmbHVzaCB0aGF0IHdlIGFyZSBzY2hlZHVsaW5nLlxuICAgIGlmIChjdXN0b21TY2hlZHVsZXJGbikge1xuICAgICAgY3VzdG9tU2NoZWR1bGVyRm4oZmx1c2gpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlZHVsZUZsdXNoKCk7XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBzZXRTY2hlZHVsZXIoc2NoZWR1bGVGbikge1xuICBjdXN0b21TY2hlZHVsZXJGbiA9IHNjaGVkdWxlRm47XG59XG5cbmZ1bmN0aW9uIHNldEFzYXAoYXNhcEZuKSB7XG4gIGFzYXAgPSBhc2FwRm47XG59XG5cbnZhciBicm93c2VyV2luZG93ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG52YXIgYnJvd3Nlckdsb2JhbCA9IGJyb3dzZXJXaW5kb3cgfHwge307XG52YXIgQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSBicm93c2VyR2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIgfHwgYnJvd3Nlckdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyO1xudmFyIGlzTm9kZSA9IHR5cGVvZiBzZWxmID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgKHt9KS50b1N0cmluZy5jYWxsKHByb2Nlc3MpID09PSAnW29iamVjdCBwcm9jZXNzXSc7XG5cbi8vIHRlc3QgZm9yIHdlYiB3b3JrZXIgYnV0IG5vdCBpbiBJRTEwXG52YXIgaXNXb3JrZXIgPSB0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBpbXBvcnRTY3JpcHRzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4vLyBub2RlXG5mdW5jdGlvbiB1c2VOZXh0VGljaygpIHtcbiAgLy8gbm9kZSB2ZXJzaW9uIDAuMTAueCBkaXNwbGF5cyBhIGRlcHJlY2F0aW9uIHdhcm5pbmcgd2hlbiBuZXh0VGljayBpcyB1c2VkIHJlY3Vyc2l2ZWx5XG4gIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vY3Vqb2pzL3doZW4vaXNzdWVzLzQxMCBmb3IgZGV0YWlsc1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBwcm9jZXNzLm5leHRUaWNrKGZsdXNoKTtcbiAgfTtcbn1cblxuLy8gdmVydHhcbmZ1bmN0aW9uIHVzZVZlcnR4VGltZXIoKSB7XG4gIGlmICh0eXBlb2YgdmVydHhOZXh0ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2ZXJ0eE5leHQoZmx1c2gpO1xuICAgIH07XG4gIH1cblxuICByZXR1cm4gdXNlU2V0VGltZW91dCgpO1xufVxuXG5mdW5jdGlvbiB1c2VNdXRhdGlvbk9ic2VydmVyKCkge1xuICB2YXIgaXRlcmF0aW9ucyA9IDA7XG4gIHZhciBvYnNlcnZlciA9IG5ldyBCcm93c2VyTXV0YXRpb25PYnNlcnZlcihmbHVzaCk7XG4gIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICBvYnNlcnZlci5vYnNlcnZlKG5vZGUsIHsgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIG5vZGUuZGF0YSA9IGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyO1xuICB9O1xufVxuXG4vLyB3ZWIgd29ya2VyXG5mdW5jdGlvbiB1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgdmFyIGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBmbHVzaDtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlU2V0VGltZW91dCgpIHtcbiAgLy8gU3RvcmUgc2V0VGltZW91dCByZWZlcmVuY2Ugc28gZXM2LXByb21pc2Ugd2lsbCBiZSB1bmFmZmVjdGVkIGJ5XG4gIC8vIG90aGVyIGNvZGUgbW9kaWZ5aW5nIHNldFRpbWVvdXQgKGxpa2Ugc2lub24udXNlRmFrZVRpbWVycygpKVxuICB2YXIgZ2xvYmFsU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGdsb2JhbFNldFRpbWVvdXQoZmx1c2gsIDEpO1xuICB9O1xufVxuXG52YXIgcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG5mdW5jdGlvbiBmbHVzaCgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkgKz0gMikge1xuICAgIHZhciBjYWxsYmFjayA9IHF1ZXVlW2ldO1xuICAgIHZhciBhcmcgPSBxdWV1ZVtpICsgMV07XG5cbiAgICBjYWxsYmFjayhhcmcpO1xuXG4gICAgcXVldWVbaV0gPSB1bmRlZmluZWQ7XG4gICAgcXVldWVbaSArIDFdID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgbGVuID0gMDtcbn1cblxuZnVuY3Rpb24gYXR0ZW1wdFZlcnR4KCkge1xuICB0cnkge1xuICAgIHZhciByID0gcmVxdWlyZTtcbiAgICB2YXIgdmVydHggPSByKCd2ZXJ0eCcpO1xuICAgIHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgcmV0dXJuIHVzZVZlcnR4VGltZXIoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1c2VTZXRUaW1lb3V0KCk7XG4gIH1cbn1cblxudmFyIHNjaGVkdWxlRmx1c2ggPSB1bmRlZmluZWQ7XG4vLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuaWYgKGlzTm9kZSkge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTmV4dFRpY2soKTtcbn0gZWxzZSBpZiAoQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU11dGF0aW9uT2JzZXJ2ZXIoKTtcbn0gZWxzZSBpZiAoaXNXb3JrZXIpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU1lc3NhZ2VDaGFubmVsKCk7XG59IGVsc2UgaWYgKGJyb3dzZXJXaW5kb3cgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICBzY2hlZHVsZUZsdXNoID0gYXR0ZW1wdFZlcnR4KCk7XG59IGVsc2Uge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlU2V0VGltZW91dCgpO1xufVxuXG5mdW5jdGlvbiB0aGVuKG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gIHZhciBfYXJndW1lbnRzID0gYXJndW1lbnRzO1xuXG4gIHZhciBwYXJlbnQgPSB0aGlzO1xuXG4gIHZhciBjaGlsZCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKG5vb3ApO1xuXG4gIGlmIChjaGlsZFtQUk9NSVNFX0lEXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbWFrZVByb21pc2UoY2hpbGQpO1xuICB9XG5cbiAgdmFyIF9zdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgaWYgKF9zdGF0ZSkge1xuICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY2FsbGJhY2sgPSBfYXJndW1lbnRzW19zdGF0ZSAtIDFdO1xuICAgICAgYXNhcChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBpbnZva2VDYWxsYmFjayhfc3RhdGUsIGNoaWxkLCBjYWxsYmFjaywgcGFyZW50Ll9yZXN1bHQpO1xuICAgICAgfSk7XG4gICAgfSkoKTtcbiAgfSBlbHNlIHtcbiAgICBzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICB9XG5cbiAgcmV0dXJuIGNoaWxkO1xufVxuXG4vKipcbiAgYFByb21pc2UucmVzb2x2ZWAgcmV0dXJucyBhIHByb21pc2UgdGhhdCB3aWxsIGJlY29tZSByZXNvbHZlZCB3aXRoIHRoZVxuICBwYXNzZWQgYHZhbHVlYC4gSXQgaXMgc2hvcnRoYW5kIGZvciB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHJlc29sdmUoMSk7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gdmFsdWUgPT09IDFcbiAgfSk7XG4gIGBgYFxuXG4gIEluc3RlYWQgb2Ygd3JpdGluZyB0aGUgYWJvdmUsIHlvdXIgY29kZSBub3cgc2ltcGx5IGJlY29tZXMgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKDEpO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gdmFsdWUgPT09IDFcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgcmVzb2x2ZVxuICBAc3RhdGljXG4gIEBwYXJhbSB7QW55fSB2YWx1ZSB2YWx1ZSB0aGF0IHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVzb2x2ZWQgd2l0aFxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHdpbGwgYmVjb21lIGZ1bGZpbGxlZCB3aXRoIHRoZSBnaXZlblxuICBgdmFsdWVgXG4qL1xuZnVuY3Rpb24gcmVzb2x2ZShvYmplY3QpIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICBpZiAob2JqZWN0ICYmIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnICYmIG9iamVjdC5jb25zdHJ1Y3RvciA9PT0gQ29uc3RydWN0b3IpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG4gIF9yZXNvbHZlKHByb21pc2UsIG9iamVjdCk7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG52YXIgUFJPTUlTRV9JRCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygxNik7XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG52YXIgUEVORElORyA9IHZvaWQgMDtcbnZhciBGVUxGSUxMRUQgPSAxO1xudmFyIFJFSkVDVEVEID0gMjtcblxudmFyIEdFVF9USEVOX0VSUk9SID0gbmV3IEVycm9yT2JqZWN0KCk7XG5cbmZ1bmN0aW9uIHNlbGZGdWxmaWxsbWVudCgpIHtcbiAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoXCJZb3UgY2Fubm90IHJlc29sdmUgYSBwcm9taXNlIHdpdGggaXRzZWxmXCIpO1xufVxuXG5mdW5jdGlvbiBjYW5ub3RSZXR1cm5Pd24oKSB7XG4gIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJyk7XG59XG5cbmZ1bmN0aW9uIGdldFRoZW4ocHJvbWlzZSkge1xuICB0cnkge1xuICAgIHJldHVybiBwcm9taXNlLnRoZW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICByZXR1cm4gR0VUX1RIRU5fRVJST1I7XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gIHRyeSB7XG4gICAgdGhlbi5jYWxsKHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlLCB0aGVuKSB7XG4gIGFzYXAoZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICB2YXIgc2VhbGVkID0gZmFsc2U7XG4gICAgdmFyIGVycm9yID0gdHJ5VGhlbih0aGVuLCB0aGVuYWJsZSwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICBpZiAoc2VhbGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICBpZiAodGhlbmFibGUgIT09IHZhbHVlKSB7XG4gICAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIGlmIChzZWFsZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc2VhbGVkID0gdHJ1ZTtcblxuICAgICAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0sICdTZXR0bGU6ICcgKyAocHJvbWlzZS5fbGFiZWwgfHwgJyB1bmtub3duIHByb21pc2UnKSk7XG5cbiAgICBpZiAoIXNlYWxlZCAmJiBlcnJvcikge1xuICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgIH1cbiAgfSwgcHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlKSB7XG4gIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IEZVTEZJTExFRCkge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gIH0gZWxzZSBpZiAodGhlbmFibGUuX3N0YXRlID09PSBSRUpFQ1RFRCkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gIH0gZWxzZSB7XG4gICAgc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgcmV0dXJuIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICByZXR1cm4gX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbiQkKSB7XG4gIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yICYmIHRoZW4kJCA9PT0gdGhlbiAmJiBtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yLnJlc29sdmUgPT09IHJlc29sdmUpIHtcbiAgICBoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAodGhlbiQkID09PSBHRVRfVEhFTl9FUlJPUikge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgfSBlbHNlIGlmICh0aGVuJCQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICB9IGVsc2UgaWYgKGlzRnVuY3Rpb24odGhlbiQkKSkge1xuICAgICAgaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4kJCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgc2VsZkZ1bGZpbGxtZW50KCkpO1xuICB9IGVsc2UgaWYgKG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCB2YWx1ZSwgZ2V0VGhlbih2YWx1ZSkpO1xuICB9IGVsc2Uge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHB1Ymxpc2hSZWplY3Rpb24ocHJvbWlzZSkge1xuICBpZiAocHJvbWlzZS5fb25lcnJvcikge1xuICAgIHByb21pc2UuX29uZXJyb3IocHJvbWlzZS5fcmVzdWx0KTtcbiAgfVxuXG4gIHB1Ymxpc2gocHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZS5fcmVzdWx0ID0gdmFsdWU7XG4gIHByb21pc2UuX3N0YXRlID0gRlVMRklMTEVEO1xuXG4gIGlmIChwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggIT09IDApIHtcbiAgICBhc2FwKHB1Ymxpc2gsIHByb21pc2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIHJldHVybjtcbiAgfVxuICBwcm9taXNlLl9zdGF0ZSA9IFJFSkVDVEVEO1xuICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgYXNhcChwdWJsaXNoUmVqZWN0aW9uLCBwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gIHZhciBfc3Vic2NyaWJlcnMgPSBwYXJlbnQuX3N1YnNjcmliZXJzO1xuICB2YXIgbGVuZ3RoID0gX3N1YnNjcmliZXJzLmxlbmd0aDtcblxuICBwYXJlbnQuX29uZXJyb3IgPSBudWxsO1xuXG4gIF9zdWJzY3JpYmVyc1tsZW5ndGhdID0gY2hpbGQ7XG4gIF9zdWJzY3JpYmVyc1tsZW5ndGggKyBGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgX3N1YnNjcmliZXJzW2xlbmd0aCArIFJFSkVDVEVEXSA9IG9uUmVqZWN0aW9uO1xuXG4gIGlmIChsZW5ndGggPT09IDAgJiYgcGFyZW50Ll9zdGF0ZSkge1xuICAgIGFzYXAocHVibGlzaCwgcGFyZW50KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwdWJsaXNoKHByb21pc2UpIHtcbiAgdmFyIHN1YnNjcmliZXJzID0gcHJvbWlzZS5fc3Vic2NyaWJlcnM7XG4gIHZhciBzZXR0bGVkID0gcHJvbWlzZS5fc3RhdGU7XG5cbiAgaWYgKHN1YnNjcmliZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBjaGlsZCA9IHVuZGVmaW5lZCxcbiAgICAgIGNhbGxiYWNrID0gdW5kZWZpbmVkLFxuICAgICAgZGV0YWlsID0gcHJvbWlzZS5fcmVzdWx0O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3Vic2NyaWJlcnMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICBjaGlsZCA9IHN1YnNjcmliZXJzW2ldO1xuICAgIGNhbGxiYWNrID0gc3Vic2NyaWJlcnNbaSArIHNldHRsZWRdO1xuXG4gICAgaWYgKGNoaWxkKSB7XG4gICAgICBpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgfVxuICB9XG5cbiAgcHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoID0gMDtcbn1cblxuZnVuY3Rpb24gRXJyb3JPYmplY3QoKSB7XG4gIHRoaXMuZXJyb3IgPSBudWxsO1xufVxuXG52YXIgVFJZX0NBVENIX0VSUk9SID0gbmV3IEVycm9yT2JqZWN0KCk7XG5cbmZ1bmN0aW9uIHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gY2FsbGJhY2soZGV0YWlsKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIFRSWV9DQVRDSF9FUlJPUi5lcnJvciA9IGU7XG4gICAgcmV0dXJuIFRSWV9DQVRDSF9FUlJPUjtcbiAgfVxufVxuXG5mdW5jdGlvbiBpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gIHZhciBoYXNDYWxsYmFjayA9IGlzRnVuY3Rpb24oY2FsbGJhY2spLFxuICAgICAgdmFsdWUgPSB1bmRlZmluZWQsXG4gICAgICBlcnJvciA9IHVuZGVmaW5lZCxcbiAgICAgIHN1Y2NlZWRlZCA9IHVuZGVmaW5lZCxcbiAgICAgIGZhaWxlZCA9IHVuZGVmaW5lZDtcblxuICBpZiAoaGFzQ2FsbGJhY2spIHtcbiAgICB2YWx1ZSA9IHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpO1xuXG4gICAgaWYgKHZhbHVlID09PSBUUllfQ0FUQ0hfRVJST1IpIHtcbiAgICAgIGZhaWxlZCA9IHRydWU7XG4gICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgdmFsdWUgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBjYW5ub3RSZXR1cm5Pd24oKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhbHVlID0gZGV0YWlsO1xuICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gIH1cblxuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICAvLyBub29wXG4gIH0gZWxzZSBpZiAoaGFzQ2FsbGJhY2sgJiYgc3VjY2VlZGVkKSB7XG4gICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChmYWlsZWQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gRlVMRklMTEVEKSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IFJFSkVDVEVEKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxpemVQcm9taXNlKHByb21pc2UsIHJlc29sdmVyKSB7XG4gIHRyeSB7XG4gICAgcmVzb2x2ZXIoZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UodmFsdWUpIHtcbiAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9LCBmdW5jdGlvbiByZWplY3RQcm9taXNlKHJlYXNvbikge1xuICAgICAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCBlKTtcbiAgfVxufVxuXG52YXIgaWQgPSAwO1xuZnVuY3Rpb24gbmV4dElkKCkge1xuICByZXR1cm4gaWQrKztcbn1cblxuZnVuY3Rpb24gbWFrZVByb21pc2UocHJvbWlzZSkge1xuICBwcm9taXNlW1BST01JU0VfSURdID0gaWQrKztcbiAgcHJvbWlzZS5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gIHByb21pc2UuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgcHJvbWlzZS5fc3Vic2NyaWJlcnMgPSBbXTtcbn1cblxuZnVuY3Rpb24gRW51bWVyYXRvcihDb25zdHJ1Y3RvciwgaW5wdXQpIHtcbiAgdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICB0aGlzLnByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG5cbiAgaWYgKCF0aGlzLnByb21pc2VbUFJPTUlTRV9JRF0pIHtcbiAgICBtYWtlUHJvbWlzZSh0aGlzLnByb21pc2UpO1xuICB9XG5cbiAgaWYgKGlzQXJyYXkoaW5wdXQpKSB7XG4gICAgdGhpcy5faW5wdXQgPSBpbnB1dDtcbiAgICB0aGlzLmxlbmd0aCA9IGlucHV0Lmxlbmd0aDtcbiAgICB0aGlzLl9yZW1haW5pbmcgPSBpbnB1dC5sZW5ndGg7XG5cbiAgICB0aGlzLl9yZXN1bHQgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuXG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sZW5ndGggPSB0aGlzLmxlbmd0aCB8fCAwO1xuICAgICAgdGhpcy5fZW51bWVyYXRlKCk7XG4gICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBfcmVqZWN0KHRoaXMucHJvbWlzZSwgdmFsaWRhdGlvbkVycm9yKCkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRpb25FcnJvcigpIHtcbiAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fZW51bWVyYXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gIHZhciBfaW5wdXQgPSB0aGlzLl9pbnB1dDtcblxuICBmb3IgKHZhciBpID0gMDsgdGhpcy5fc3RhdGUgPT09IFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdGhpcy5fZWFjaEVudHJ5KF9pbnB1dFtpXSwgaSk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9lYWNoRW50cnkgPSBmdW5jdGlvbiAoZW50cnksIGkpIHtcbiAgdmFyIGMgPSB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yO1xuICB2YXIgcmVzb2x2ZSQkID0gYy5yZXNvbHZlO1xuXG4gIGlmIChyZXNvbHZlJCQgPT09IHJlc29sdmUpIHtcbiAgICB2YXIgX3RoZW4gPSBnZXRUaGVuKGVudHJ5KTtcblxuICAgIGlmIChfdGhlbiA9PT0gdGhlbiAmJiBlbnRyeS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICAgIHRoaXMuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIF90aGVuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLl9yZW1haW5pbmctLTtcbiAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgIH0gZWxzZSBpZiAoYyA9PT0gUHJvbWlzZSkge1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgYyhub29wKTtcbiAgICAgIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgZW50cnksIF90aGVuKTtcbiAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChwcm9taXNlLCBpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KG5ldyBjKGZ1bmN0aW9uIChyZXNvbHZlJCQpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUkJChlbnRyeSk7XG4gICAgICB9KSwgaSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuX3dpbGxTZXR0bGVBdChyZXNvbHZlJCQoZW50cnkpLCBpKTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uIChzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgdmFyIHByb21pc2UgPSB0aGlzLnByb21pc2U7XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlID09PSBQRU5ESU5HKSB7XG4gICAgdGhpcy5fcmVtYWluaW5nLS07XG5cbiAgICBpZiAoc3RhdGUgPT09IFJFSkVDVEVEKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fcmVzdWx0W2ldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX3dpbGxTZXR0bGVBdCA9IGZ1bmN0aW9uIChwcm9taXNlLCBpKSB7XG4gIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICBzdWJzY3JpYmUocHJvbWlzZSwgdW5kZWZpbmVkLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gZW51bWVyYXRvci5fc2V0dGxlZEF0KEZVTEZJTExFRCwgaSwgdmFsdWUpO1xuICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgcmV0dXJuIGVudW1lcmF0b3IuX3NldHRsZWRBdChSRUpFQ1RFRCwgaSwgcmVhc29uKTtcbiAgfSk7XG59O1xuXG4vKipcbiAgYFByb21pc2UuYWxsYCBhY2NlcHRzIGFuIGFycmF5IG9mIHByb21pc2VzLCBhbmQgcmV0dXJucyBhIG5ldyBwcm9taXNlIHdoaWNoXG4gIGlzIGZ1bGZpbGxlZCB3aXRoIGFuIGFycmF5IG9mIGZ1bGZpbGxtZW50IHZhbHVlcyBmb3IgdGhlIHBhc3NlZCBwcm9taXNlcywgb3JcbiAgcmVqZWN0ZWQgd2l0aCB0aGUgcmVhc29uIG9mIHRoZSBmaXJzdCBwYXNzZWQgcHJvbWlzZSB0byBiZSByZWplY3RlZC4gSXQgY2FzdHMgYWxsXG4gIGVsZW1lbnRzIG9mIHRoZSBwYXNzZWQgaXRlcmFibGUgdG8gcHJvbWlzZXMgYXMgaXQgcnVucyB0aGlzIGFsZ29yaXRobS5cblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gcmVzb2x2ZSgxKTtcbiAgbGV0IHByb21pc2UyID0gcmVzb2x2ZSgyKTtcbiAgbGV0IHByb21pc2UzID0gcmVzb2x2ZSgzKTtcbiAgbGV0IHByb21pc2VzID0gWyBwcm9taXNlMSwgcHJvbWlzZTIsIHByb21pc2UzIF07XG5cbiAgUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24oYXJyYXkpe1xuICAgIC8vIFRoZSBhcnJheSBoZXJlIHdvdWxkIGJlIFsgMSwgMiwgMyBdO1xuICB9KTtcbiAgYGBgXG5cbiAgSWYgYW55IG9mIHRoZSBgcHJvbWlzZXNgIGdpdmVuIHRvIGBhbGxgIGFyZSByZWplY3RlZCwgdGhlIGZpcnN0IHByb21pc2VcbiAgdGhhdCBpcyByZWplY3RlZCB3aWxsIGJlIGdpdmVuIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSByZXR1cm5lZCBwcm9taXNlcydzXG4gIHJlamVjdGlvbiBoYW5kbGVyLiBGb3IgZXhhbXBsZTpcblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gcmVzb2x2ZSgxKTtcbiAgbGV0IHByb21pc2UyID0gcmVqZWN0KG5ldyBFcnJvcihcIjJcIikpO1xuICBsZXQgcHJvbWlzZTMgPSByZWplY3QobmV3IEVycm9yKFwiM1wiKSk7XG4gIGxldCBwcm9taXNlcyA9IFsgcHJvbWlzZTEsIHByb21pc2UyLCBwcm9taXNlMyBdO1xuXG4gIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGZ1bmN0aW9uKGFycmF5KXtcbiAgICAvLyBDb2RlIGhlcmUgbmV2ZXIgcnVucyBiZWNhdXNlIHRoZXJlIGFyZSByZWplY3RlZCBwcm9taXNlcyFcbiAgfSwgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAvLyBlcnJvci5tZXNzYWdlID09PSBcIjJcIlxuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCBhbGxcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FycmF5fSBlbnRyaWVzIGFycmF5IG9mIHByb21pc2VzXG4gIEBwYXJhbSB7U3RyaW5nfSBsYWJlbCBvcHRpb25hbCBzdHJpbmcgZm9yIGxhYmVsaW5nIHRoZSBwcm9taXNlLlxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IHByb21pc2UgdGhhdCBpcyBmdWxmaWxsZWQgd2hlbiBhbGwgYHByb21pc2VzYCBoYXZlIGJlZW5cbiAgZnVsZmlsbGVkLCBvciByZWplY3RlZCBpZiBhbnkgb2YgdGhlbSBiZWNvbWUgcmVqZWN0ZWQuXG4gIEBzdGF0aWNcbiovXG5mdW5jdGlvbiBhbGwoZW50cmllcykge1xuICByZXR1cm4gbmV3IEVudW1lcmF0b3IodGhpcywgZW50cmllcykucHJvbWlzZTtcbn1cblxuLyoqXG4gIGBQcm9taXNlLnJhY2VgIHJldHVybnMgYSBuZXcgcHJvbWlzZSB3aGljaCBpcyBzZXR0bGVkIGluIHRoZSBzYW1lIHdheSBhcyB0aGVcbiAgZmlyc3QgcGFzc2VkIHByb21pc2UgdG8gc2V0dGxlLlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMScpO1xuICAgIH0sIDIwMCk7XG4gIH0pO1xuXG4gIGxldCBwcm9taXNlMiA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAyJyk7XG4gICAgfSwgMTAwKTtcbiAgfSk7XG5cbiAgUHJvbWlzZS5yYWNlKFtwcm9taXNlMSwgcHJvbWlzZTJdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgLy8gcmVzdWx0ID09PSAncHJvbWlzZSAyJyBiZWNhdXNlIGl0IHdhcyByZXNvbHZlZCBiZWZvcmUgcHJvbWlzZTFcbiAgICAvLyB3YXMgcmVzb2x2ZWQuXG4gIH0pO1xuICBgYGBcblxuICBgUHJvbWlzZS5yYWNlYCBpcyBkZXRlcm1pbmlzdGljIGluIHRoYXQgb25seSB0aGUgc3RhdGUgb2YgdGhlIGZpcnN0XG4gIHNldHRsZWQgcHJvbWlzZSBtYXR0ZXJzLiBGb3IgZXhhbXBsZSwgZXZlbiBpZiBvdGhlciBwcm9taXNlcyBnaXZlbiB0byB0aGVcbiAgYHByb21pc2VzYCBhcnJheSBhcmd1bWVudCBhcmUgcmVzb2x2ZWQsIGJ1dCB0aGUgZmlyc3Qgc2V0dGxlZCBwcm9taXNlIGhhc1xuICBiZWNvbWUgcmVqZWN0ZWQgYmVmb3JlIHRoZSBvdGhlciBwcm9taXNlcyBiZWNhbWUgZnVsZmlsbGVkLCB0aGUgcmV0dXJuZWRcbiAgcHJvbWlzZSB3aWxsIGJlY29tZSByZWplY3RlZDpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAxJyk7XG4gICAgfSwgMjAwKTtcbiAgfSk7XG5cbiAgbGV0IHByb21pc2UyID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdwcm9taXNlIDInKSk7XG4gICAgfSwgMTAwKTtcbiAgfSk7XG5cbiAgUHJvbWlzZS5yYWNlKFtwcm9taXNlMSwgcHJvbWlzZTJdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgLy8gQ29kZSBoZXJlIG5ldmVyIHJ1bnNcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ3Byb21pc2UgMicgYmVjYXVzZSBwcm9taXNlIDIgYmVjYW1lIHJlamVjdGVkIGJlZm9yZVxuICAgIC8vIHByb21pc2UgMSBiZWNhbWUgZnVsZmlsbGVkXG4gIH0pO1xuICBgYGBcblxuICBBbiBleGFtcGxlIHJlYWwtd29ybGQgdXNlIGNhc2UgaXMgaW1wbGVtZW50aW5nIHRpbWVvdXRzOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgUHJvbWlzZS5yYWNlKFthamF4KCdmb28uanNvbicpLCB0aW1lb3V0KDUwMDApXSlcbiAgYGBgXG5cbiAgQG1ldGhvZCByYWNlXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBcnJheX0gcHJvbWlzZXMgYXJyYXkgb2YgcHJvbWlzZXMgdG8gb2JzZXJ2ZVxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB3aGljaCBzZXR0bGVzIGluIHRoZSBzYW1lIHdheSBhcyB0aGUgZmlyc3QgcGFzc2VkXG4gIHByb21pc2UgdG8gc2V0dGxlLlxuKi9cbmZ1bmN0aW9uIHJhY2UoZW50cmllcykge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gIGlmICghaXNBcnJheShlbnRyaWVzKSkge1xuICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gKF8sIHJlamVjdCkge1xuICAgICAgcmV0dXJuIHJlamVjdChuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGFuIGFycmF5IHRvIHJhY2UuJykpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgdmFyIGxlbmd0aCA9IGVudHJpZXMubGVuZ3RoO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG4vKipcbiAgYFByb21pc2UucmVqZWN0YCByZXR1cm5zIGEgcHJvbWlzZSByZWplY3RlZCB3aXRoIHRoZSBwYXNzZWQgYHJlYXNvbmAuXG4gIEl0IGlzIHNob3J0aGFuZCBmb3IgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICByZWplY3QobmV3IEVycm9yKCdXSE9PUFMnKSk7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gQ29kZSBoZXJlIGRvZXNuJ3QgcnVuIGJlY2F1c2UgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQhXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdXSE9PUFMnXG4gIH0pO1xuICBgYGBcblxuICBJbnN0ZWFkIG9mIHdyaXRpbmcgdGhlIGFib3ZlLCB5b3VyIGNvZGUgbm93IHNpbXBseSBiZWNvbWVzIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignV0hPT1BTJykpO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gQ29kZSBoZXJlIGRvZXNuJ3QgcnVuIGJlY2F1c2UgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQhXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdXSE9PUFMnXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIHJlamVjdFxuICBAc3RhdGljXG4gIEBwYXJhbSB7QW55fSByZWFzb24gdmFsdWUgdGhhdCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkIHdpdGguXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHJlamVjdGVkIHdpdGggdGhlIGdpdmVuIGByZWFzb25gLlxuKi9cbmZ1bmN0aW9uIHJlamVjdChyZWFzb24pIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG4gIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgcmV0dXJuIHByb21pc2U7XG59XG5cbmZ1bmN0aW9uIG5lZWRzUmVzb2x2ZXIoKSB7XG4gIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbn1cblxuZnVuY3Rpb24gbmVlZHNOZXcoKSB7XG4gIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG59XG5cbi8qKlxuICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsIHdoaWNoXG4gIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlIHJlYXNvblxuICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICBUZXJtaW5vbG9neVxuICAtLS0tLS0tLS0tLVxuXG4gIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gIC0gYHRoZW5hYmxlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gdGhhdCBkZWZpbmVzIGEgYHRoZW5gIG1ldGhvZC5cbiAgLSBgdmFsdWVgIGlzIGFueSBsZWdhbCBKYXZhU2NyaXB0IHZhbHVlIChpbmNsdWRpbmcgdW5kZWZpbmVkLCBhIHRoZW5hYmxlLCBvciBhIHByb21pc2UpLlxuICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgLSBgcmVhc29uYCBpcyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoeSBhIHByb21pc2Ugd2FzIHJlamVjdGVkLlxuICAtIGBzZXR0bGVkYCB0aGUgZmluYWwgcmVzdGluZyBzdGF0ZSBvZiBhIHByb21pc2UsIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cblxuICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgUHJvbWlzZXMgdGhhdCBhcmUgZnVsZmlsbGVkIGhhdmUgYSBmdWxmaWxsbWVudCB2YWx1ZSBhbmQgYXJlIGluIHRoZSBmdWxmaWxsZWRcbiAgc3RhdGUuICBQcm9taXNlcyB0aGF0IGFyZSByZWplY3RlZCBoYXZlIGEgcmVqZWN0aW9uIHJlYXNvbiBhbmQgYXJlIGluIHRoZVxuICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICBQcm9taXNlcyBjYW4gYWxzbyBiZSBzYWlkIHRvICpyZXNvbHZlKiBhIHZhbHVlLiAgSWYgdGhpcyB2YWx1ZSBpcyBhbHNvIGFcbiAgcHJvbWlzZSwgdGhlbiB0aGUgb3JpZ2luYWwgcHJvbWlzZSdzIHNldHRsZWQgc3RhdGUgd2lsbCBtYXRjaCB0aGUgdmFsdWUnc1xuICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgaXRzZWxmIHJlamVjdCwgYW5kIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgd2lsbFxuICBpdHNlbGYgZnVsZmlsbC5cblxuXG4gIEJhc2ljIFVzYWdlOlxuICAtLS0tLS0tLS0tLS1cblxuICBgYGBqc1xuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIC8vIG9uIHN1Y2Nlc3NcbiAgICByZXNvbHZlKHZhbHVlKTtcblxuICAgIC8vIG9uIGZhaWx1cmVcbiAgICByZWplY3QocmVhc29uKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgLy8gb24gcmVqZWN0aW9uXG4gIH0pO1xuICBgYGBcblxuICBBZHZhbmNlZCBVc2FnZTpcbiAgLS0tLS0tLS0tLS0tLS0tXG5cbiAgUHJvbWlzZXMgc2hpbmUgd2hlbiBhYnN0cmFjdGluZyBhd2F5IGFzeW5jaHJvbm91cyBpbnRlcmFjdGlvbnMgc3VjaCBhc1xuICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICBgYGBqc1xuICBmdW5jdGlvbiBnZXRKU09OKHVybCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG4gICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgZnVuY3Rpb24gaGFuZGxlcigpIHtcbiAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gdGhpcy5ET05FKSB7XG4gICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgIHJlc29sdmUodGhpcy5yZXNwb25zZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAvLyBvbiBmdWxmaWxsbWVudFxuICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAvLyBvbiByZWplY3Rpb25cbiAgfSk7XG4gIGBgYFxuXG4gIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgYGBganNcbiAgUHJvbWlzZS5hbGwoW1xuICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgIGdldEpTT04oJy9jb21tZW50cycpXG4gIF0pLnRoZW4oZnVuY3Rpb24odmFsdWVzKXtcbiAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgdmFsdWVzWzFdIC8vID0+IGNvbW1lbnRzSlNPTlxuXG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfSk7XG4gIGBgYFxuXG4gIEBjbGFzcyBQcm9taXNlXG4gIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQGNvbnN0cnVjdG9yXG4qL1xuZnVuY3Rpb24gUHJvbWlzZShyZXNvbHZlcikge1xuICB0aGlzW1BST01JU0VfSURdID0gbmV4dElkKCk7XG4gIHRoaXMuX3Jlc3VsdCA9IHRoaXMuX3N0YXRlID0gdW5kZWZpbmVkO1xuICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gIGlmIChub29wICE9PSByZXNvbHZlcikge1xuICAgIHR5cGVvZiByZXNvbHZlciAhPT0gJ2Z1bmN0aW9uJyAmJiBuZWVkc1Jlc29sdmVyKCk7XG4gICAgdGhpcyBpbnN0YW5jZW9mIFByb21pc2UgPyBpbml0aWFsaXplUHJvbWlzZSh0aGlzLCByZXNvbHZlcikgOiBuZWVkc05ldygpO1xuICB9XG59XG5cblByb21pc2UuYWxsID0gYWxsO1xuUHJvbWlzZS5yYWNlID0gcmFjZTtcblByb21pc2UucmVzb2x2ZSA9IHJlc29sdmU7XG5Qcm9taXNlLnJlamVjdCA9IHJlamVjdDtcblByb21pc2UuX3NldFNjaGVkdWxlciA9IHNldFNjaGVkdWxlcjtcblByb21pc2UuX3NldEFzYXAgPSBzZXRBc2FwO1xuUHJvbWlzZS5fYXNhcCA9IGFzYXA7XG5cblByb21pc2UucHJvdG90eXBlID0ge1xuICBjb25zdHJ1Y3RvcjogUHJvbWlzZSxcblxuICAvKipcbiAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICB3aGljaCByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZVxuICAgIHJlYXNvbiB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAvLyB1c2VyIGlzIGF2YWlsYWJsZVxuICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBDaGFpbmluZ1xuICAgIC0tLS0tLS0tXG4gIFxuICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZpcnN0IHByb21pc2UncyBmdWxmaWxsbWVudFxuICAgIG9yIHJlamVjdGlvbiBoYW5kbGVyLCBvciByZWplY3RlZCBpZiB0aGUgaGFuZGxlciB0aHJvd3MgYW4gZXhjZXB0aW9uLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIHVzZXIubmFtZTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodXNlck5hbWUpIHtcbiAgICAgIC8vIElmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgdXNlck5hbWVgIHdpbGwgYmUgdGhlIHVzZXIncyBuYW1lLCBvdGhlcndpc2UgaXRcbiAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgIH0pO1xuICBcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknKTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIGlmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgcmVhc29uYCB3aWxsIGJlICdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScuXG4gICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICB9KTtcbiAgICBgYGBcbiAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQZWRhZ29naWNhbEV4Y2VwdGlvbignVXBzdHJlYW0gZXJyb3InKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gVGhlIGBQZWRnYWdvY2lhbEV4Y2VwdGlvbmAgaXMgcHJvcGFnYXRlZCBhbGwgdGhlIHdheSBkb3duIHRvIGhlcmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQXNzaW1pbGF0aW9uXG4gICAgLS0tLS0tLS0tLS0tXG4gIFxuICAgIFNvbWV0aW1lcyB0aGUgdmFsdWUgeW91IHdhbnQgdG8gcHJvcGFnYXRlIHRvIGEgZG93bnN0cmVhbSBwcm9taXNlIGNhbiBvbmx5IGJlXG4gICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgIGZ1bGZpbGxtZW50IG9yIHJlamVjdGlvbiBoYW5kbGVyLiBUaGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgdGhlbiBiZSBwZW5kaW5nXG4gICAgdW50aWwgdGhlIHJldHVybmVkIHByb21pc2UgaXMgc2V0dGxlZC4gVGhpcyBpcyBjYWxsZWQgKmFzc2ltaWxhdGlvbiouXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgSWYgdGhlIGFzc2ltbGlhdGVkIHByb21pc2UgcmVqZWN0cywgdGhlbiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgYWxzbyByZWplY3QuXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIHJlamVjdHMsIHdlJ2xsIGhhdmUgdGhlIHJlYXNvbiBoZXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFNpbXBsZSBFeGFtcGxlXG4gICAgLS0tLS0tLS0tLS0tLS1cbiAgXG4gICAgU3luY2hyb25vdXMgRXhhbXBsZVxuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgbGV0IHJlc3VsdDtcbiAgXG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IGZpbmRSZXN1bHQoKTtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH1cbiAgICBgYGBcbiAgXG4gICAgRXJyYmFjayBFeGFtcGxlXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFJlc3VsdChmdW5jdGlvbihyZXN1bHQsIGVycil7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH1cbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgUHJvbWlzZSBFeGFtcGxlO1xuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBBZHZhbmNlZCBFeGFtcGxlXG4gICAgLS0tLS0tLS0tLS0tLS1cbiAgXG4gICAgU3luY2hyb25vdXMgRXhhbXBsZVxuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgbGV0IGF1dGhvciwgYm9va3M7XG4gIFxuICAgIHRyeSB7XG4gICAgICBhdXRob3IgPSBmaW5kQXV0aG9yKCk7XG4gICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfVxuICAgIGBgYFxuICBcbiAgICBFcnJiYWNrIEV4YW1wbGVcbiAgXG4gICAgYGBganNcbiAgXG4gICAgZnVuY3Rpb24gZm91bmRCb29rcyhib29rcykge1xuICBcbiAgICB9XG4gIFxuICAgIGZ1bmN0aW9uIGZhaWx1cmUocmVhc29uKSB7XG4gIFxuICAgIH1cbiAgXG4gICAgZmluZEF1dGhvcihmdW5jdGlvbihhdXRob3IsIGVycil7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBmaW5kQm9vb2tzQnlBdXRob3IoYXV0aG9yLCBmdW5jdGlvbihib29rcywgZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZm91bmRCb29rcyhib29rcyk7XG4gICAgICAgICAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBQcm9taXNlIEV4YW1wbGU7XG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBmaW5kQXV0aG9yKCkuXG4gICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgIHRoZW4oZnVuY3Rpb24oYm9va3Mpe1xuICAgICAgICAvLyBmb3VuZCBib29rc1xuICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBAbWV0aG9kIHRoZW5cbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvbkZ1bGZpbGxlZFxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWRcbiAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgQHJldHVybiB7UHJvbWlzZX1cbiAgKi9cbiAgdGhlbjogdGhlbixcblxuICAvKipcbiAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cbiAgXG4gICAgYGBganNcbiAgICBmdW5jdGlvbiBmaW5kQXV0aG9yKCl7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICB9XG4gIFxuICAgIC8vIHN5bmNocm9ub3VzXG4gICAgdHJ5IHtcbiAgICAgIGZpbmRBdXRob3IoKTtcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9XG4gIFxuICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEBtZXRob2QgY2F0Y2hcbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGlvblxuICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAqL1xuICAnY2F0Y2gnOiBmdW5jdGlvbiBfY2F0Y2gob25SZWplY3Rpb24pIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gcG9seWZpbGwoKSB7XG4gICAgdmFyIGxvY2FsID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxvY2FsID0gc2VsZjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbG9jYWwgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3BvbHlmaWxsIGZhaWxlZCBiZWNhdXNlIGdsb2JhbCBvYmplY3QgaXMgdW5hdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFAgPSBsb2NhbC5Qcm9taXNlO1xuXG4gICAgaWYgKFApIHtcbiAgICAgICAgdmFyIHByb21pc2VUb1N0cmluZyA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcm9taXNlVG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoUC5yZXNvbHZlKCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAvLyBzaWxlbnRseSBpZ25vcmVkXG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvbWlzZVRvU3RyaW5nID09PSAnW29iamVjdCBQcm9taXNlXScgJiYgIVAuY2FzdCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbG9jYWwuUHJvbWlzZSA9IFByb21pc2U7XG59XG5cbi8vIFN0cmFuZ2UgY29tcGF0Li5cblByb21pc2UucG9seWZpbGwgPSBwb2x5ZmlsbDtcblByb21pc2UuUHJvbWlzZSA9IFByb21pc2U7XG5cbnJldHVybiBQcm9taXNlO1xuXG59KSkpO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZXM2LXByb21pc2UubWFwIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsImV4cG9ydCBjb25zdCBFVkVOVFMgPSB7XHJcbiAgU0lHTklOOiAnU0lHTklOJyxcclxuICBTSUdOT1VUOiAnU0lHTk9VVCcsXHJcbiAgU0lHTlVQOiAnU0lHTlVQJ1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IFVSTFMgPSB7XHJcbiAgdG9rZW46ICd0b2tlbicsXHJcbiAgc2lnbnVwOiAnMS91c2VyL3NpZ251cCcsXHJcbiAgcmVxdWVzdFJlc2V0UGFzc3dvcmQ6ICcxL3VzZXIvcmVxdWVzdFJlc2V0UGFzc3dvcmQnLFxyXG4gIHJlc2V0UGFzc3dvcmQ6ICcxL3VzZXIvcmVzZXRQYXNzd29yZCcsXHJcbiAgY2hhbmdlUGFzc3dvcmQ6ICcxL3VzZXIvY2hhbmdlUGFzc3dvcmQnLFxyXG4gIG9iamVjdHM6ICcxL29iamVjdHMnLFxyXG4gIG9iamVjdHNBY3Rpb246ICcxL29iamVjdHMvYWN0aW9uJyxcclxuICAvLyBzb2NpYWxMb2dpbldpdGhDb2RlOiAnMS91c2VyL1BST1ZJREVSL2NvZGUnLFxyXG4gIC8vIHNvY2lhbFNpbmd1cFdpdGhDb2RlOiAnMS91c2VyL1BST1ZJREVSL3NpZ251cENvZGUnLFxyXG4gIHNvY2lhbFNpZ25pbldpdGhUb2tlbjogJzEvdXNlci9QUk9WSURFUi90b2tlbicsXHJcbiAgcHJvZmlsZTogJy9hcGkvYWNjb3VudC9wcm9maWxlJyxcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBTT0NJQUxfUFJPVklERVJTID0ge1xyXG4gIGdpdGh1Yjoge25hbWU6ICdnaXRodWInLCBsYWJlbDogJ0dpdGh1YicsIHVybDogJ3d3dy5naXRodWIuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzQ0NCd9LCBpZDogMX0sXHJcbiAgZ29vZ2xlOiB7bmFtZTogJ2dvb2dsZScsIGxhYmVsOiAnR29vZ2xlJywgdXJsOiAnd3d3Lmdvb2dsZS5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjZGQ0YjM5J30sIGlkOiAyfSxcclxuICBmYWNlYm9vazoge25hbWU6ICdmYWNlYm9vaycsIGxhYmVsOiAnRmFjZWJvb2snLCB1cmw6ICd3d3cuZmFjZWJvb2suY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzNiNTk5OCd9LCBpZDogM30sXHJcbiAgdHdpdHRlcjoge25hbWU6ICd0d2l0dGVyJywgbGFiZWw6ICdUd2l0dGVyJywgdXJsOiAnd3d3LnR3aXR0ZXIuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnIzU1YWNlZSd9LCBpZDogNH1cclxufTtcclxuIiwiZXhwb3J0IGRlZmF1bHQge1xyXG4gIGFwcE5hbWU6IG51bGwsXHJcbiAgYW5vbnltb3VzVG9rZW46IG51bGwsXHJcbiAgc2lnblVwVG9rZW46IG51bGwsXHJcbiAgYXBpVXJsOiAnaHR0cHM6Ly9hcGkuYmFja2FuZC5jb20nLFxyXG4gIHN0b3JhZ2U6IHdpbmRvdy5sb2NhbFN0b3JhZ2UsXHJcbiAgc3RvcmFnZVByZWZpeDogJ0JBQ0tBTkRfJyxcclxuICBtYW5hZ2VSZWZyZXNoVG9rZW46IHRydWUsXHJcbiAgcnVuU2lnbmluQWZ0ZXJTaWdudXA6IHRydWUsXHJcbiAgcnVuU29ja2V0OiBmYWxzZSxcclxuICBzb2NrZXRVcmw6ICdodHRwczovL3NvY2tldC5iYWNrYW5kLmNvbScsXHJcbiAgaXNNb2JpbGU6IGZhbHNlLFxyXG59O1xyXG4iLCJleHBvcnQgY29uc3QgZmlsdGVyID0ge1xyXG4gIGNyZWF0ZTogKGZpZWxkTmFtZSwgb3BlcmF0b3IsIHZhbHVlKSA9PiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBmaWVsZE5hbWUsXHJcbiAgICAgIG9wZXJhdG9yLFxyXG4gICAgICB2YWx1ZVxyXG4gICAgfVxyXG4gIH0sXHJcbiAgb3BlcmF0b3JzOiB7XHJcbiAgICBudW1lcmljOiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBncmVhdGVyVGhhbjogXCJncmVhdGVyVGhhblwiLCBncmVhdGVyVGhhbk9yRXF1YWxzVG86IFwiZ3JlYXRlclRoYW5PckVxdWFsc1RvXCIsIGxlc3NUaGFuOiBcImxlc3NUaGFuXCIsIGxlc3NUaGFuT3JFcXVhbHNUbzogXCJsZXNzVGhhbk9yRXF1YWxzVG9cIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgZGF0ZTogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgZ3JlYXRlclRoYW46IFwiZ3JlYXRlclRoYW5cIiwgZ3JlYXRlclRoYW5PckVxdWFsc1RvOiBcImdyZWF0ZXJUaGFuT3JFcXVhbHNUb1wiLCBsZXNzVGhhbjogXCJsZXNzVGhhblwiLCBsZXNzVGhhbk9yRXF1YWxzVG86IFwibGVzc1RoYW5PckVxdWFsc1RvXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIHRleHQ6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIHN0YXJ0c1dpdGg6IFwic3RhcnRzV2l0aFwiLCBlbmRzV2l0aDogXCJlbmRzV2l0aFwiLCBjb250YWluczogXCJjb250YWluc1wiLCBub3RDb250YWluczogXCJub3RDb250YWluc1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICBib29sZWFuOiB7IGVxdWFsczogXCJlcXVhbHNcIiB9LFxyXG4gICAgcmVsYXRpb246IHsgaW46IFwiaW5cIiB9XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3Qgc29ydCA9IHtcclxuICBjcmVhdGU6IChmaWVsZE5hbWUsIG9yZGVyKSA9PiB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBmaWVsZE5hbWUsXHJcbiAgICAgIG9yZGVyXHJcbiAgICB9XHJcbiAgfSxcclxuICBvcmRlcnM6IHsgYXNjOiBcImFzY1wiLCBkZXNjOiBcImRlc2NcIiB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBleGNsdWRlID0ge1xyXG4gIG9wdGlvbnM6IHsgbWV0YWRhdGE6IFwibWV0YWRhdGFcIiwgdG90YWxSb3dzOiBcInRvdGFsUm93c1wiLCBhbGw6IFwibWV0YWRhdGEsdG90YWxSb3dzXCIgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgU3RvcmFnZUFic3RyYWN0IHtcclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIGlmICh0aGlzLmNvbnN0cnVjdG9yID09PSBTdG9yYWdlQWJzdHJhY3QpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbiBub3QgY29uc3RydWN0IGFic3RyYWN0IGNsYXNzLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnNldEl0ZW0gPT09IHVuZGVmaW5lZCB8fCB0aGlzLnNldEl0ZW0gPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUuc2V0SXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSBzZXRJdGVtIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5nZXRJdGVtID09PSB1bmRlZmluZWQgfHwgdGhpcy5nZXRJdGVtID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLmdldEl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgZ2V0SXRlbSBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMucmVtb3ZlSXRlbSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMucmVtb3ZlSXRlbSA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5yZW1vdmVJdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIHJlbW92ZUl0ZW0gbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLmNsZWFyID09PSB1bmRlZmluZWQgfHwgdGhpcy5jbGVhciA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5jbGVhcikge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSBjbGVhciBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgLy8gdGhpcy5kYXRhID0ge307XHJcbiAgfVxyXG4gIHNldEl0ZW0gKGlkLCB2YWwpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2Qgc2V0SXRlbSBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIHJldHVybiB0aGlzLmRhdGFbaWRdID0gU3RyaW5nKHZhbCk7XHJcbiAgfVxyXG4gIGdldEl0ZW0gKGlkKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIGdldEl0ZW0gZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyByZXR1cm4gdGhpcy5kYXRhLmhhc093blByb3BlcnR5KGlkKSA/IHRoaXMuX2RhdGFbaWRdIDogbnVsbDtcclxuICB9XHJcbiAgcmVtb3ZlSXRlbSAoaWQpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2QgcmVtb3ZlSXRlbSBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIGRlbGV0ZSB0aGlzLmRhdGFbaWRdO1xyXG4gICAgLy8gcmV0dXJuIG51bGw7XHJcbiAgIH1cclxuICBjbGVhciAoKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIGNsZWFyIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gcmV0dXJuIHRoaXMuZGF0YSA9IHt9O1xyXG4gICB9XHJcbn1cclxuIiwiLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXHJcbiAqIGJhY2thbmQgSmF2YVNjcmlwdCBMaWJyYXJ5XHJcbiAqIEF1dGhvcnM6IGJhY2thbmRcclxuICogTGljZW5zZTogTUlUIChodHRwOi8vd3d3Lm9wZW5zb3VyY2Uub3JnL2xpY2Vuc2VzL21pdC1saWNlbnNlLnBocClcclxuICogQ29tcGlsZWQgQXQ6IDI2LzExLzIwMTZcclxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xyXG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cydcclxuaW1wb3J0ICogYXMgY29uc3RhbnRzIGZyb20gJy4vY29uc3RhbnRzJ1xyXG5pbXBvcnQgKiBhcyBoZWxwZXJzIGZyb20gJy4vaGVscGVycydcclxuaW1wb3J0IFN0b3JhZ2UgZnJvbSAnLi91dGlscy9zdG9yYWdlJ1xyXG5pbXBvcnQgSHR0cCBmcm9tICcuL3V0aWxzL2h0dHAnXHJcbmltcG9ydCBTb2NrZXQgZnJvbSAnLi91dGlscy9zb2NrZXQnXHJcbmltcG9ydCAqIGFzIGF1dGggZnJvbSAnLi9zZXJ2aWNlcy9hdXRoJ1xyXG5pbXBvcnQgKiBhcyBjcnVkIGZyb20gJy4vc2VydmljZXMvY3J1ZCdcclxuaW1wb3J0ICogYXMgZmlsZXMgZnJvbSAnLi9zZXJ2aWNlcy9maWxlcydcclxuXHJcbmxldCBiYWNrYW5kID0ge1xyXG4gIGNvbnN0YW50cyxcclxuICBoZWxwZXJzLFxyXG59XHJcbmJhY2thbmQuaW5pdCA9IChjb25maWcgPSB7fSkgPT4ge1xyXG5cclxuICAvLyBjb21iaW5lIGRlZmF1bHRzIHdpdGggdXNlciBjb25maWdcclxuICBPYmplY3QuYXNzaWduKGRlZmF1bHRzLCBjb25maWcpO1xyXG4gIC8vIGNvbnNvbGUubG9nKGRlZmF1bHRzKTtcclxuXHJcbiAgLy8gdmVyaWZ5IG5ldyBkZWZhdWx0c1xyXG4gIGlmICghZGVmYXVsdHMuYXBwTmFtZSlcclxuICAgIHRocm93IG5ldyBFcnJvcignYXBwTmFtZSBpcyBtaXNzaW5nJyk7XHJcbiAgaWYgKCFkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbilcclxuICAgIHRocm93IG5ldyBFcnJvcignYW5vbnltb3VzVG9rZW4gaXMgbWlzc2luZycpO1xyXG4gIGlmICghZGVmYXVsdHMuc2lnblVwVG9rZW4pXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NpZ25VcFRva2VuIGlzIG1pc3NpbmcnKTtcclxuXHJcbiAgLy8gaW5pdCBnbG9iYWxzXHJcbiAgbGV0IHN0b3JhZ2UgPSBuZXcgU3RvcmFnZShkZWZhdWx0cy5zdG9yYWdlLCBkZWZhdWx0cy5zdG9yYWdlUHJlZml4KTtcclxuICBsZXQgaHR0cCA9IEh0dHAuY3JlYXRlKHtcclxuICAgIGJhc2VVUkw6IGRlZmF1bHRzLmFwaVVybFxyXG4gIH0pO1xyXG4gIGxldCBzY29wZSA9IHtcclxuICAgIHN0b3JhZ2UsXHJcbiAgICBodHRwLFxyXG4gICAgaXNJRTogd2luZG93LmRvY3VtZW50ICYmIChmYWxzZSB8fCAhIWRvY3VtZW50LmRvY3VtZW50TW9kZSksXHJcbiAgfVxyXG4gIGxldCBzb2NrZXQgPSBudWxsO1xyXG4gIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgIHNvY2tldCA9IG5ldyBTb2NrZXQoZGVmYXVsdHMuc29ja2V0VXJsKTtcclxuICAgIHNjb3BlLnNvY2tldCA9IHNvY2tldDtcclxuICB9XHJcblxyXG4gIC8vIGJpbmQgZ2xvYmFscyB0byBhbGwgc2VydmljZSBmdW5jdGlvbnNcclxuICBsZXQgc2VydmljZSA9IE9iamVjdC5hc3NpZ24oe30sIGF1dGgsIGNydWQsIGZpbGVzKTtcclxuICBmb3IgKGxldCBmbiBpbiBzZXJ2aWNlKSB7XHJcbiAgICBzZXJ2aWNlW2ZuXSA9IHNlcnZpY2VbZm5dLmJpbmQoc2NvcGUpO1xyXG4gIH1cclxuXHJcbiAgLy8gc2V0IGludGVyY2VwdG9yIGZvciBhdXRoSGVhZGVycyAmIHJlZnJlc2hUb2tlblxyXG4gIGh0dHAuY29uZmlnLmludGVyY2VwdG9ycyA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gICAgICBpZiAoY29uZmlnLnVybC5pbmRleE9mKGNvbnN0YW50cy5VUkxTLnRva2VuKSA9PT0gIC0xICYmIHN0b3JhZ2UuZ2V0KCd1c2VyJykpIHtcclxuICAgICAgICBjb25maWcuaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGNvbmZpZy5oZWFkZXJzLCBzdG9yYWdlLmdldCgndXNlcicpLnRva2VuKVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKGVycm9yLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpIHtcclxuICAgICAgaWYgKGNvbmZpZy51cmwuaW5kZXhPZihjb25zdGFudHMuVVJMUy50b2tlbikgPT09ICAtMVxyXG4gICAgICAgJiYgZGVmYXVsdHMubWFuYWdlUmVmcmVzaFRva2VuXHJcbiAgICAgICAmJiBlcnJvci5zdGF0dXMgPT09IDQwMVxyXG4gICAgICAgJiYgZXJyb3IuZGF0YSAmJiBlcnJvci5kYXRhLk1lc3NhZ2UgPT09ICdpbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nKSB7XHJcbiAgICAgICAgIGF1dGguX19oYW5kbGVSZWZyZXNoVG9rZW5fXy5jYWxsKHNjb3BlLCBlcnJvcilcclxuICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgIHRoaXMucmVxdWVzdChjb25maWcsIHNjYiwgZWNiKTtcclxuICAgICAgICAgfSlcclxuICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGdldCBkYXRhIGZyb20gdXJsIGluIHNvY2lhbCBzaWduLWluIHBvcHVwXHJcbiAgaWYgKCFkZWZhdWx0cy5pc01vYmlsZSkge1xyXG4gICAgbGV0IGRhdGFNYXRjaCA9IC9cXD8oZGF0YXxlcnJvcik9KC4rKS8uZXhlYyh3aW5kb3cubG9jYXRpb24uaHJlZik7XHJcbiAgICBpZiAoZGF0YU1hdGNoICYmIGRhdGFNYXRjaFsxXSAmJiBkYXRhTWF0Y2hbMl0pIHtcclxuICAgICAgbGV0IGRhdGEgPSB7XHJcbiAgICAgICAgZGF0YTogSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQoZGF0YU1hdGNoWzJdLnJlcGxhY2UoLyMuKi8sICcnKSkpXHJcbiAgICAgIH1cclxuICAgICAgZGF0YS5zdGF0dXMgPSAoZGF0YU1hdGNoWzFdID09PSAnZGF0YScpID8gMjAwIDogMDtcclxuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ1NPQ0lBTF9EQVRBJywgSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xyXG4gICAgICAvLyB2YXIgaXNJRSA9IGZhbHNlIHx8ICEhZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xyXG4gICAgICAvLyBpZiAoIWlzSUUpIHtcclxuICAgICAgLy8gICB3aW5kb3cub3BlbmVyLnBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGRhdGEpLCBsb2NhdGlvbi5vcmlnaW4pO1xyXG4gICAgICAvLyB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBleHBvc2UgYmFja2FuZCBuYW1lc3BhY2UgdG8gd2luZG93XHJcbiAgZGVsZXRlIGJhY2thbmQuaW5pdDtcclxuICBPYmplY3QuYXNzaWduKGJhY2thbmQsIHNlcnZpY2UpO1xyXG4gIGlmKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgc3RvcmFnZS5nZXQoJ3VzZXInKSAmJiBzb2NrZXQuY29ubmVjdChzdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24gfHwgbnVsbCwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpXHJcbiAgICBPYmplY3QuYXNzaWduKGJhY2thbmQsIHtvbjogc29ja2V0Lm9uLmJpbmQoc29ja2V0KX0pO1xyXG4gIH1cblxyXG59XHJcblxubW9kdWxlLmV4cG9ydHMgPSBiYWNrYW5kXHJcbiIsImltcG9ydCB7IFByb21pc2UgfSBmcm9tICdlczYtcHJvbWlzZSdcclxuaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLy4uL2RlZmF1bHRzJ1xuXHJcbmZ1bmN0aW9uIF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXyAoc3RhdHVzID0gMCwgc3RhdHVzVGV4dCA9ICcnLCBoZWFkZXJzID0gW10sIGRhdGEgPSAnJykge1xyXG4gIHJldHVybiB7XHJcbiAgICBzdGF0dXMsXHJcbiAgICBzdGF0dXNUZXh0LFxyXG4gICAgaGVhZGVycyxcclxuICAgIGRhdGFcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gX19kaXNwYXRjaEV2ZW50X18gKG5hbWUpIHtcclxuICBsZXQgZXZlbnQ7XHJcbiAgaWYoZGVmYXVsdHMuaXNNb2JpbGUpXHJcbiAgICByZXR1cm47XHJcbiAgaWYgKGRvY3VtZW50LmNyZWF0ZUV2ZW50KSB7XHJcbiAgICBldmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xyXG4gICAgZXZlbnQuaW5pdEV2ZW50KG5hbWUsIHRydWUsIHRydWUpO1xyXG4gICAgZXZlbnQuZXZlbnROYW1lID0gbmFtZTtcclxuICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudE9iamVjdCgpO1xyXG4gICAgZXZlbnQuZXZlbnRUeXBlID0gbmFtZTtcclxuICAgIGV2ZW50LmV2ZW50TmFtZSA9IG5hbWU7XHJcbiAgICB3aW5kb3cuZmlyZUV2ZW50KCdvbicgKyBldmVudC5ldmVudFR5cGUsIGV2ZW50KTtcclxuICB9XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIF9faGFuZGxlUmVmcmVzaFRva2VuX18gKGVycm9yKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGxldCB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgaWYgKCF1c2VyIHx8ICF1c2VyLmRldGFpbHMucmVmcmVzaF90b2tlbikge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIG9yIHJlZnJlc2hUb2tlbiBmb3VuZC4gYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuJykpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIF9fc2lnbmluV2l0aFRva2VuX18uY2FsbCh0aGlzLCB7XHJcbiAgICAgICAgdXNlcm5hbWU6IHVzZXIuZGV0YWlscy51c2VybmFtZSxcclxuICAgICAgICByZWZyZXNoVG9rZW46IHVzZXIuZGV0YWlscy5yZWZyZXNoX3Rva2VuLFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSlcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHVzZUFub255bW91c0F1dGggKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgZGV0YWlscyA9IHtcclxuICAgICAgXCJhY2Nlc3NfdG9rZW5cIjogZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sXHJcbiAgICAgIFwidG9rZW5fdHlwZVwiOiBcIkFub255bW91c1Rva2VuXCIsXHJcbiAgICAgIFwiZXhwaXJlc19pblwiOiAwLFxyXG4gICAgICBcImFwcE5hbWVcIjogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgXCJ1c2VybmFtZVwiOiBcIkd1ZXN0XCIsXHJcbiAgICAgIFwicm9sZVwiOiBcIlVzZXJcIixcclxuICAgICAgXCJmaXJzdE5hbWVcIjogXCJhbm9ueW1vdXNcIixcclxuICAgICAgXCJsYXN0TmFtZVwiOiBcImFub255bW91c1wiLFxyXG4gICAgICBcImZ1bGxOYW1lXCI6IFwiXCIsXHJcbiAgICAgIFwicmVnSWRcIjogMCAsXHJcbiAgICAgIFwidXNlcklkXCI6IG51bGxcclxuICAgIH1cclxuICAgIHRoaXMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgQW5vbnltb3VzVG9rZW46IGRlZmF1bHRzLmFub255bW91c1Rva2VuXHJcbiAgICAgIH0sXHJcbiAgICAgIGRldGFpbHMsXHJcbiAgICB9KTtcclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICB0aGlzLnNvY2tldC5jb25uZWN0KG51bGwsIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgIH1cclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICAgIHJlc29sdmUoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2lnbmluICh1c2VybmFtZSwgcGFzc3dvcmQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYHVzZXJuYW1lPSR7dXNlcm5hbWV9JnBhc3N3b3JkPSR7cGFzc3dvcmR9JmFwcE5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSZncmFudF90eXBlPXBhc3N3b3JkYFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzaWdudXAgKGVtYWlsLCBwYXNzd29yZCwgY29uZmlybVBhc3N3b3JkLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBwYXJhbWV0ZXJzID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy5zaWdudXAsXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ1NpZ25VcFRva2VuJzogZGVmYXVsdHMuc2lnblVwVG9rZW5cclxuICAgICAgfSxcclxuICAgICAgZGF0YToge1xyXG4gICAgICAgIGZpcnN0TmFtZSxcclxuICAgICAgICBsYXN0TmFtZSxcclxuICAgICAgICBlbWFpbCxcclxuICAgICAgICBwYXNzd29yZCxcclxuICAgICAgICBjb25maXJtUGFzc3dvcmQsXHJcbiAgICAgICAgcGFyYW1ldGVyc1xyXG4gICAgICB9XHJcbiAgICB9LCBzY2IgLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICBpZihkZWZhdWx0cy5ydW5TaWduaW5BZnRlclNpZ251cCkge1xyXG4gICAgICAgIHJldHVybiBzaWduaW4uY2FsbCh0aGlzLCByZXNwb25zZS5kYXRhLnVzZXJuYW1lLCBwYXNzd29yZCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIF9fZ2V0U29jaWFsVXJsX18gKHByb3ZpZGVyTmFtZSwgaXNTaWdudXAsIGlzQXV0b1NpZ25VcCkge1xyXG4gIGxldCBwcm92aWRlciA9IFNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJOYW1lXTtcclxuICBsZXQgYWN0aW9uID0gaXNTaWdudXAgPyAndXAnIDogJ2luJztcclxuICBsZXQgYXV0b1NpZ25VcFBhcmFtID0gYCZzaWdudXBJZk5vdFNpZ25lZEluPSR7KCFpc1NpZ251cCAmJiBpc0F1dG9TaWduVXApID8gJ3RydWUnIDogJ2ZhbHNlJ31gO1xyXG4gIHJldHVybiBgL3VzZXIvc29jaWFsU2lnbiR7YWN0aW9ufT9wcm92aWRlcj0ke3Byb3ZpZGVyLmxhYmVsfSR7YXV0b1NpZ25VcFBhcmFtfSZyZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD1zZWxmJnJlZGlyZWN0X3VyaT0ke3Byb3ZpZGVyLnVybH0mc3RhdGU9YDtcclxufVxyXG5mdW5jdGlvbiBfX3NvY2lhbEF1dGhfXyAocHJvdmlkZXIsIGlzU2lnblVwLCBzcGVjLCBlbWFpbCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBpZiAoIVNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJdKSB7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBTb2NpYWwgUHJvdmlkZXInKSk7XHJcbiAgICB9XHJcbiAgICBsZXQgdXJsID0gIGAke2RlZmF1bHRzLmFwaVVybH0vMS8ke19fZ2V0U29jaWFsVXJsX18ocHJvdmlkZXIsIGlzU2lnblVwLCB0cnVlKX0mYXBwbmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JHtlbWFpbCA/ICcmZW1haWw9JytlbWFpbCA6ICcnfSZyZXR1cm5BZGRyZXNzPWAgLy8gJHtsb2NhdGlvbi5ocmVmfVxuICAgIGxldCBwb3B1cCA9IG51bGw7XG4gICAgaWYgKCF0aGlzLmlzSUUpIHtcbiAgICAgIHBvcHVwID0gd2luZG93Lm9wZW4odXJsLCAnc29jaWFscG9wdXAnLCBzcGVjKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBwb3B1cCA9IHdpbmRvdy5vcGVuKCcnLCAnJywgc3BlYyk7XG4gICAgICBwb3B1cC5sb2NhdGlvbiA9IHVybDtcbiAgICB9XG4gICAgaWYgKHBvcHVwICYmIHBvcHVwLmZvY3VzKSB7IHBvcHVwLmZvY3VzKCkgfVxyXG5cclxuICAgIGxldCBoYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgICBsZXQgdXJsID0gZS50eXBlID09PSAnbWVzc2FnZScgPyBlLm9yaWdpbiA6IGUudXJsO1xyXG4gICAgICBpZiAodXJsLmluZGV4T2Yod2luZG93LmxvY2F0aW9uLmhyZWYpID09PSAtMSkge1xyXG4gICAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBPcmlnaW4gTWVzc2FnZScpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlcyA9IGUudHlwZSA9PT0gJ21lc3NhZ2UnID8gSlNPTi5wYXJzZShlLmRhdGEpIDogSlNPTi5wYXJzZShlLm5ld1ZhbHVlKTtcclxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoZS50eXBlLCBoYW5kbGVyLCBmYWxzZSk7XHJcbiAgICAgIGlmIChwb3B1cCAmJiBwb3B1cC5jbG9zZSkgeyBwb3B1cC5jbG9zZSgpIH1cclxuICAgICAgZS50eXBlID09PSAnc3RvcmFnZScgJiYgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oZS5rZXkpO1xyXG5cclxuICAgICAgaWYgKHJlcy5zdGF0dXMgIT0gMjAwKSB7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfVxyXG4gICAgaGFuZGxlciA9IGhhbmRsZXIuYmluZChwb3B1cCk7XHJcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgaGFuZGxlciAsIGZhbHNlKTtcclxuICAgIC8vIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWduaW4gKHByb3ZpZGVyLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fLmNhbGwodGhpcywgcHJvdmlkZXIsIGZhbHNlLCBzcGVjLCAnJylcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHNvY2lhbFNpZ25pbldpdGhUb2tlbiAocHJvdmlkZXIsIHRva2VuLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc29jaWFsU2lnbmluV2l0aFRva2VuLnJlcGxhY2UoJ1BST1ZJREVSJywgcHJvdmlkZXIpLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBwYXJhbXM6IHtcclxuICAgICAgICBhY2Nlc3NUb2tlbjogdG9rZW4sXHJcbiAgICAgICAgYXBwTmFtZTogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgICBzaWdudXBJZk5vdFNpZ25lZEluOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIFRPRE86UEFUQ0hcclxuICAgICAgdGhpcy5odHRwKHtcclxuICAgICAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vdXNlcnNgLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICBmaWx0ZXI6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwiZmllbGROYW1lXCI6IFwiZW1haWxcIixcclxuICAgICAgICAgICAgICBcIm9wZXJhdG9yXCI6IFwiZXF1YWxzXCIsXHJcbiAgICAgICAgICAgICAgXCJ2YWx1ZVwiOiByZXNwb25zZS5kYXRhLnVzZXJuYW1lXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihwYXRjaCA9PiB7XHJcbiAgICAgICAgbGV0IHtpZCwgZmlyc3ROYW1lLCBsYXN0TmFtZX0gPSBwYXRjaC5kYXRhLmRhdGFbMF07XG4gICAgICAgIGxldCB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xuICAgICAgICBsZXQgbmV3RGV0YWlscyA9ICB7dXNlcklkOiBpZC50b1N0cmluZygpLCBmaXJzdE5hbWUsIGxhc3ROYW1lfTtcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcbiAgICAgICAgICB0b2tlbjogdXNlci50b2tlbixcbiAgICAgICAgICBkZXRhaWxzOiBPYmplY3QuYXNzaWduKHt9LCB1c2VyLmRldGFpbHMsIG5ld0RldGFpbHMpXG4gICAgICAgIH0pO1xuICAgICAgICB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgICAgIGxldCByZXMgPSBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18ocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCByZXNwb25zZS5oZWFkZXJzLCB1c2VyLmRldGFpbHMpO1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIEVPUFxyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn07XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWdudXAgKHByb3ZpZGVyLCBlbWFpbCwgc2NiLCBlY2IsIHNwZWMgPSAnbGVmdD0xLCB0b3A9MSwgd2lkdGg9NTAwLCBoZWlnaHQ9NTYwJykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBfX3NvY2lhbEF1dGhfXy5jYWxsKHRoaXMsIHByb3ZpZGVyLCB0cnVlLCBzcGVjLCBlbWFpbClcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgICByZXR1cm4gX19zaWduaW5XaXRoVG9rZW5fXy5jYWxsKHRoaXMsIHtcclxuICAgICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gIH0pO1xyXG5cclxufVxyXG5mdW5jdGlvbiBfX3NpZ25pbldpdGhUb2tlbl9fICh0b2tlbkRhdGEpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRhdGEgPSBbXTtcclxuICAgIGZvciAobGV0IG9iaiBpbiB0b2tlbkRhdGEpIHtcclxuICAgICAgICBkYXRhLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KG9iaikgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQodG9rZW5EYXRhW29ial0pKTtcclxuICAgIH1cclxuICAgIGRhdGEgPSBkYXRhLmpvaW4oXCImXCIpO1xyXG5cclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYCR7ZGF0YX0mYXBwTmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JmdyYW50X3R5cGU9cGFzc3dvcmRgXHJcbiAgICB9KVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0KCd1c2VyJywge1xyXG4gICAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW59YFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZGV0YWlsczogcmVzcG9uc2UuZGF0YVxyXG4gICAgICB9KTtcclxuICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05JTik7XHJcbiAgICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgICB0aGlzLnNvY2tldC5jb25uZWN0KHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbi5BdXRob3JpemF0aW9uLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RSZXNldFBhc3N3b3JkICh1c2VybmFtZSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXF1ZXN0UmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGFwcE5hbWU6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgICAgdXNlcm5hbWVcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRQYXNzd29yZCAobmV3UGFzc3dvcmQsIHJlc2V0VG9rZW4sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMucmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG5ld1Bhc3N3b3JkLFxyXG4gICAgICAgIHJlc2V0VG9rZW5cclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY2hhbmdlUGFzc3dvcmQgKG9sZFBhc3N3b3JkLCBuZXdQYXNzd29yZCwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5jaGFuZ2VQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG9sZFBhc3N3b3JkLFxyXG4gICAgICAgIG5ld1Bhc3N3b3JkXHJcbiAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25vdXQgKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLnN0b3JhZ2UucmVtb3ZlKCd1c2VyJyk7XHJcbiAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmRpc2Nvbm5lY3QoKTtcclxuICAgIH1cclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOT1VUKTtcclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKSkpO1xyXG4gICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdGhpcy5zdG9yYWdlLmdldCgndXNlcicpKSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18gKCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlcikge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdXNlci5kZXRhaWxzKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFVzZXJEZXRhaWxzKHNjYiwgZWNiLCBmb3JjZSA9IGZhbHNlKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGlmIChmb3JjZSkge1xyXG4gICAgICB0aGlzLmh0dHAoe1xyXG4gICAgICAgIHVybDogVVJMUy5wcm9maWxlLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgICAgICBsZXQgbmV3RGV0YWlscyA9IHJlc3BvbnNlLmRhdGE7XHJcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICAgIHRva2VuOiB1c2VyLnRva2VuLFxyXG4gICAgICAgICAgZGV0YWlsczogT2JqZWN0LmFzc2lnbih7fSwgdXNlci5kZXRhaWxzLCBuZXdEZXRhaWxzKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXy5jYWxsKHRoaXMpO1xyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18uY2FsbCh0aGlzKVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5mdW5jdGlvbiBfX2FsbG93ZWRQYXJhbXNfXyAoYWxsb3dlZFBhcmFtcywgcGFyYW1zKSB7XHJcbiAgbGV0IG5ld1BhcmFtcyA9IHt9O1xyXG4gIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xyXG4gICAgaWYgKGFsbG93ZWRQYXJhbXMuaW5kZXhPZihwYXJhbSkgIT0gLTEpIHtcclxuICAgICAgbmV3UGFyYW1zW3BhcmFtXSA9IHBhcmFtc1twYXJhbV07XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBuZXdQYXJhbXM7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3QgKG9iamVjdCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncGFnZVNpemUnLCdwYWdlTnVtYmVyJywnZmlsdGVyJywnc29ydCcsJ3NlYXJjaCcsJ2V4Y2x1ZGUnLCdkZWVwJywncmVsYXRlZE9iamVjdHMnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlIChvYmplY3QsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRPbmUgKG9iamVjdCwgaWQsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ2RlZXAnLCdleGNsdWRlJywnbGV2ZWwnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlIChvYmplY3QsIGlkLCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICBjb25zdCBhbGxvd2VkUGFyYW1zID0gWydyZXR1cm5PYmplY3QnLCdkZWVwJ107XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgaWQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ0RFTEVURScsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIgKG9iamVjdCwgZmlsZUFjdGlvbiwgZGF0YSA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbiIsImltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkRmlsZSAob2JqZWN0LCBmaWxlQWN0aW9uLCBmaWxlbmFtZSwgZmlsZWRhdGEsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHtmaWxlQWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgICBmaWxlZGF0YTogZmlsZWRhdGEuc3Vic3RyKGZpbGVkYXRhLmluZGV4T2YoJywnKSArIDEsIGZpbGVkYXRhLmxlbmd0aClcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVGaWxlIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcblxyXG5jbGFzcyBIdHRwIHtcclxuICBjb25zdHJ1Y3RvciAoY29uZmlnID0ge30pIHtcclxuICAgIGlmICghd2luZG93LlhNTEh0dHBSZXF1ZXN0KVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1hNTEh0dHBSZXF1ZXN0IGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG5cclxuICAgIHRoaXMuY29uZmlnID0gT2JqZWN0LmFzc2lnbih7XHJcbiAgICAgIC8vIHVybDogJy8nLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBoZWFkZXJzOiB7fSxcclxuICAgICAgcGFyYW1zOiB7fSxcclxuICAgICAgaW50ZXJjZXB0b3JzOiB7fSxcclxuICAgICAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcclxuICAgICAgcmVzcG9uc2VUeXBlOiAnanNvbicsXHJcbiAgICAgIC8vIHRpbWVvdXQ6IG51bGwsXHJcbiAgICAgIGF1dGg6IHtcclxuICAgICAgIHVzZXJuYW1lOiBudWxsLFxyXG4gICAgICAgcGFzc3dvcmQ6IG51bGxcclxuICAgICAgfVxyXG4gICAgfSwgY29uZmlnKVxyXG4gIH1cclxuICBfZ2V0SGVhZGVycyAoaGVhZGVycykge1xyXG4gICAgcmV0dXJuIGhlYWRlcnMuc3BsaXQoJ1xcclxcbicpLmZpbHRlcihoZWFkZXIgPT4gaGVhZGVyKS5tYXAoaGVhZGVyID0+IHtcclxuICAgICAgbGV0IGpoZWFkZXIgPSB7fVxyXG4gICAgICBsZXQgcGFydHMgPSBoZWFkZXIuc3BsaXQoJzonKTtcclxuICAgICAgamhlYWRlcltwYXJ0c1swXV0gPSBwYXJ0c1sxXVxyXG4gICAgICByZXR1cm4gamhlYWRlcjtcclxuICAgIH0pO1xyXG4gIH1cclxuICBfZ2V0RGF0YSAodHlwZSwgZGF0YSkge1xyXG4gICAgaWYgKCF0eXBlKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodHlwZS5pbmRleE9mKCdqc29uJykgPT09IC0xKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gICAgfVxyXG4gIH1cclxuICBfY3JlYXRlUmVzcG9uc2UgKHJlcSwgY29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXM6IHJlcS5zdGF0dXMsXHJcbiAgICAgIHN0YXR1c1RleHQ6IHJlcS5zdGF0dXNUZXh0LFxyXG4gICAgICBoZWFkZXJzOiB0aGlzLl9nZXRIZWFkZXJzKHJlcS5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSksXHJcbiAgICAgIGNvbmZpZyxcclxuICAgICAgZGF0YTogdGhpcy5fZ2V0RGF0YShyZXEuZ2V0UmVzcG9uc2VIZWFkZXIoXCJDb250ZW50LVR5cGVcIiksIHJlcS5yZXNwb25zZVRleHQpLFxyXG4gICAgfVxyXG4gIH1cclxuICBfaGFuZGxlRXJyb3IgKGRhdGEsIGNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiAwLFxyXG4gICAgICBzdGF0dXNUZXh0OiAnRVJST1InLFxyXG4gICAgICBoZWFkZXJzOiBbXSxcclxuICAgICAgY29uZmlnLFxyXG4gICAgICBkYXRhLFxyXG4gICAgfVxyXG4gIH1cclxuICBfZW5jb2RlUGFyYW1zIChwYXJhbXMpIHtcclxuICAgIGxldCBwYXJhbXNBcnIgPSBbXTtcclxuICAgIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1twYXJhbV07XG4gICAgICBpZiAodHlwZW9mIHZhbCA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICB2YWwgPSBKU09OLnN0cmluZ2lmeSh2YWwpO1xyXG4gICAgICB9XHJcbiAgICAgIHBhcmFtc0Fyci5wdXNoKGAke3BhcmFtfT0ke2VuY29kZVVSSUNvbXBvbmVudCh2YWwpfWApXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFyYW1zQXJyLmpvaW4oJyYnKTtcclxuICB9XHJcbiAgX3NldEhlYWRlcnMgKHJlcSwgaGVhZGVycykge1xyXG4gICAgZm9yIChsZXQgaGVhZGVyIGluIGhlYWRlcnMpIHtcclxuICAgICAgcmVxLnNldFJlcXVlc3RIZWFkZXIoaGVhZGVyLCBoZWFkZXJzW2hlYWRlcl0pO1xyXG4gICAgfVxyXG4gIH1cclxuICBfc2V0RGF0YSAocmVxLCBkYXRhKSB7XHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgcmVxLnNlbmQoKTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHR5cGVvZiBkYXRhICE9ICdvYmplY3QnKSB7XHJcbiAgICAgIHJlcS5zZW5kKGRhdGEpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJlcS5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvbjtjaGFyc2V0PVVURi04XCIpO1xyXG4gICAgICByZXEuc2VuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJlcXVlc3QgKGNmZywgc2NiICwgZWNiKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cclxuICAgICAgbGV0IHJlcSA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgICBsZXQgY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb25maWcsIGNmZyk7XHJcblxyXG4gICAgICBpZiAoIWNvbmZpZy51cmwgfHwgdHlwZW9mIGNvbmZpZy51cmwgIT09ICdzdHJpbmcnIHx8IGNvbmZpZy51cmwubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2hhbmRsZUVycm9yKCd1cmwgcGFyYW1ldGVyIGlzIG1pc3NpbmcnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY29uZmlnLndpdGhDcmVkZW50aWFscykgeyByZXEud2l0aENyZWRlbnRpYWxzID0gdHJ1ZSB9XHJcbiAgICAgIGlmIChjb25maWcudGltZW91dCkgeyByZXEudGltZW91dCA9IHRydWUgfVxyXG4gICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlcXVlc3QgJiYgY29uZmlnLmludGVyY2VwdG9ycy5yZXF1ZXN0LmNhbGwodGhpcywgY29uZmlnKTtcclxuICAgICAgbGV0IHBhcmFtcyA9IHRoaXMuX2VuY29kZVBhcmFtcyhjb25maWcucGFyYW1zKTtcclxuICAgICAgcmVxLm9wZW4oY29uZmlnLm1ldGhvZCwgYCR7Y29uZmlnLmJhc2VVUkwgPyBjb25maWcuYmFzZVVSTCsnLycgOiAnJ30ke2NvbmZpZy51cmx9JHtwYXJhbXMgPyAnPycrcGFyYW1zIDogJyd9YCwgdHJ1ZSwgY29uZmlnLmF1dGgudXNlcm5hbWUsIGNvbmZpZy5hdXRoLnBhc3N3b3JkKTtcclxuICAgICAgcmVxLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcigndGltZW91dCcsIGNvbmZpZyk7XHJcbiAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9O1xyXG4gICAgICByZXEub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcignYWJvcnQnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfTtcclxuICAgICAgcmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9ICgpID0+IHtcclxuICAgICAgICBpZiAocmVxLnJlYWR5U3RhdGUgPT0gWE1MSHR0cFJlcXVlc3QuRE9ORSkge1xyXG4gICAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2NyZWF0ZVJlc3BvbnNlKHJlcSwgY29uZmlnKTtcclxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzID09PSAyMDApe1xyXG4gICAgICAgICAgICBpZiAoY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2UuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgc2NiICYmIHNjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlc29sdmUocmVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IpIHtcclxuICAgICAgICAgICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuX3NldEhlYWRlcnMocmVxLCBjb25maWcuaGVhZGVycyk7XHJcbiAgICAgIHRoaXMuX3NldERhdGEocmVxLCBjb25maWcuZGF0YSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG59XHJcbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlKGNvbmZpZyA9IHt9KSB7XHJcbiAgdmFyIGNvbnRleHQgPSBuZXcgSHR0cChjb25maWcpO1xyXG4gIHZhciBpbnN0YW5jZSA9ICguLi5hcmdzKSA9PiBIdHRwLnByb3RvdHlwZS5yZXF1ZXN0LmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xyXG4gIGluc3RhbmNlLmNvbmZpZyA9IGNvbnRleHQuY29uZmlnO1xyXG4gIHJldHVybiBpbnN0YW5jZTtcclxufVxyXG5cclxudmFyIGh0dHAgPSBjcmVhdGVJbnN0YW5jZSgpO1xyXG5odHRwLmNyZWF0ZSA9IChjb25maWcpID0+IHtcclxuICByZXR1cm4gY3JlYXRlSW5zdGFuY2UoY29uZmlnKTtcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGh0dHA7XHJcbndpbmRvdy5odHRwID0gd2luZG93Lmh0dHAgfHwgaHR0cDtcclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU29ja2V0IHtcclxuICBjb25zdHJ1Y3RvciAodXJsKSB7XHJcbiAgICBpZiAoIXdpbmRvdy5pbylcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdydW5Tb2NrZXQgaXMgdHJ1ZSBidXQgc29ja2V0aW8tY2xpZW50IGlzIG5vdCBpbmNsdWRlZCcpO1xyXG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5vbkFyciA9IFtdO1xuICAgIHRoaXMuc29ja2V0ID0gbnVsbDtcbiAgfVxyXG4gIG9uIChldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLm9uQXJyLnB1c2goe2V2ZW50TmFtZSwgY2FsbGJhY2t9KTtcclxuICB9XHJcbiAgY29ubmVjdCAodG9rZW4sIGFub255bW91c1Rva2VuLCBhcHBOYW1lKSB7XHJcbiAgICB0aGlzLmRpc2Nvbm5lY3QoKTtcclxuICAgIHRoaXMuc29ja2V0ID0gaW8uY29ubmVjdCh0aGlzLnVybCwgeydmb3JjZU5ldyc6dHJ1ZSB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignY29ubmVjdCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGB0cnlpbmcgdG8gZXN0YWJsaXNoIGEgc29ja2V0IGNvbm5lY3Rpb24gdG8gJHthcHBOYW1lfSAuLi5gKTtcclxuICAgICAgdGhpcy5zb2NrZXQuZW1pdChcImxvZ2luXCIsIHRva2VuLCBhbm9ueW1vdXNUb2tlbiwgYXBwTmFtZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignYXV0aG9yaXplZCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgY29ubmVjdGVkYCk7XHJcbiAgICAgIHRoaXMub25BcnIuZm9yRWFjaChmbiA9PiB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQub24oZm4uZXZlbnROYW1lLCBkYXRhID0+IHtcclxuICAgICAgICAgIGZuLmNhbGxiYWNrKGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdub3RBdXRob3JpemVkJywgKCkgPT4ge1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZGlzY29ubmVjdCgpLCAxMDAwKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCBkaXNjb25uZWN0YCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbigncmVjb25uZWN0aW5nJywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCByZWNvbm5lY3RpbmdgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLndhcm4oYGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGRpc2Nvbm5lY3QgKCkge1xyXG4gICAgaWYgKHRoaXMuc29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFN0b3JhZ2Uge1xyXG4gIGNvbnN0cnVjdG9yIChzdG9yYWdlLCBwcmVmaXggPSAnJykge1xyXG4gICAgaWYgKCFzdG9yYWdlKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG4gICAgaWYgKCFzdG9yYWdlLnNldEl0ZW0gfHwgIXN0b3JhZ2UuZ2V0SXRlbSB8fCAhc3RvcmFnZS5yZW1vdmVJdGVtIHx8ICFzdG9yYWdlLmNsZWFyKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIG5vdCBpbXBsZW1lbnQgdGhlIG5lY2Vzc2FyeSBmdW5jdGlvbnMnKTtcclxuICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XHJcbiAgICB0aGlzLnByZWZpeCA9IHByZWZpeDtcclxuICAgIHRoaXMuZGVsaW1pdGVyID0gJ19fX19fX19fX18nO1xyXG4gIH1cclxuICBnZXQgKGtleSkge1xyXG4gICAgbGV0IGl0ZW0gPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICAgIGlmICghaXRlbSkge1xyXG4gICAgICByZXR1cm4gaXRlbVxyXG4gICAgfVxyXG4gICAgZWxzZSB7XG4gICAgICBsZXQgW3R5cGUsIHZhbF0gPSBpdGVtLnNwbGl0KHRoaXMuZGVsaW1pdGVyKTtcbiAgICAgIGlmICh0eXBlICE9ICdKU09OJykge1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbCk7XG4gICAgICB9XG4gICAgfVxyXG4gIH1cclxuICBzZXQgKGtleSwgdmFsKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbCAhPSAnb2JqZWN0Jykge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgU1RSSU5HJHt0aGlzLmRlbGltaXRlcn0ke3ZhbH1gKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgSlNPTiR7dGhpcy5kZWxpbWl0ZXJ9JHtKU09OLnN0cmluZ2lmeSh2YWwpfWApO1xyXG4gICAgfVxyXG4gIH1cclxuICByZW1vdmUgKGtleSkge1xyXG4gICAgdGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oYCR7dGhpcy5wcmVmaXh9JHtrZXl9YCk7XHJcbiAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIGZvcih2YXIgaSA9MDsgaSA8IHRoaXMuc3RvcmFnZS5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICBpZih0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2Uua2V5KGkpKS5pbmRleE9mKHRoaXMucHJlZml4KSAhPSAtMSlcclxuICAgICAgICB0aGlzLnJlbW92ZSh0aGlzLnN0b3JhZ2Uua2V5KGkpKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXX0=
