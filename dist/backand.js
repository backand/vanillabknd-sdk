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
backand.initiate = function () {
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
  delete backand.initiate;
  _extends(backand, { service: service });
  if (_defaults2.default.runSocket) {
    storage.get('user') && socket.connect(storage.get('user').token.Authorization || null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    _extends(backand, { socket: socket });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGNydWQuanMiLCJzcmNcXHNlcnZpY2VzXFxmaWxlcy5qcyIsInNyY1xcdXRpbHNcXGh0dHAuanMiLCJzcmNcXHV0aWxzXFxzb2NrZXQuanMiLCJzcmNcXHV0aWxzXFxzdG9yYWdlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwb0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcExPLElBQU0sMEJBQVM7QUFDcEIsVUFBUSxRQURZO0FBRXBCLFdBQVMsU0FGVztBQUdwQixVQUFRO0FBSFksQ0FBZjs7QUFNQSxJQUFNLHNCQUFPO0FBQ2xCLFNBQU8sT0FEVztBQUVsQixVQUFRLGVBRlU7QUFHbEIsd0JBQXNCLDZCQUhKO0FBSWxCLGlCQUFlLHNCQUpHO0FBS2xCLGtCQUFnQix1QkFMRTtBQU1sQixXQUFTLFdBTlM7QUFPbEIsaUJBQWUsa0JBUEc7QUFRbEI7QUFDQTtBQUNBLHlCQUF1Qix1QkFWTDtBQVdsQixXQUFTO0FBWFMsQ0FBYjs7QUFjQSxJQUFNLDhDQUFtQjtBQUM5QixVQUFRLEVBQUMsTUFBTSxRQUFQLEVBQWlCLE9BQU8sUUFBeEIsRUFBa0MsS0FBSyxnQkFBdkMsRUFBeUQsS0FBSyxFQUFDLGlCQUFpQixNQUFsQixFQUE5RCxFQUF5RixJQUFJLENBQTdGLEVBRHNCO0FBRTlCLFVBQVEsRUFBQyxNQUFNLFFBQVAsRUFBaUIsT0FBTyxRQUF4QixFQUFrQyxLQUFLLGdCQUF2QyxFQUF5RCxLQUFLLEVBQUMsaUJBQWlCLFNBQWxCLEVBQTlELEVBQTRGLElBQUksQ0FBaEcsRUFGc0I7QUFHOUIsWUFBVSxFQUFDLE1BQU0sVUFBUCxFQUFtQixPQUFPLFVBQTFCLEVBQXNDLEtBQUssa0JBQTNDLEVBQStELEtBQUssRUFBQyxpQkFBaUIsU0FBbEIsRUFBcEUsRUFBa0csSUFBSSxDQUF0RyxFQUhvQjtBQUk5QixXQUFTLEVBQUMsTUFBTSxTQUFQLEVBQWtCLE9BQU8sU0FBekIsRUFBb0MsS0FBSyxpQkFBekMsRUFBNEQsS0FBSyxFQUFDLGlCQUFpQixTQUFsQixFQUFqRSxFQUErRixJQUFJLENBQW5HO0FBSnFCLENBQXpCOzs7Ozs7OztrQkNwQlE7QUFDYixXQUFTLElBREk7QUFFYixrQkFBZ0IsSUFGSDtBQUdiLGVBQWEsSUFIQTtBQUliLFVBQVEseUJBSks7QUFLYixXQUFTLE9BQU8sWUFMSDtBQU1iLGlCQUFlLFVBTkY7QUFPYixzQkFBb0IsSUFQUDtBQVFiLHdCQUFzQixJQVJUO0FBU2IsYUFBVyxLQVRFO0FBVWIsYUFBVyw0QkFWRTtBQVdiLFlBQVU7QUFYRyxDOzs7Ozs7Ozs7Ozs7O0FDQVIsSUFBTSwwQkFBUztBQUNwQixVQUFRLGdCQUFDLFNBQUQsRUFBWSxRQUFaLEVBQXNCLEtBQXRCLEVBQWdDO0FBQ3RDLFdBQU87QUFDTCwwQkFESztBQUVMLHdCQUZLO0FBR0w7QUFISyxLQUFQO0FBS0QsR0FQbUI7QUFRcEIsYUFBVztBQUNULGFBQVMsRUFBRSxRQUFRLFFBQVYsRUFBb0IsV0FBVyxXQUEvQixFQUE0QyxhQUFhLGFBQXpELEVBQXdFLHVCQUF1Qix1QkFBL0YsRUFBd0gsVUFBVSxVQUFsSSxFQUE4SSxvQkFBb0Isb0JBQWxLLEVBQXdMLE9BQU8sT0FBL0wsRUFBd00sVUFBVSxVQUFsTixFQURBO0FBRVQsVUFBTSxFQUFFLFFBQVEsUUFBVixFQUFvQixXQUFXLFdBQS9CLEVBQTRDLGFBQWEsYUFBekQsRUFBd0UsdUJBQXVCLHVCQUEvRixFQUF3SCxVQUFVLFVBQWxJLEVBQThJLG9CQUFvQixvQkFBbEssRUFBd0wsT0FBTyxPQUEvTCxFQUF3TSxVQUFVLFVBQWxOLEVBRkc7QUFHVCxVQUFNLEVBQUUsUUFBUSxRQUFWLEVBQW9CLFdBQVcsV0FBL0IsRUFBNEMsWUFBWSxZQUF4RCxFQUFzRSxVQUFVLFVBQWhGLEVBQTRGLFVBQVUsVUFBdEcsRUFBa0gsYUFBYSxhQUEvSCxFQUE4SSxPQUFPLE9BQXJKLEVBQThKLFVBQVUsVUFBeEssRUFIRztBQUlULGFBQVMsRUFBRSxRQUFRLFFBQVYsRUFKQTtBQUtULGNBQVUsRUFBRSxJQUFJLElBQU47QUFMRDtBQVJTLENBQWY7O0FBaUJBLElBQU0sc0JBQU87QUFDbEIsVUFBUSxnQkFBQyxTQUFELEVBQVksS0FBWixFQUFzQjtBQUM1QixXQUFPO0FBQ0wsMEJBREs7QUFFTDtBQUZLLEtBQVA7QUFJRCxHQU5pQjtBQU9sQixVQUFRLEVBQUUsS0FBSyxLQUFQLEVBQWMsTUFBTSxNQUFwQjtBQVBVLENBQWI7O0FBVUEsSUFBTSw0QkFBVTtBQUNyQixXQUFTLEVBQUUsVUFBVSxVQUFaLEVBQXdCLFdBQVcsV0FBbkMsRUFBZ0QsS0FBSyxvQkFBckQ7QUFEWSxDQUFoQjs7SUFJTSxlLFdBQUEsZTtBQUNYLDZCQUFjO0FBQUE7O0FBQ1osUUFBSSxLQUFLLFdBQUwsS0FBcUIsZUFBekIsRUFBMEM7QUFDeEMsWUFBTSxJQUFJLFNBQUosQ0FBYyxtQ0FBZCxDQUFOO0FBQ0Q7QUFDRCxRQUFJLEtBQUssT0FBTCxLQUFpQixTQUFqQixJQUE4QixLQUFLLE9BQUwsS0FBaUIsZ0JBQWdCLFNBQWhCLENBQTBCLE9BQTdFLEVBQXNGO0FBQ3BGLFlBQU0sSUFBSSxTQUFKLENBQWMsK0JBQWQsQ0FBTjtBQUNEO0FBQ0QsUUFBSSxLQUFLLE9BQUwsS0FBaUIsU0FBakIsSUFBOEIsS0FBSyxPQUFMLEtBQWlCLGdCQUFnQixTQUFoQixDQUEwQixPQUE3RSxFQUFzRjtBQUNwRixZQUFNLElBQUksU0FBSixDQUFjLCtCQUFkLENBQU47QUFDRDtBQUNELFFBQUksS0FBSyxVQUFMLEtBQW9CLFNBQXBCLElBQWlDLEtBQUssVUFBTCxLQUFvQixnQkFBZ0IsU0FBaEIsQ0FBMEIsVUFBbkYsRUFBK0Y7QUFDN0YsWUFBTSxJQUFJLFNBQUosQ0FBYyxrQ0FBZCxDQUFOO0FBQ0Q7QUFDRCxRQUFJLEtBQUssS0FBTCxLQUFlLFNBQWYsSUFBNEIsS0FBSyxLQUFMLEtBQWUsZ0JBQWdCLFNBQWhCLENBQTBCLEtBQXpFLEVBQWdGO0FBQzlFLFlBQU0sSUFBSSxTQUFKLENBQWMsNkJBQWQsQ0FBTjtBQUNEO0FBQ0Q7QUFDRDs7Ozs0QkFDUSxFLEVBQUksRyxFQUFLO0FBQ2hCLFlBQU0sSUFBSSxTQUFKLENBQWMsaURBQWQsQ0FBTjtBQUNBO0FBQ0Q7Ozs0QkFDUSxFLEVBQUk7QUFDWCxZQUFNLElBQUksU0FBSixDQUFjLGlEQUFkLENBQU47QUFDQTtBQUNEOzs7K0JBQ1csRSxFQUFJO0FBQ2QsWUFBTSxJQUFJLFNBQUosQ0FBYyxvREFBZCxDQUFOO0FBQ0E7QUFDQTtBQUNBOzs7NEJBQ087QUFDUCxZQUFNLElBQUksU0FBSixDQUFjLCtDQUFkLENBQU47QUFDQTtBQUNBOzs7Ozs7Ozs7a1FDbEVKOzs7Ozs7OztBQU1BOzs7O0FBQ0E7O0lBQVksUzs7QUFDWjs7SUFBWSxPOztBQUNaOzs7O0FBQ0E7Ozs7QUFDQTs7OztBQUNBOztJQUFZLEk7O0FBQ1o7O0lBQVksSTs7QUFDWjs7SUFBWSxLOzs7Ozs7QUFFWixJQUFJLFVBQVU7QUFDWixzQkFEWTtBQUVaO0FBRlksQ0FBZDtBQUlBLFFBQVEsUUFBUixHQUFtQixZQUFpQjtBQUFBLE1BQWhCLE1BQWdCLHVFQUFQLEVBQU87OztBQUVsQztBQUNBLCtCQUF3QixNQUF4QjtBQUNBOztBQUVBO0FBQ0EsTUFBSSxDQUFDLG1CQUFTLE9BQWQsRUFDRSxNQUFNLElBQUksS0FBSixDQUFVLG9CQUFWLENBQU47QUFDRixNQUFJLENBQUMsbUJBQVMsY0FBZCxFQUNFLE1BQU0sSUFBSSxLQUFKLENBQVUsMkJBQVYsQ0FBTjtBQUNGLE1BQUksQ0FBQyxtQkFBUyxXQUFkLEVBQ0UsTUFBTSxJQUFJLEtBQUosQ0FBVSx3QkFBVixDQUFOOztBQUVGO0FBQ0EsTUFBSSxVQUFVLHNCQUFZLG1CQUFTLE9BQXJCLEVBQThCLG1CQUFTLGFBQXZDLENBQWQ7QUFDQSxNQUFJLE9BQU8sZUFBSyxNQUFMLENBQVk7QUFDckIsYUFBUyxtQkFBUztBQURHLEdBQVosQ0FBWDtBQUdBLE1BQUksUUFBUTtBQUNWLG9CQURVO0FBRVYsY0FGVTtBQUdWLFVBQU0sT0FBTyxRQUFQLEtBQW9CLFNBQVMsQ0FBQyxDQUFDLFNBQVMsWUFBeEM7QUFISSxHQUFaO0FBS0EsTUFBSSxTQUFTLElBQWI7QUFDQSxNQUFJLG1CQUFTLFNBQWIsRUFBd0I7QUFDdEIsYUFBUyxxQkFBVyxtQkFBUyxTQUFwQixDQUFUO0FBQ0EsVUFBTSxNQUFOLEdBQWUsTUFBZjtBQUNEOztBQUVEO0FBQ0EsTUFBSSxVQUFVLFNBQWMsRUFBZCxFQUFrQixJQUFsQixFQUF3QixJQUF4QixFQUE4QixLQUE5QixDQUFkO0FBQ0EsT0FBSyxJQUFJLEVBQVQsSUFBZSxPQUFmLEVBQXdCO0FBQ3RCLFlBQVEsRUFBUixJQUFjLFFBQVEsRUFBUixFQUFZLElBQVosQ0FBaUIsS0FBakIsQ0FBZDtBQUNEOztBQUVEO0FBQ0EsT0FBSyxNQUFMLENBQVksWUFBWixHQUEyQjtBQUN6QixhQUFTLGlCQUFTLE1BQVQsRUFBaUI7QUFDeEIsVUFBSSxPQUFPLEdBQVAsQ0FBVyxPQUFYLENBQW1CLFVBQVUsSUFBVixDQUFlLEtBQWxDLE1BQThDLENBQUMsQ0FBL0MsSUFBb0QsUUFBUSxHQUFSLENBQVksTUFBWixDQUF4RCxFQUE2RTtBQUMzRSxlQUFPLE9BQVAsR0FBaUIsU0FBYyxFQUFkLEVBQWtCLE9BQU8sT0FBekIsRUFBa0MsUUFBUSxHQUFSLENBQVksTUFBWixFQUFvQixLQUF0RCxDQUFqQjtBQUNEO0FBQ0YsS0FMd0I7QUFNekIsbUJBQWUsdUJBQVUsS0FBVixFQUFpQixNQUFqQixFQUF5QixPQUF6QixFQUFrQyxNQUFsQyxFQUEwQyxHQUExQyxFQUErQyxHQUEvQyxFQUFvRDtBQUFBOztBQUNqRSxVQUFJLE9BQU8sR0FBUCxDQUFXLE9BQVgsQ0FBbUIsVUFBVSxJQUFWLENBQWUsS0FBbEMsTUFBOEMsQ0FBQyxDQUEvQyxJQUNBLG1CQUFTLGtCQURULElBRUEsTUFBTSxNQUFOLEtBQWlCLEdBRmpCLElBR0EsTUFBTSxJQUhOLElBR2MsTUFBTSxJQUFOLENBQVcsT0FBWCxLQUF1QiwwQkFIekMsRUFHcUU7QUFDbEUsYUFBSyxzQkFBTCxDQUE0QixJQUE1QixDQUFpQyxLQUFqQyxFQUF3QyxLQUF4QyxFQUNDLElBREQsQ0FDTSxvQkFBWTtBQUNoQixnQkFBSyxPQUFMLENBQWEsTUFBYixFQUFxQixHQUFyQixFQUEwQixHQUExQjtBQUNELFNBSEQsRUFJQyxLQUpELENBSU8saUJBQVM7QUFDZCxpQkFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGlCQUFPLEtBQVA7QUFDRCxTQVBEO0FBUUYsT0FaRCxNQWFLO0FBQ0gsZUFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGVBQU8sS0FBUDtBQUNEO0FBQ0Y7QUF4QndCLEdBQTNCOztBQTJCQTtBQUNBLE1BQUksQ0FBQyxtQkFBUyxRQUFkLEVBQXdCO0FBQ3RCLFFBQUksWUFBWSxzQkFBc0IsSUFBdEIsQ0FBMkIsT0FBTyxRQUFQLENBQWdCLElBQTNDLENBQWhCO0FBQ0EsUUFBSSxhQUFhLFVBQVUsQ0FBVixDQUFiLElBQTZCLFVBQVUsQ0FBVixDQUFqQyxFQUErQztBQUM3QyxVQUFJLE9BQU87QUFDVCxjQUFNLEtBQUssS0FBTCxDQUFXLG1CQUFtQixVQUFVLENBQVYsRUFBYSxPQUFiLENBQXFCLEtBQXJCLEVBQTRCLEVBQTVCLENBQW5CLENBQVg7QUFERyxPQUFYO0FBR0EsV0FBSyxNQUFMLEdBQWUsVUFBVSxDQUFWLE1BQWlCLE1BQWxCLEdBQTRCLEdBQTVCLEdBQWtDLENBQWhEO0FBQ0EsbUJBQWEsT0FBYixDQUFxQixhQUFyQixFQUFvQyxLQUFLLFNBQUwsQ0FBZSxJQUFmLENBQXBDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDRDtBQUNGOztBQUVEO0FBQ0EsU0FBTyxRQUFRLFFBQWY7QUFDQSxXQUFjLE9BQWQsRUFBdUIsRUFBQyxnQkFBRCxFQUF2QjtBQUNBLE1BQUcsbUJBQVMsU0FBWixFQUF1QjtBQUNyQixZQUFRLEdBQVIsQ0FBWSxNQUFaLEtBQXVCLE9BQU8sT0FBUCxDQUFlLFFBQVEsR0FBUixDQUFZLE1BQVosRUFBb0IsS0FBcEIsQ0FBMEIsYUFBMUIsSUFBMkMsSUFBMUQsRUFBZ0UsbUJBQVMsY0FBekUsRUFBeUYsbUJBQVMsT0FBbEcsQ0FBdkI7QUFDQSxhQUFjLE9BQWQsRUFBdUIsRUFBQyxjQUFELEVBQXZCO0FBQ0Q7QUFFRixDQXhGRDs7QUEwRkEsT0FBTyxPQUFQLEdBQWlCLE9BQWpCOzs7Ozs7Ozs7OztRQ2xGZ0Isc0IsR0FBQSxzQjtRQW9CQSxnQixHQUFBLGdCO1FBNkJBLE0sR0FBQSxNO1FBOEJBLE0sR0FBQSxNO1FBbUZBLFksR0FBQSxZO1FBbUJBLHFCLEdBQUEscUI7UUE2REEsWSxHQUFBLFk7UUE2REEsb0IsR0FBQSxvQjtRQVVBLGEsR0FBQSxhO1FBVUEsYyxHQUFBLGM7UUFVQSxPLEdBQUEsTztRQXNCQSxjLEdBQUEsYzs7QUEvWGhCOztBQUNBOztBQUNBOzs7Ozs7QUFFQSxTQUFTLHdCQUFULEdBQXlGO0FBQUEsTUFBdEQsTUFBc0QsdUVBQTdDLENBQTZDO0FBQUEsTUFBMUMsVUFBMEMsdUVBQTdCLEVBQTZCO0FBQUEsTUFBekIsT0FBeUIsdUVBQWYsRUFBZTtBQUFBLE1BQVgsSUFBVyx1RUFBSixFQUFJOztBQUN2RixTQUFPO0FBQ0wsa0JBREs7QUFFTCwwQkFGSztBQUdMLG9CQUhLO0FBSUw7QUFKSyxHQUFQO0FBTUQ7QUFDRCxTQUFTLGlCQUFULENBQTRCLElBQTVCLEVBQWtDO0FBQ2hDLE1BQUksY0FBSjtBQUNBLE1BQUcsbUJBQVMsUUFBWixFQUNFO0FBQ0YsTUFBSSxTQUFTLFdBQWIsRUFBMEI7QUFDeEIsWUFBUSxTQUFTLFdBQVQsQ0FBcUIsT0FBckIsQ0FBUjtBQUNBLFVBQU0sU0FBTixDQUFnQixJQUFoQixFQUFzQixJQUF0QixFQUE0QixJQUE1QjtBQUNBLFVBQU0sU0FBTixHQUFrQixJQUFsQjtBQUNBLFdBQU8sYUFBUCxDQUFxQixLQUFyQjtBQUNELEdBTEQsTUFLTztBQUNMLFlBQVEsU0FBUyxpQkFBVCxFQUFSO0FBQ0EsVUFBTSxTQUFOLEdBQWtCLElBQWxCO0FBQ0EsVUFBTSxTQUFOLEdBQWtCLElBQWxCO0FBQ0EsV0FBTyxTQUFQLENBQWlCLE9BQU8sTUFBTSxTQUE5QixFQUF5QyxLQUF6QztBQUNEO0FBQ0Y7QUFDTSxTQUFTLHNCQUFULENBQWlDLEtBQWpDLEVBQXdDO0FBQUE7O0FBQzdDLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxRQUFJLE9BQU8sTUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixDQUFYO0FBQ0EsUUFBSSxDQUFDLElBQUQsSUFBUyxDQUFDLEtBQUssT0FBTCxDQUFhLGFBQTNCLEVBQTBDO0FBQ3hDLGFBQU8seUJBQXlCLENBQXpCLEVBQTRCLEVBQTVCLEVBQWdDLEVBQWhDLEVBQW9DLG1FQUFwQyxDQUFQO0FBQ0QsS0FGRCxNQUdLO0FBQ0gsMEJBQW9CLElBQXBCLFFBQStCO0FBQzdCLGtCQUFVLEtBQUssT0FBTCxDQUFhLFFBRE07QUFFN0Isc0JBQWMsS0FBSyxPQUFMLENBQWE7QUFGRSxPQUEvQixFQUlDLElBSkQsQ0FJTSxvQkFBWTtBQUNoQixnQkFBUSxRQUFSO0FBQ0QsT0FORCxFQU9DLEtBUEQsQ0FPTyxpQkFBUztBQUNkLGVBQU8sS0FBUDtBQUNELE9BVEQ7QUFVRDtBQUNGLEdBakJNLENBQVA7QUFrQkQ7QUFDTSxTQUFTLGdCQUFULENBQTJCLEdBQTNCLEVBQWdDO0FBQUE7O0FBQ3JDLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxRQUFJLFVBQVU7QUFDWixzQkFBZ0IsbUJBQVMsY0FEYjtBQUVaLG9CQUFjLGdCQUZGO0FBR1osb0JBQWMsQ0FIRjtBQUlaLGlCQUFXLG1CQUFTLE9BSlI7QUFLWixrQkFBWSxPQUxBO0FBTVosY0FBUSxNQU5JO0FBT1osbUJBQWEsV0FQRDtBQVFaLGtCQUFZLFdBUkE7QUFTWixrQkFBWSxFQVRBO0FBVVosZUFBUyxDQVZHO0FBV1osZ0JBQVU7QUFYRSxLQUFkO0FBYUEsV0FBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixFQUF5QjtBQUN2QixhQUFPO0FBQ0wsd0JBQWdCLG1CQUFTO0FBRHBCLE9BRGdCO0FBSXZCO0FBSnVCLEtBQXpCO0FBTUEsc0JBQWtCLGtCQUFPLE1BQXpCO0FBQ0EsUUFBSSxtQkFBUyxTQUFiLEVBQXdCO0FBQ3RCLGFBQUssTUFBTCxDQUFZLE9BQVosQ0FBb0IsSUFBcEIsRUFBMEIsbUJBQVMsY0FBbkMsRUFBbUQsbUJBQVMsT0FBNUQ7QUFDRDtBQUNELFdBQU8sSUFBSSx5QkFBeUIsR0FBekIsRUFBOEIsSUFBOUIsRUFBb0MsRUFBcEMsRUFBd0MsT0FBeEMsQ0FBSixDQUFQO0FBQ0EsWUFBUSx5QkFBeUIsR0FBekIsRUFBOEIsSUFBOUIsRUFBb0MsRUFBcEMsRUFBd0MsT0FBeEMsQ0FBUjtBQUNELEdBMUJNLENBQVA7QUEyQkQ7QUFDTSxTQUFTLE1BQVQsQ0FBaUIsUUFBakIsRUFBMkIsUUFBM0IsRUFBcUMsR0FBckMsRUFBMEMsR0FBMUMsRUFBK0M7QUFBQTs7QUFDcEQsU0FBTyx3QkFBWSxVQUFDLE9BQUQsRUFBVSxNQUFWLEVBQXFCO0FBQ3RDLFdBQUssSUFBTCxDQUFVO0FBQ1IsV0FBSyxnQkFBSyxLQURGO0FBRVIsY0FBUSxNQUZBO0FBR1IsZUFBUztBQUNQLHdCQUFnQjtBQURULE9BSEQ7QUFNUiwwQkFBa0IsUUFBbEIsa0JBQXVDLFFBQXZDLGlCQUEyRCxtQkFBUyxPQUFwRTtBQU5RLEtBQVYsRUFRQyxJQVJELENBUU0sb0JBQVk7QUFDaEIsYUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixFQUF5QjtBQUN2QixlQUFPO0FBQ0wscUNBQXlCLFNBQVMsSUFBVCxDQUFjO0FBRGxDLFNBRGdCO0FBSXZCLGlCQUFTLFNBQVM7QUFKSyxPQUF6QjtBQU1BLHdCQUFrQixrQkFBTyxNQUF6QjtBQUNBLFVBQUksbUJBQVMsU0FBYixFQUF3QjtBQUN0QixlQUFLLE1BQUwsQ0FBWSxPQUFaLENBQW9CLE9BQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsTUFBakIsRUFBeUIsS0FBekIsQ0FBK0IsYUFBbkQsRUFBa0UsbUJBQVMsY0FBM0UsRUFBMkYsbUJBQVMsT0FBcEc7QUFDRDtBQUNELGFBQU8sSUFBSSxRQUFKLENBQVA7QUFDQSxjQUFRLFFBQVI7QUFDRCxLQXJCRCxFQXNCQyxLQXRCRCxDQXNCTyxpQkFBUztBQUNkLGFBQU8sSUFBSSxLQUFKLENBQVA7QUFDQSxhQUFPLEtBQVA7QUFDRCxLQXpCRDtBQTBCRCxHQTNCTSxDQUFQO0FBNEJEO0FBQ00sU0FBUyxNQUFULENBQWlCLEtBQWpCLEVBQXdCLFFBQXhCLEVBQWtDLGVBQWxDLEVBQW1ELFNBQW5ELEVBQThELFFBQTlELEVBQXdFLEdBQXhFLEVBQTZFLEdBQTdFLEVBQWtGO0FBQUE7O0FBQ3ZGLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxXQUFLLElBQUwsQ0FBVTtBQUNSLFdBQUssZ0JBQUssTUFERjtBQUVSLGNBQVEsTUFGQTtBQUdSLGVBQVM7QUFDUCx1QkFBZSxtQkFBUztBQURqQixPQUhEO0FBTVIsWUFBTTtBQUNKLDRCQURJO0FBRUosMEJBRkk7QUFHSixvQkFISTtBQUlKLDBCQUpJO0FBS0o7QUFMSTtBQU5FLEtBQVYsRUFhRyxHQWJILEVBYVMsR0FiVCxFQWNDLElBZEQsQ0FjTSxvQkFBWTtBQUNoQix3QkFBa0Isa0JBQU8sTUFBekI7QUFDQSxVQUFHLG1CQUFTLG9CQUFaLEVBQWtDO0FBQ2hDLGVBQU8sT0FBTyxJQUFQLFNBQWtCLFNBQVMsSUFBVCxDQUFjLFFBQWhDLEVBQTBDLFFBQTFDLENBQVA7QUFDRCxPQUZELE1BR0s7QUFDSCxlQUFPLElBQUksUUFBSixDQUFQO0FBQ0EsZ0JBQVEsUUFBUjtBQUNEO0FBQ0YsS0F2QkQsRUF3QkMsSUF4QkQsQ0F3Qk0sb0JBQVk7QUFDaEIsYUFBTyxJQUFJLFFBQUosQ0FBUDtBQUNBLGNBQVEsUUFBUjtBQUNELEtBM0JELEVBNEJDLEtBNUJELENBNEJPLGlCQUFTO0FBQ2QsYUFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGFBQU8sS0FBUDtBQUNELEtBL0JEO0FBZ0NELEdBakNNLENBQVA7QUFrQ0Q7QUFDRCxTQUFTLGdCQUFULENBQTJCLFlBQTNCLEVBQXlDLFFBQXpDLEVBQW1ELFlBQW5ELEVBQWlFO0FBQy9ELE1BQUksV0FBVyw0QkFBaUIsWUFBakIsQ0FBZjtBQUNBLE1BQUksU0FBUyxXQUFXLElBQVgsR0FBa0IsSUFBL0I7QUFDQSxNQUFJLDZDQUEyQyxDQUFDLFFBQUQsSUFBYSxZQUFkLEdBQThCLE1BQTlCLEdBQXVDLE9BQWpGLENBQUo7QUFDQSw4QkFBMEIsTUFBMUIsa0JBQTZDLFNBQVMsS0FBdEQsR0FBOEQsZUFBOUQseURBQWlJLFNBQVMsR0FBMUk7QUFDRDtBQUNELFNBQVMsY0FBVCxDQUF5QixRQUF6QixFQUFtQyxRQUFuQyxFQUE2QyxJQUE3QyxFQUFtRCxLQUFuRCxFQUEwRDtBQUFBOztBQUN4RCxTQUFPLHdCQUFZLFVBQUMsT0FBRCxFQUFVLE1BQVYsRUFBcUI7QUFDdEMsUUFBSSxDQUFDLDRCQUFpQixRQUFqQixDQUFMLEVBQWlDO0FBQy9CLGFBQU8seUJBQXlCLENBQXpCLEVBQTRCLEVBQTVCLEVBQWdDLEVBQWhDLEVBQW9DLHlCQUFwQyxDQUFQO0FBQ0Q7QUFDRCxRQUFJLE1BQVUsbUJBQVMsTUFBbkIsV0FBK0IsaUJBQWlCLFFBQWpCLEVBQTJCLFFBQTNCLEVBQXFDLElBQXJDLENBQS9CLGlCQUFxRixtQkFBUyxPQUE5RixJQUF3RyxRQUFRLFlBQVUsS0FBbEIsR0FBMEIsRUFBbEkscUJBQUosQ0FKc0MsQ0FJb0g7QUFDMUosUUFBSSxRQUFRLElBQVo7QUFDQSxRQUFJLENBQUMsT0FBSyxJQUFWLEVBQWdCO0FBQ2QsY0FBUSxPQUFPLElBQVAsQ0FBWSxHQUFaLEVBQWlCLGFBQWpCLEVBQWdDLElBQWhDLENBQVI7QUFDRCxLQUZELE1BR0s7QUFDSCxjQUFRLE9BQU8sSUFBUCxDQUFZLEVBQVosRUFBZ0IsRUFBaEIsRUFBb0IsSUFBcEIsQ0FBUjtBQUNBLFlBQU0sUUFBTixHQUFpQixHQUFqQjtBQUNEO0FBQ0QsUUFBSSxTQUFTLE1BQU0sS0FBbkIsRUFBMEI7QUFBRSxZQUFNLEtBQU47QUFBZTs7QUFFM0MsUUFBSSxXQUFVLGlCQUFTLENBQVQsRUFBWTtBQUN4QixVQUFJLE1BQU0sRUFBRSxJQUFGLEtBQVcsU0FBWCxHQUF1QixFQUFFLE1BQXpCLEdBQWtDLEVBQUUsR0FBOUM7QUFDQSxVQUFJLElBQUksT0FBSixDQUFZLE9BQU8sUUFBUCxDQUFnQixJQUE1QixNQUFzQyxDQUFDLENBQTNDLEVBQThDO0FBQzVDLGVBQU8seUJBQXlCLENBQXpCLEVBQTRCLEVBQTVCLEVBQWdDLEVBQWhDLEVBQW9DLHdCQUFwQyxDQUFQO0FBQ0Q7O0FBRUQsVUFBSSxNQUFNLEVBQUUsSUFBRixLQUFXLFNBQVgsR0FBdUIsS0FBSyxLQUFMLENBQVcsRUFBRSxJQUFiLENBQXZCLEdBQTRDLEtBQUssS0FBTCxDQUFXLEVBQUUsUUFBYixDQUF0RDtBQUNBLGFBQU8sbUJBQVAsQ0FBMkIsRUFBRSxJQUE3QixFQUFtQyxRQUFuQyxFQUE0QyxLQUE1QztBQUNBLFVBQUksU0FBUyxNQUFNLEtBQW5CLEVBQTBCO0FBQUUsY0FBTSxLQUFOO0FBQWU7QUFDM0MsUUFBRSxJQUFGLEtBQVcsU0FBWCxJQUF3QixhQUFhLFVBQWIsQ0FBd0IsRUFBRSxHQUExQixDQUF4Qjs7QUFFQSxVQUFJLElBQUksTUFBSixJQUFjLEdBQWxCLEVBQXVCO0FBQ3JCLGVBQU8sR0FBUDtBQUNELE9BRkQsTUFHSztBQUNILGdCQUFRLEdBQVI7QUFDRDtBQUVGLEtBbEJEO0FBbUJBLGVBQVUsU0FBUSxJQUFSLENBQWEsS0FBYixDQUFWOztBQUVBLFdBQU8sZ0JBQVAsQ0FBd0IsU0FBeEIsRUFBbUMsUUFBbkMsRUFBNkMsS0FBN0M7QUFDQTtBQUNELEdBdENNLENBQVA7QUF1Q0Q7QUFDTSxTQUFTLFlBQVQsQ0FBdUIsUUFBdkIsRUFBaUMsR0FBakMsRUFBc0MsR0FBdEMsRUFBMEY7QUFBQTs7QUFBQSxNQUEvQyxJQUErQyx1RUFBeEMsc0NBQXdDOztBQUMvRixTQUFPLHdCQUFZLFVBQUMsT0FBRCxFQUFVLE1BQVYsRUFBcUI7QUFDdEMsbUJBQWUsSUFBZixTQUEwQixRQUExQixFQUFvQyxLQUFwQyxFQUEyQyxJQUEzQyxFQUFpRCxFQUFqRCxFQUNHLElBREgsQ0FDUSxvQkFBWTtBQUNoQix3QkFBa0Isa0JBQU8sTUFBekI7QUFDQSxhQUFPLG9CQUFvQixJQUFwQixTQUErQjtBQUNwQyxxQkFBYSxTQUFTLElBQVQsQ0FBYztBQURTLE9BQS9CLENBQVA7QUFHRCxLQU5ILEVBT0csSUFQSCxDQU9RLG9CQUFZO0FBQ2hCLGFBQU8sSUFBSSxRQUFKLENBQVA7QUFDQSxjQUFRLFFBQVI7QUFDRCxLQVZILEVBV0csS0FYSCxDQVdTLGlCQUFTO0FBQ2QsYUFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGFBQU8sS0FBUDtBQUNELEtBZEg7QUFlRCxHQWhCTSxDQUFQO0FBaUJEO0FBQ00sU0FBUyxxQkFBVCxDQUFnQyxRQUFoQyxFQUEwQyxLQUExQyxFQUFpRCxHQUFqRCxFQUFzRCxHQUF0RCxFQUEyRDtBQUFBOztBQUNoRSxTQUFPLHdCQUFZLFVBQUMsT0FBRCxFQUFVLE1BQVYsRUFBcUI7QUFDdEMsV0FBSyxJQUFMLENBQVU7QUFDUixXQUFLLGdCQUFLLHFCQUFMLENBQTJCLE9BQTNCLENBQW1DLFVBQW5DLEVBQStDLFFBQS9DLENBREc7QUFFUixjQUFRLEtBRkE7QUFHUixjQUFRO0FBQ04scUJBQWEsS0FEUDtBQUVOLGlCQUFTLG1CQUFTLE9BRlo7QUFHTiw2QkFBcUI7QUFIZjtBQUhBLEtBQVYsRUFTQyxJQVRELENBU00sb0JBQVk7QUFDaEIsYUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixFQUF5QjtBQUN2QixlQUFPO0FBQ0wscUNBQXlCLFNBQVMsSUFBVCxDQUFjO0FBRGxDLFNBRGdCO0FBSXZCLGlCQUFTLFNBQVM7QUFKSyxPQUF6QjtBQU1BLHdCQUFrQixrQkFBTyxNQUF6QjtBQUNBLFVBQUksbUJBQVMsU0FBYixFQUF3QjtBQUN0QixlQUFLLE1BQUwsQ0FBWSxPQUFaLENBQW9CLE9BQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsTUFBakIsRUFBeUIsS0FBekIsQ0FBK0IsYUFBbkQsRUFBa0UsbUJBQVMsY0FBM0UsRUFBMkYsbUJBQVMsT0FBcEc7QUFDRDtBQUNEO0FBQ0EsYUFBSyxJQUFMLENBQVU7QUFDUixhQUFRLGdCQUFLLE9BQWIsV0FEUTtBQUVSLGdCQUFRLEtBRkE7QUFHUixnQkFBUTtBQUNOLGtCQUFRLENBQ047QUFDRSx5QkFBYSxPQURmO0FBRUUsd0JBQVksUUFGZDtBQUdFLHFCQUFTLFNBQVMsSUFBVCxDQUFjO0FBSHpCLFdBRE07QUFERjtBQUhBLE9BQVYsRUFhQyxJQWJELENBYU0saUJBQVM7QUFBQSxnQ0FDbUIsTUFBTSxJQUFOLENBQVcsSUFBWCxDQUFnQixDQUFoQixDQURuQjtBQUFBLFlBQ1IsRUFEUSxxQkFDUixFQURRO0FBQUEsWUFDSixTQURJLHFCQUNKLFNBREk7QUFBQSxZQUNPLFFBRFAscUJBQ08sUUFEUDs7QUFFYixZQUFJLE9BQU8sT0FBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixDQUFYO0FBQ0EsWUFBSSxhQUFjLEVBQUMsUUFBUSxHQUFHLFFBQUgsRUFBVCxFQUF3QixvQkFBeEIsRUFBbUMsa0JBQW5DLEVBQWxCO0FBQ0EsZUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixFQUF5QjtBQUN2QixpQkFBTyxLQUFLLEtBRFc7QUFFdkIsbUJBQVMsU0FBYyxFQUFkLEVBQWtCLEtBQUssT0FBdkIsRUFBZ0MsVUFBaEM7QUFGYyxTQUF6QjtBQUlBLGVBQU8sT0FBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixDQUFQO0FBQ0EsWUFBSSxNQUFNLHlCQUF5QixTQUFTLE1BQWxDLEVBQTBDLFNBQVMsVUFBbkQsRUFBK0QsU0FBUyxPQUF4RSxFQUFpRixLQUFLLE9BQXRGLENBQVY7QUFDQSxlQUFPLElBQUksR0FBSixDQUFQO0FBQ0EsZ0JBQVEsR0FBUjtBQUNELE9BekJELEVBMEJDLEtBMUJELENBMEJPLGlCQUFTO0FBQ2QsZUFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGVBQU8sS0FBUDtBQUNELE9BN0JEO0FBOEJBO0FBQ0QsS0FwREQsRUFxREMsS0FyREQsQ0FxRE8saUJBQVM7QUFDZCxhQUFPLElBQUksS0FBSixDQUFQO0FBQ0EsYUFBTyxLQUFQO0FBQ0QsS0F4REQ7QUF5REQsR0ExRE0sQ0FBUDtBQTJERDtBQUNNLFNBQVMsWUFBVCxDQUF1QixRQUF2QixFQUFpQyxLQUFqQyxFQUF3QyxHQUF4QyxFQUE2QyxHQUE3QyxFQUFpRztBQUFBOztBQUFBLE1BQS9DLElBQStDLHVFQUF4QyxzQ0FBd0M7O0FBQ3RHLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxtQkFBZSxJQUFmLFNBQTBCLFFBQTFCLEVBQW9DLElBQXBDLEVBQTBDLElBQTFDLEVBQWdELEtBQWhELEVBQ0csSUFESCxDQUNRLG9CQUFZO0FBQ2hCLHdCQUFrQixrQkFBTyxNQUF6QjtBQUNBLFVBQUcsbUJBQVMsb0JBQVosRUFBa0M7QUFDaEMsZUFBTyxvQkFBb0IsSUFBcEIsU0FBK0I7QUFDcEMsdUJBQWEsU0FBUyxJQUFULENBQWM7QUFEUyxTQUEvQixDQUFQO0FBR0QsT0FKRCxNQUtLO0FBQ0gsZUFBTyxJQUFJLFFBQUosQ0FBUDtBQUNBLGdCQUFRLFFBQVI7QUFDRDtBQUNGLEtBWkgsRUFhRyxJQWJILENBYVEsb0JBQVk7QUFDaEIsYUFBTyxJQUFJLFFBQUosQ0FBUDtBQUNBLGNBQVEsUUFBUjtBQUNELEtBaEJILEVBaUJHLEtBakJILENBaUJTLGlCQUFTO0FBQ2QsYUFBTyxJQUFJLEtBQUosQ0FBUDtBQUNBLGFBQU8sS0FBUDtBQUNELEtBcEJIO0FBcUJELEdBdEJNLENBQVA7QUF3QkQ7QUFDRCxTQUFTLG1CQUFULENBQThCLFNBQTlCLEVBQXlDO0FBQUE7O0FBQ3ZDLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxRQUFJLE9BQU8sRUFBWDtBQUNBLFNBQUssSUFBSSxHQUFULElBQWdCLFNBQWhCLEVBQTJCO0FBQ3ZCLFdBQUssSUFBTCxDQUFVLG1CQUFtQixHQUFuQixJQUEwQixHQUExQixHQUFnQyxtQkFBbUIsVUFBVSxHQUFWLENBQW5CLENBQTFDO0FBQ0g7QUFDRCxXQUFPLEtBQUssSUFBTCxDQUFVLEdBQVYsQ0FBUDs7QUFFQSxXQUFLLElBQUwsQ0FBVTtBQUNSLFdBQUssZ0JBQUssS0FERjtBQUVSLGNBQVEsTUFGQTtBQUdSLGVBQVM7QUFDUCx3QkFBZ0I7QUFEVCxPQUhEO0FBTVIsWUFBUyxJQUFULGlCQUF5QixtQkFBUyxPQUFsQztBQU5RLEtBQVYsRUFRQyxJQVJELENBUU0sb0JBQVk7QUFDaEIsYUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixFQUF5QjtBQUN2QixlQUFPO0FBQ0wscUNBQXlCLFNBQVMsSUFBVCxDQUFjO0FBRGxDLFNBRGdCO0FBSXZCLGlCQUFTLFNBQVM7QUFKSyxPQUF6QjtBQU1BLHdCQUFrQixrQkFBTyxNQUF6QjtBQUNBLFVBQUksbUJBQVMsU0FBYixFQUF3QjtBQUN0QixlQUFLLE1BQUwsQ0FBWSxPQUFaLENBQW9CLE9BQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsTUFBakIsRUFBeUIsS0FBekIsQ0FBK0IsYUFBbkQsRUFBa0UsbUJBQVMsY0FBM0UsRUFBMkYsbUJBQVMsT0FBcEc7QUFDRDtBQUNELGNBQVEsUUFBUjtBQUNELEtBcEJELEVBcUJDLEtBckJELENBcUJPLGlCQUFTO0FBQ2QsY0FBUSxHQUFSLENBQVksS0FBWjtBQUNBLGFBQU8sS0FBUDtBQUNELEtBeEJEO0FBeUJELEdBaENNLENBQVA7QUFpQ0Q7QUFDTSxTQUFTLG9CQUFULENBQStCLFFBQS9CLEVBQXlDLEdBQXpDLEVBQThDLEdBQTlDLEVBQW1EO0FBQ3hELFNBQU8sS0FBSyxJQUFMLENBQVU7QUFDZixTQUFLLGdCQUFLLG9CQURLO0FBRWYsWUFBUSxNQUZPO0FBR2YsVUFBTTtBQUNGLGVBQVMsbUJBQVMsT0FEaEI7QUFFRjtBQUZFO0FBSFMsR0FBVixFQU9KLEdBUEksRUFPQyxHQVBELENBQVA7QUFRRDtBQUNNLFNBQVMsYUFBVCxDQUF3QixXQUF4QixFQUFxQyxVQUFyQyxFQUFpRCxHQUFqRCxFQUFzRCxHQUF0RCxFQUEyRDtBQUNoRSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBSyxnQkFBSyxhQURLO0FBRWYsWUFBUSxNQUZPO0FBR2YsVUFBTTtBQUNGLDhCQURFO0FBRUY7QUFGRTtBQUhTLEdBQVYsRUFPSixHQVBJLEVBT0MsR0FQRCxDQUFQO0FBUUQ7QUFDTSxTQUFTLGNBQVQsQ0FBeUIsV0FBekIsRUFBc0MsV0FBdEMsRUFBbUQsR0FBbkQsRUFBd0QsR0FBeEQsRUFBNkQ7QUFDbEUsU0FBTyxLQUFLLElBQUwsQ0FBVTtBQUNmLFNBQUssZ0JBQUssY0FESztBQUVmLFlBQVEsTUFGTztBQUdmLFVBQU07QUFDRiw4QkFERTtBQUVGO0FBRkU7QUFIUyxHQUFWLEVBT0osR0FQSSxFQU9DLEdBUEQsQ0FBUDtBQVFEO0FBQ00sU0FBUyxPQUFULENBQWtCLEdBQWxCLEVBQXVCO0FBQUE7O0FBQzVCLFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxZQUFLLE9BQUwsQ0FBYSxNQUFiLENBQW9CLE1BQXBCO0FBQ0EsUUFBSSxtQkFBUyxTQUFiLEVBQXdCO0FBQ3RCLGNBQUssTUFBTCxDQUFZLFVBQVo7QUFDRDtBQUNELHNCQUFrQixrQkFBTyxPQUF6QjtBQUNBLFdBQU8sSUFBSSx5QkFBeUIsR0FBekIsRUFBOEIsSUFBOUIsRUFBb0MsRUFBcEMsRUFBd0MsUUFBSyxPQUFMLENBQWEsR0FBYixDQUFpQixNQUFqQixDQUF4QyxDQUFKLENBQVA7QUFDQSxZQUFRLHlCQUF5QixHQUF6QixFQUE4QixJQUE5QixFQUFvQyxFQUFwQyxFQUF3QyxRQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLE1BQWpCLENBQXhDLENBQVI7QUFDRCxHQVJNLENBQVA7QUFTRDtBQUNELFNBQVMsNkJBQVQsR0FBMEM7QUFBQTs7QUFDeEMsU0FBTyx3QkFBWSxVQUFDLE9BQUQsRUFBVSxNQUFWLEVBQXFCO0FBQ3RDLFFBQUksT0FBTyxRQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLE1BQWpCLENBQVg7QUFDQSxRQUFJLENBQUMsSUFBTCxFQUFXO0FBQ1QsYUFBTyx5QkFBeUIsQ0FBekIsRUFBNEIsRUFBNUIsRUFBZ0MsRUFBaEMsRUFBb0MsbURBQXBDLENBQVA7QUFDRCxLQUZELE1BR0s7QUFDSCxjQUFRLHlCQUF5QixHQUF6QixFQUE4QixJQUE5QixFQUFvQyxFQUFwQyxFQUF3QyxLQUFLLE9BQTdDLENBQVI7QUFDRDtBQUNGLEdBUk0sQ0FBUDtBQVNEO0FBQ00sU0FBUyxjQUFULENBQXdCLEdBQXhCLEVBQTZCLEdBQTdCLEVBQWlEO0FBQUE7O0FBQUEsTUFBZixLQUFlLHVFQUFQLEtBQU87O0FBQ3RELFNBQU8sd0JBQVksVUFBQyxPQUFELEVBQVUsTUFBVixFQUFxQjtBQUN0QyxRQUFJLEtBQUosRUFBVztBQUNULGNBQUssSUFBTCxDQUFVO0FBQ1IsYUFBSyxnQkFBSyxPQURGO0FBRVIsZ0JBQVE7QUFGQSxPQUFWLEVBSUMsSUFKRCxDQUlNLG9CQUFZO0FBQ2hCLFlBQUksT0FBTyxRQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLE1BQWpCLENBQVg7QUFDQSxZQUFJLGFBQWEsU0FBUyxJQUExQjtBQUNBLGdCQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLE1BQWpCLEVBQXlCO0FBQ3ZCLGlCQUFPLEtBQUssS0FEVztBQUV2QixtQkFBUyxTQUFjLEVBQWQsRUFBa0IsS0FBSyxPQUF2QixFQUFnQyxVQUFoQztBQUZjLFNBQXpCO0FBSUEsZUFBTyw4QkFBOEIsSUFBOUIsU0FBUDtBQUNELE9BWkQsRUFhQyxJQWJELENBYU0sb0JBQVk7QUFDaEIsZUFBTyxJQUFJLFFBQUosQ0FBUDtBQUNBLGdCQUFRLFFBQVI7QUFDRCxPQWhCRCxFQWlCQyxLQWpCRCxDQWlCTyxpQkFBUztBQUNkLGVBQU8sSUFBSSxLQUFKLENBQVA7QUFDQSxlQUFPLEtBQVA7QUFDRCxPQXBCRDtBQXFCRCxLQXRCRCxNQXVCSztBQUNILG9DQUE4QixJQUE5QixVQUNDLElBREQsQ0FDTSxvQkFBWTtBQUNoQixlQUFPLElBQUksUUFBSixDQUFQO0FBQ0EsZ0JBQVEsUUFBUjtBQUNELE9BSkQsRUFLQyxLQUxELENBS08saUJBQVM7QUFDZCxlQUFPLElBQUksS0FBSixDQUFQO0FBQ0EsZUFBTyxLQUFQO0FBQ0QsT0FSRDtBQVNEO0FBQ0YsR0FuQ00sQ0FBUDtBQW9DRDs7Ozs7Ozs7UUN6WmUsTyxHQUFBLE87UUFRQSxNLEdBQUEsTTtRQVNBLE0sR0FBQSxNO1FBUUEsTSxHQUFBLE07UUFTQSxNLEdBQUEsTTtRQU1BLE8sR0FBQSxPOztBQW5EaEI7O0FBRUEsU0FBUyxpQkFBVCxDQUE0QixhQUE1QixFQUEyQyxNQUEzQyxFQUFtRDtBQUNqRCxNQUFJLFlBQVksRUFBaEI7QUFDQSxPQUFLLElBQUksS0FBVCxJQUFrQixNQUFsQixFQUEwQjtBQUN4QixRQUFJLGNBQWMsT0FBZCxDQUFzQixLQUF0QixLQUFnQyxDQUFDLENBQXJDLEVBQXdDO0FBQ3RDLGdCQUFVLEtBQVYsSUFBbUIsT0FBTyxLQUFQLENBQW5CO0FBQ0Q7QUFDRjtBQUNELFNBQU8sU0FBUDtBQUNEO0FBQ00sU0FBUyxPQUFULENBQWtCLE1BQWxCLEVBQWlEO0FBQUEsTUFBdkIsTUFBdUIsdUVBQWQsRUFBYztBQUFBLE1BQVYsR0FBVTtBQUFBLE1BQUwsR0FBSzs7QUFDdEQsTUFBTSxnQkFBZ0IsQ0FBQyxVQUFELEVBQVksWUFBWixFQUF5QixRQUF6QixFQUFrQyxNQUFsQyxFQUF5QyxRQUF6QyxFQUFrRCxTQUFsRCxFQUE0RCxNQUE1RCxFQUFtRSxnQkFBbkUsQ0FBdEI7QUFDQSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxPQUFiLFNBQXdCLE1BRFQ7QUFFZixZQUFRLEtBRk87QUFHZixZQUFRLGtCQUFrQixhQUFsQixFQUFpQyxNQUFqQztBQUhPLEdBQVYsRUFJSixHQUpJLEVBSUMsR0FKRCxDQUFQO0FBS0Q7QUFDTSxTQUFTLE1BQVQsQ0FBaUIsTUFBakIsRUFBeUIsSUFBekIsRUFBc0Q7QUFBQSxNQUF2QixNQUF1Qix1RUFBZCxFQUFjO0FBQUEsTUFBVixHQUFVO0FBQUEsTUFBTCxHQUFLOztBQUMzRCxNQUFNLGdCQUFnQixDQUFDLGNBQUQsRUFBZ0IsTUFBaEIsQ0FBdEI7QUFDQSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxPQUFiLFNBQXdCLE1BRFQ7QUFFZixZQUFRLE1BRk87QUFHZixjQUhlO0FBSWYsWUFBUSxrQkFBa0IsYUFBbEIsRUFBaUMsTUFBakM7QUFKTyxHQUFWLEVBS0osR0FMSSxFQUtDLEdBTEQsQ0FBUDtBQU1EO0FBQ00sU0FBUyxNQUFULENBQWlCLE1BQWpCLEVBQXlCLEVBQXpCLEVBQW9EO0FBQUEsTUFBdkIsTUFBdUIsdUVBQWQsRUFBYztBQUFBLE1BQVYsR0FBVTtBQUFBLE1BQUwsR0FBSzs7QUFDekQsTUFBTSxnQkFBZ0IsQ0FBQyxNQUFELEVBQVEsU0FBUixFQUFrQixPQUFsQixDQUF0QjtBQUNBLFNBQU8sS0FBSyxJQUFMLENBQVU7QUFDZixTQUFRLGdCQUFLLE9BQWIsU0FBd0IsTUFBeEIsU0FBa0MsRUFEbkI7QUFFZixZQUFRLEtBRk87QUFHZixZQUFRLGtCQUFrQixhQUFsQixFQUFpQyxNQUFqQztBQUhPLEdBQVYsRUFJSixHQUpJLEVBSUMsR0FKRCxDQUFQO0FBS0Q7QUFDTSxTQUFTLE1BQVQsQ0FBaUIsTUFBakIsRUFBeUIsRUFBekIsRUFBNkIsSUFBN0IsRUFBMEQ7QUFBQSxNQUF2QixNQUF1Qix1RUFBZCxFQUFjO0FBQUEsTUFBVixHQUFVO0FBQUEsTUFBTCxHQUFLOztBQUMvRCxNQUFNLGdCQUFnQixDQUFDLGNBQUQsRUFBZ0IsTUFBaEIsQ0FBdEI7QUFDQSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxPQUFiLFNBQXdCLE1BQXhCLFNBQWtDLEVBRG5CO0FBRWYsWUFBUSxLQUZPO0FBR2YsY0FIZTtBQUlmLFlBQVEsa0JBQWtCLGFBQWxCLEVBQWlDLE1BQWpDO0FBSk8sR0FBVixFQUtKLEdBTEksRUFLQyxHQUxELENBQVA7QUFNRDtBQUNNLFNBQVMsTUFBVCxDQUFpQixNQUFqQixFQUF5QixFQUF6QixFQUE2QixHQUE3QixFQUFrQyxHQUFsQyxFQUF1QztBQUM1QyxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxPQUFiLFNBQXdCLE1BQXhCLFNBQWtDLEVBRG5CO0FBRWYsWUFBUTtBQUZPLEdBQVYsRUFHSixHQUhJLEVBR0MsR0FIRCxDQUFQO0FBSUQ7QUFDTSxTQUFTLE9BQVQsQ0FBa0IsTUFBbEIsRUFBMEIsVUFBMUIsRUFBMkQ7QUFBQSxNQUFyQixJQUFxQix1RUFBZCxFQUFjO0FBQUEsTUFBVixHQUFVO0FBQUEsTUFBTCxHQUFLOztBQUNoRSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxhQUFiLFNBQThCLE1BQTlCLGNBQTZDLFVBRDlCO0FBRWYsWUFBUSxNQUZPO0FBR2Y7QUFIZSxHQUFWLEVBSUosR0FKSSxFQUlDLEdBSkQsQ0FBUDtBQUtEOzs7Ozs7OztRQ3ZEZSxVLEdBQUEsVTtRQVVBLFUsR0FBQSxVOztBQVpoQjs7QUFFTyxTQUFTLFVBQVQsQ0FBcUIsTUFBckIsRUFBNkIsVUFBN0IsRUFBeUMsUUFBekMsRUFBbUQsUUFBbkQsRUFBNkQsR0FBN0QsRUFBa0UsR0FBbEUsRUFBdUU7QUFDNUUsU0FBTyxLQUFLLElBQUwsQ0FBVTtBQUNmLFNBQVEsZ0JBQUssYUFBYixTQUE4QixNQUE5QixjQUE2QyxVQUQ5QjtBQUVmLFlBQVEsTUFGTztBQUdmLFVBQU07QUFDRix3QkFERTtBQUVGLGdCQUFVLFNBQVMsTUFBVCxDQUFnQixTQUFTLE9BQVQsQ0FBaUIsR0FBakIsSUFBd0IsQ0FBeEMsRUFBMkMsU0FBUyxNQUFwRDtBQUZSO0FBSFMsR0FBVixFQU9KLEdBUEksRUFPQyxHQVBELENBQVA7QUFRRDtBQUNNLFNBQVMsVUFBVCxDQUFxQixNQUFyQixFQUE2QixVQUE3QixFQUF5QyxRQUF6QyxFQUFtRCxHQUFuRCxFQUF3RCxHQUF4RCxFQUE2RDtBQUNsRSxTQUFPLEtBQUssSUFBTCxDQUFVO0FBQ2YsU0FBUSxnQkFBSyxhQUFiLFNBQThCLE1BQTlCLGNBQTZDLFVBRDlCO0FBRWYsWUFBUSxRQUZPO0FBR2YsVUFBTTtBQUNGO0FBREU7QUFIUyxHQUFWLEVBTUosR0FOSSxFQU1DLEdBTkQsQ0FBUDtBQU9EOzs7Ozs7Ozs7Ozs7Ozs7QUNwQkQ7Ozs7SUFFTSxJO0FBQ0osa0JBQTBCO0FBQUEsUUFBYixNQUFhLHVFQUFKLEVBQUk7O0FBQUE7O0FBQ3hCLFFBQUksQ0FBQyxPQUFPLGNBQVosRUFDRSxNQUFNLElBQUksS0FBSixDQUFVLGtEQUFWLENBQU47O0FBRUYsU0FBSyxNQUFMLEdBQWMsU0FBYztBQUMxQjtBQUNBLGNBQVEsS0FGa0I7QUFHMUIsZUFBUyxFQUhpQjtBQUkxQixjQUFRLEVBSmtCO0FBSzFCLG9CQUFjLEVBTFk7QUFNMUIsdUJBQWlCLEtBTlM7QUFPMUIsb0JBQWMsTUFQWTtBQVExQjtBQUNBLFlBQU07QUFDTCxrQkFBVSxJQURMO0FBRUwsa0JBQVU7QUFGTDtBQVRvQixLQUFkLEVBYVgsTUFiVyxDQUFkO0FBY0Q7Ozs7Z0NBQ1ksTyxFQUFTO0FBQ3BCLGFBQU8sUUFBUSxLQUFSLENBQWMsTUFBZCxFQUFzQixNQUF0QixDQUE2QjtBQUFBLGVBQVUsTUFBVjtBQUFBLE9BQTdCLEVBQStDLEdBQS9DLENBQW1ELGtCQUFVO0FBQ2xFLFlBQUksVUFBVSxFQUFkO0FBQ0EsWUFBSSxRQUFRLE9BQU8sS0FBUCxDQUFhLEdBQWIsQ0FBWjtBQUNBLGdCQUFRLE1BQU0sQ0FBTixDQUFSLElBQW9CLE1BQU0sQ0FBTixDQUFwQjtBQUNBLGVBQU8sT0FBUDtBQUNELE9BTE0sQ0FBUDtBQU1EOzs7NkJBQ1MsSSxFQUFNLEksRUFBTTtBQUNwQixVQUFJLENBQUMsSUFBTCxFQUFXO0FBQ1QsZUFBTyxJQUFQO0FBQ0QsT0FGRCxNQUdLLElBQUksS0FBSyxPQUFMLENBQWEsTUFBYixNQUF5QixDQUFDLENBQTlCLEVBQWlDO0FBQ3BDLGVBQU8sSUFBUDtBQUNELE9BRkksTUFHQTtBQUNILGVBQU8sS0FBSyxLQUFMLENBQVcsSUFBWCxDQUFQO0FBQ0Q7QUFDRjs7O29DQUNnQixHLEVBQUssTSxFQUFRO0FBQzVCLGFBQU87QUFDTCxnQkFBUSxJQUFJLE1BRFA7QUFFTCxvQkFBWSxJQUFJLFVBRlg7QUFHTCxpQkFBUyxLQUFLLFdBQUwsQ0FBaUIsSUFBSSxxQkFBSixFQUFqQixDQUhKO0FBSUwsc0JBSks7QUFLTCxjQUFNLEtBQUssUUFBTCxDQUFjLElBQUksaUJBQUosQ0FBc0IsY0FBdEIsQ0FBZCxFQUFxRCxJQUFJLFlBQXpEO0FBTEQsT0FBUDtBQU9EOzs7aUNBQ2EsSSxFQUFNLE0sRUFBUTtBQUMxQixhQUFPO0FBQ0wsZ0JBQVEsQ0FESDtBQUVMLG9CQUFZLE9BRlA7QUFHTCxpQkFBUyxFQUhKO0FBSUwsc0JBSks7QUFLTDtBQUxLLE9BQVA7QUFPRDs7O2tDQUNjLE0sRUFBUTtBQUNyQixVQUFJLFlBQVksRUFBaEI7QUFDQSxXQUFLLElBQUksS0FBVCxJQUFrQixNQUFsQixFQUEwQjtBQUN4QixZQUFJLE1BQU0sT0FBTyxLQUFQLENBQVY7QUFDQSxZQUFJLFFBQU8sR0FBUCx5Q0FBTyxHQUFQLE9BQWUsUUFBbkIsRUFBNkI7QUFDM0IsZ0JBQU0sS0FBSyxTQUFMLENBQWUsR0FBZixDQUFOO0FBQ0Q7QUFDRCxrQkFBVSxJQUFWLENBQWtCLEtBQWxCLFNBQTJCLG1CQUFtQixHQUFuQixDQUEzQjtBQUNEO0FBQ0QsYUFBTyxVQUFVLElBQVYsQ0FBZSxHQUFmLENBQVA7QUFDRDs7O2dDQUNZLEcsRUFBSyxPLEVBQVM7QUFDekIsV0FBSyxJQUFJLE1BQVQsSUFBbUIsT0FBbkIsRUFBNEI7QUFDMUIsWUFBSSxnQkFBSixDQUFxQixNQUFyQixFQUE2QixRQUFRLE1BQVIsQ0FBN0I7QUFDRDtBQUNGOzs7NkJBQ1MsRyxFQUFLLEksRUFBTTtBQUNuQixVQUFJLENBQUMsSUFBTCxFQUFXO0FBQ1QsWUFBSSxJQUFKO0FBQ0QsT0FGRCxNQUdLLElBQUksUUFBTyxJQUFQLHlDQUFPLElBQVAsTUFBZSxRQUFuQixFQUE2QjtBQUNoQyxZQUFJLElBQUosQ0FBUyxJQUFUO0FBQ0QsT0FGSSxNQUdBO0FBQ0gsWUFBSSxnQkFBSixDQUFxQixjQUFyQixFQUFxQyxnQ0FBckM7QUFDQSxZQUFJLElBQUosQ0FBUyxLQUFLLFNBQUwsQ0FBZSxJQUFmLENBQVQ7QUFDRDtBQUNGOzs7NEJBQ1EsRyxFQUFLLEcsRUFBTSxHLEVBQUs7QUFBQTs7QUFDdkIsYUFBTyx3QkFBWSxVQUFDLE9BQUQsRUFBVSxNQUFWLEVBQXFCOztBQUV0QyxZQUFJLE1BQU0sSUFBSSxjQUFKLEVBQVY7QUFDQSxZQUFJLFNBQVMsU0FBYyxFQUFkLEVBQWtCLE1BQUssTUFBdkIsRUFBK0IsR0FBL0IsQ0FBYjs7QUFFQSxZQUFJLENBQUMsT0FBTyxHQUFSLElBQWUsT0FBTyxPQUFPLEdBQWQsS0FBc0IsUUFBckMsSUFBaUQsT0FBTyxHQUFQLENBQVcsTUFBWCxLQUFzQixDQUEzRSxFQUE4RTtBQUM1RSxjQUFJLE1BQU0sTUFBSyxZQUFMLENBQWtCLDBCQUFsQixFQUE4QyxNQUE5QyxDQUFWO0FBQ0EsaUJBQU8sSUFBSSxHQUFKLENBQVA7QUFDQSxpQkFBTyxHQUFQO0FBQ0Q7QUFDRCxZQUFJLE9BQU8sZUFBWCxFQUE0QjtBQUFFLGNBQUksZUFBSixHQUFzQixJQUF0QjtBQUE0QjtBQUMxRCxZQUFJLE9BQU8sT0FBWCxFQUFvQjtBQUFFLGNBQUksT0FBSixHQUFjLElBQWQ7QUFBb0I7QUFDMUMsZUFBTyxZQUFQLENBQW9CLE9BQXBCLElBQStCLE9BQU8sWUFBUCxDQUFvQixPQUFwQixDQUE0QixJQUE1QixRQUF1QyxNQUF2QyxDQUEvQjtBQUNBLFlBQUksU0FBUyxNQUFLLGFBQUwsQ0FBbUIsT0FBTyxNQUExQixDQUFiO0FBQ0EsWUFBSSxJQUFKLENBQVMsT0FBTyxNQUFoQixRQUEyQixPQUFPLE9BQVAsR0FBaUIsT0FBTyxPQUFQLEdBQWUsR0FBaEMsR0FBc0MsRUFBakUsSUFBc0UsT0FBTyxHQUE3RSxJQUFtRixTQUFTLE1BQUksTUFBYixHQUFzQixFQUF6RyxHQUErRyxJQUEvRyxFQUFxSCxPQUFPLElBQVAsQ0FBWSxRQUFqSSxFQUEySSxPQUFPLElBQVAsQ0FBWSxRQUF2SjtBQUNBLFlBQUksU0FBSixHQUFnQixZQUFXO0FBQ3pCLGNBQUksTUFBTSxLQUFLLFlBQUwsQ0FBa0IsU0FBbEIsRUFBNkIsTUFBN0IsQ0FBVjtBQUNBLGlCQUFPLElBQUksR0FBSixDQUFQO0FBQ0EsaUJBQU8sR0FBUDtBQUNELFNBSkQ7QUFLQSxZQUFJLE9BQUosR0FBYyxZQUFXO0FBQ3ZCLGNBQUksTUFBTSxLQUFLLFlBQUwsQ0FBa0IsT0FBbEIsRUFBMkIsTUFBM0IsQ0FBVjtBQUNBLGlCQUFPLElBQUksR0FBSixDQUFQO0FBQ0EsaUJBQU8sR0FBUDtBQUNELFNBSkQ7QUFLQSxZQUFJLGtCQUFKLEdBQXlCLFlBQU07QUFDN0IsY0FBSSxJQUFJLFVBQUosSUFBa0IsZUFBZSxJQUFyQyxFQUEyQztBQUN6QyxnQkFBSSxPQUFNLE1BQUssZUFBTCxDQUFxQixHQUFyQixFQUEwQixNQUExQixDQUFWO0FBQ0EsZ0JBQUksS0FBSSxNQUFKLEtBQWUsR0FBbkIsRUFBdUI7QUFDckIsa0JBQUksT0FBTyxZQUFQLENBQW9CLFFBQXhCLEVBQWtDO0FBQ2hDLHVCQUFPLFlBQVAsQ0FBb0IsUUFBcEIsQ0FBNkIsSUFBN0IsUUFBd0MsSUFBeEMsRUFBNkMsTUFBN0MsRUFBcUQsT0FBckQsRUFBOEQsTUFBOUQsRUFBc0UsR0FBdEUsRUFBMkUsR0FBM0U7QUFDRCxlQUZELE1BR0s7QUFDSCx1QkFBTyxJQUFJLElBQUosQ0FBUDtBQUNBLHdCQUFRLElBQVI7QUFDRDtBQUNGLGFBUkQsTUFTSztBQUNILGtCQUFJLE9BQU8sWUFBUCxDQUFvQixhQUF4QixFQUF1QztBQUNyQyx1QkFBTyxZQUFQLENBQW9CLGFBQXBCLENBQWtDLElBQWxDLFFBQTZDLElBQTdDLEVBQWtELE1BQWxELEVBQTBELE9BQTFELEVBQW1FLE1BQW5FLEVBQTJFLEdBQTNFLEVBQWdGLEdBQWhGO0FBQ0QsZUFGRCxNQUdLO0FBQ0gsdUJBQU8sSUFBSSxJQUFKLENBQVA7QUFDQSx1QkFBTyxJQUFQO0FBQ0Q7QUFDRjtBQUNGO0FBQ0YsU0F0QkQ7QUF1QkEsY0FBSyxXQUFMLENBQWlCLEdBQWpCLEVBQXNCLE9BQU8sT0FBN0I7QUFDQSxjQUFLLFFBQUwsQ0FBYyxHQUFkLEVBQW1CLE9BQU8sSUFBMUI7QUFDRCxPQWxETSxDQUFQO0FBbUREOzs7Ozs7QUFHSCxTQUFTLGNBQVQsR0FBcUM7QUFBQSxNQUFiLE1BQWEsdUVBQUosRUFBSTs7QUFDbkMsTUFBSSxVQUFVLElBQUksSUFBSixDQUFTLE1BQVQsQ0FBZDtBQUNBLE1BQUksV0FBVyxTQUFYLFFBQVc7QUFBQSxzQ0FBSSxJQUFKO0FBQUksVUFBSjtBQUFBOztBQUFBLFdBQWEsS0FBSyxTQUFMLENBQWUsT0FBZixDQUF1QixLQUF2QixDQUE2QixPQUE3QixFQUFzQyxJQUF0QyxDQUFiO0FBQUEsR0FBZjtBQUNBLFdBQVMsTUFBVCxHQUFrQixRQUFRLE1BQTFCO0FBQ0EsU0FBTyxRQUFQO0FBQ0Q7O0FBRUQsSUFBSSxPQUFPLGdCQUFYO0FBQ0EsS0FBSyxNQUFMLEdBQWMsVUFBQyxNQUFELEVBQVk7QUFDeEIsU0FBTyxlQUFlLE1BQWYsQ0FBUDtBQUNELENBRkQ7O2tCQUllLEk7O0FBQ2YsT0FBTyxJQUFQLEdBQWMsT0FBTyxJQUFQLElBQWUsSUFBN0I7Ozs7Ozs7Ozs7Ozs7SUMzSnFCLE07QUFDbkIsa0JBQWEsR0FBYixFQUFrQjtBQUFBOztBQUNoQixRQUFJLENBQUMsT0FBTyxFQUFaLEVBQ0UsTUFBTSxJQUFJLEtBQUosQ0FBVSx1REFBVixDQUFOO0FBQ0YsU0FBSyxHQUFMLEdBQVcsR0FBWDtBQUNBLFNBQUssS0FBTCxHQUFhLEVBQWI7QUFDQSxTQUFLLE1BQUwsR0FBYyxJQUFkO0FBQ0Q7Ozs7dUJBQ0csUyxFQUFXLFEsRUFBVTtBQUN2QixXQUFLLEtBQUwsQ0FBVyxJQUFYLENBQWdCLEVBQUMsb0JBQUQsRUFBWSxrQkFBWixFQUFoQjtBQUNEOzs7NEJBQ1EsSyxFQUFPLGMsRUFBZ0IsTyxFQUFTO0FBQUE7O0FBQ3ZDLFdBQUssVUFBTDtBQUNBLFdBQUssTUFBTCxHQUFjLEdBQUcsT0FBSCxDQUFXLEtBQUssR0FBaEIsRUFBcUIsRUFBQyxZQUFXLElBQVosRUFBckIsQ0FBZDs7QUFFQSxXQUFLLE1BQUwsQ0FBWSxFQUFaLENBQWUsU0FBZixFQUEwQixZQUFNO0FBQzlCLGdCQUFRLElBQVIsaURBQTJELE9BQTNEO0FBQ0EsY0FBSyxNQUFMLENBQVksSUFBWixDQUFpQixPQUFqQixFQUEwQixLQUExQixFQUFpQyxjQUFqQyxFQUFpRCxPQUFqRDtBQUNELE9BSEQ7O0FBS0EsV0FBSyxNQUFMLENBQVksRUFBWixDQUFlLFlBQWYsRUFBNkIsWUFBTTtBQUNqQyxnQkFBUSxJQUFSO0FBQ0EsY0FBSyxLQUFMLENBQVcsT0FBWCxDQUFtQixjQUFNO0FBQ3ZCLGdCQUFLLE1BQUwsQ0FBWSxFQUFaLENBQWUsR0FBRyxTQUFsQixFQUE2QixnQkFBUTtBQUNuQyxlQUFHLFFBQUgsQ0FBWSxJQUFaO0FBQ0QsV0FGRDtBQUdELFNBSkQ7QUFLRCxPQVBEOztBQVNBLFdBQUssTUFBTCxDQUFZLEVBQVosQ0FBZSxlQUFmLEVBQWdDLFlBQU07QUFDcEMsbUJBQVc7QUFBQSxpQkFBTSxNQUFLLFVBQUwsRUFBTjtBQUFBLFNBQVgsRUFBb0MsSUFBcEM7QUFDRCxPQUZEOztBQUlBLFdBQUssTUFBTCxDQUFZLEVBQVosQ0FBZSxZQUFmLEVBQTZCLFlBQU07QUFDakMsZ0JBQVEsSUFBUjtBQUNELE9BRkQ7O0FBSUEsV0FBSyxNQUFMLENBQVksRUFBWixDQUFlLGNBQWYsRUFBK0IsWUFBTTtBQUNuQyxnQkFBUSxJQUFSO0FBQ0QsT0FGRDs7QUFJQSxXQUFLLE1BQUwsQ0FBWSxFQUFaLENBQWUsT0FBZixFQUF3QixVQUFDLEtBQUQsRUFBVztBQUNqQyxnQkFBUSxJQUFSLGFBQXVCLEtBQXZCO0FBQ0QsT0FGRDtBQUdEOzs7aUNBQ2E7QUFDWixVQUFJLEtBQUssTUFBVCxFQUFpQjtBQUNmLGFBQUssTUFBTCxDQUFZLEtBQVo7QUFDRDtBQUNGOzs7Ozs7a0JBakRrQixNOzs7Ozs7Ozs7Ozs7Ozs7OztJQ0FBLE87QUFDbkIsbUJBQWEsT0FBYixFQUFtQztBQUFBLFFBQWIsTUFBYSx1RUFBSixFQUFJOztBQUFBOztBQUNqQyxRQUFJLENBQUMsT0FBTCxFQUNFLE1BQU0sSUFBSSxLQUFKLENBQVUsd0RBQVYsQ0FBTjtBQUNGLFFBQUksQ0FBQyxRQUFRLE9BQVQsSUFBb0IsQ0FBQyxRQUFRLE9BQTdCLElBQXdDLENBQUMsUUFBUSxVQUFqRCxJQUErRCxDQUFDLFFBQVEsS0FBNUUsRUFDRSxNQUFNLElBQUksS0FBSixDQUFVLDREQUFWLENBQU47QUFDRixTQUFLLE9BQUwsR0FBZSxPQUFmO0FBQ0EsU0FBSyxNQUFMLEdBQWMsTUFBZDtBQUNBLFNBQUssU0FBTCxHQUFpQixZQUFqQjtBQUNEOzs7O3dCQUNJLEcsRUFBSztBQUNSLFVBQUksT0FBTyxLQUFLLE9BQUwsQ0FBYSxPQUFiLE1BQXdCLEtBQUssTUFBN0IsR0FBc0MsR0FBdEMsQ0FBWDtBQUNBLFVBQUksQ0FBQyxJQUFMLEVBQVc7QUFDVCxlQUFPLElBQVA7QUFDRCxPQUZELE1BR0s7QUFBQSwwQkFDZSxLQUFLLEtBQUwsQ0FBVyxLQUFLLFNBQWhCLENBRGY7QUFBQTtBQUFBLFlBQ0UsSUFERjtBQUFBLFlBQ1EsR0FEUjs7QUFFSCxZQUFJLFFBQVEsTUFBWixFQUFvQjtBQUNsQixpQkFBTyxHQUFQO0FBQ0QsU0FGRCxNQUdLO0FBQ0gsaUJBQU8sS0FBSyxLQUFMLENBQVcsR0FBWCxDQUFQO0FBQ0Q7QUFDRjtBQUNGOzs7d0JBQ0ksRyxFQUFLLEcsRUFBSztBQUNiLFVBQUksUUFBTyxHQUFQLHlDQUFPLEdBQVAsTUFBYyxRQUFsQixFQUE0QjtBQUMxQixhQUFLLE9BQUwsQ0FBYSxPQUFiLE1BQXdCLEtBQUssTUFBN0IsR0FBc0MsR0FBdEMsYUFBc0QsS0FBSyxTQUEzRCxHQUF1RSxHQUF2RTtBQUNELE9BRkQsTUFHSztBQUNILGFBQUssT0FBTCxDQUFhLE9BQWIsTUFBd0IsS0FBSyxNQUE3QixHQUFzQyxHQUF0QyxXQUFvRCxLQUFLLFNBQXpELEdBQXFFLEtBQUssU0FBTCxDQUFlLEdBQWYsQ0FBckU7QUFDRDtBQUNGOzs7MkJBQ08sRyxFQUFLO0FBQ1gsV0FBSyxPQUFMLENBQWEsVUFBYixNQUEyQixLQUFLLE1BQWhDLEdBQXlDLEdBQXpDO0FBQ0Q7Ozs0QkFDUTtBQUNQLFdBQUksSUFBSSxJQUFHLENBQVgsRUFBYyxJQUFJLEtBQUssT0FBTCxDQUFhLE1BQS9CLEVBQXVDLEdBQXZDLEVBQTJDO0FBQ3hDLFlBQUcsS0FBSyxPQUFMLENBQWEsT0FBYixDQUFxQixLQUFLLE9BQUwsQ0FBYSxHQUFiLENBQWlCLENBQWpCLENBQXJCLEVBQTBDLE9BQTFDLENBQWtELEtBQUssTUFBdkQsS0FBa0UsQ0FBQyxDQUF0RSxFQUNDLEtBQUssTUFBTCxDQUFZLEtBQUssT0FBTCxDQUFhLEdBQWIsQ0FBaUIsQ0FBakIsQ0FBWjtBQUNIO0FBQ0Y7Ozs7OztrQkF6Q2tCLE8iLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohXG4gKiBAb3ZlcnZpZXcgZXM2LXByb21pc2UgLSBhIHRpbnkgaW1wbGVtZW50YXRpb24gb2YgUHJvbWlzZXMvQSsuXG4gKiBAY29weXJpZ2h0IENvcHlyaWdodCAoYykgMjAxNCBZZWh1ZGEgS2F0eiwgVG9tIERhbGUsIFN0ZWZhbiBQZW5uZXIgYW5kIGNvbnRyaWJ1dG9ycyAoQ29udmVyc2lvbiB0byBFUzYgQVBJIGJ5IEpha2UgQXJjaGliYWxkKVxuICogQGxpY2Vuc2UgICBMaWNlbnNlZCB1bmRlciBNSVQgbGljZW5zZVxuICogICAgICAgICAgICBTZWUgaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3N0ZWZhbnBlbm5lci9lczYtcHJvbWlzZS9tYXN0ZXIvTElDRU5TRVxuICogQHZlcnNpb24gICA0LjAuNVxuICovXG5cbihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG4gICAgdHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuICAgIHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCA/IGRlZmluZShmYWN0b3J5KSA6XG4gICAgKGdsb2JhbC5FUzZQcm9taXNlID0gZmFjdG9yeSgpKTtcbn0odGhpcywgKGZ1bmN0aW9uICgpIHsgJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBvYmplY3RPckZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nIHx8IHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiB4ICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nO1xufVxuXG52YXIgX2lzQXJyYXkgPSB1bmRlZmluZWQ7XG5pZiAoIUFycmF5LmlzQXJyYXkpIHtcbiAgX2lzQXJyYXkgPSBmdW5jdGlvbiAoeCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeCkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG59IGVsc2Uge1xuICBfaXNBcnJheSA9IEFycmF5LmlzQXJyYXk7XG59XG5cbnZhciBpc0FycmF5ID0gX2lzQXJyYXk7XG5cbnZhciBsZW4gPSAwO1xudmFyIHZlcnR4TmV4dCA9IHVuZGVmaW5lZDtcbnZhciBjdXN0b21TY2hlZHVsZXJGbiA9IHVuZGVmaW5lZDtcblxudmFyIGFzYXAgPSBmdW5jdGlvbiBhc2FwKGNhbGxiYWNrLCBhcmcpIHtcbiAgcXVldWVbbGVuXSA9IGNhbGxiYWNrO1xuICBxdWV1ZVtsZW4gKyAxXSA9IGFyZztcbiAgbGVuICs9IDI7XG4gIGlmIChsZW4gPT09IDIpIHtcbiAgICAvLyBJZiBsZW4gaXMgMiwgdGhhdCBtZWFucyB0aGF0IHdlIG5lZWQgdG8gc2NoZWR1bGUgYW4gYXN5bmMgZmx1c2guXG4gICAgLy8gSWYgYWRkaXRpb25hbCBjYWxsYmFja3MgYXJlIHF1ZXVlZCBiZWZvcmUgdGhlIHF1ZXVlIGlzIGZsdXNoZWQsIHRoZXlcbiAgICAvLyB3aWxsIGJlIHByb2Nlc3NlZCBieSB0aGlzIGZsdXNoIHRoYXQgd2UgYXJlIHNjaGVkdWxpbmcuXG4gICAgaWYgKGN1c3RvbVNjaGVkdWxlckZuKSB7XG4gICAgICBjdXN0b21TY2hlZHVsZXJGbihmbHVzaCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjaGVkdWxlRmx1c2goKTtcbiAgICB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHNldFNjaGVkdWxlcihzY2hlZHVsZUZuKSB7XG4gIGN1c3RvbVNjaGVkdWxlckZuID0gc2NoZWR1bGVGbjtcbn1cblxuZnVuY3Rpb24gc2V0QXNhcChhc2FwRm4pIHtcbiAgYXNhcCA9IGFzYXBGbjtcbn1cblxudmFyIGJyb3dzZXJXaW5kb3cgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHVuZGVmaW5lZDtcbnZhciBicm93c2VyR2xvYmFsID0gYnJvd3NlcldpbmRvdyB8fCB7fTtcbnZhciBCcm93c2VyTXV0YXRpb25PYnNlcnZlciA9IGJyb3dzZXJHbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBicm93c2VyR2xvYmFsLldlYktpdE11dGF0aW9uT2JzZXJ2ZXI7XG52YXIgaXNOb2RlID0gdHlwZW9mIHNlbGYgPT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiAoe30pLnRvU3RyaW5nLmNhbGwocHJvY2VzcykgPT09ICdbb2JqZWN0IHByb2Nlc3NdJztcblxuLy8gdGVzdCBmb3Igd2ViIHdvcmtlciBidXQgbm90IGluIElFMTBcbnZhciBpc1dvcmtlciA9IHR5cGVvZiBVaW50OENsYW1wZWRBcnJheSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGltcG9ydFNjcmlwdHMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBNZXNzYWdlQ2hhbm5lbCAhPT0gJ3VuZGVmaW5lZCc7XG5cbi8vIG5vZGVcbmZ1bmN0aW9uIHVzZU5leHRUaWNrKCkge1xuICAvLyBub2RlIHZlcnNpb24gMC4xMC54IGRpc3BsYXlzIGEgZGVwcmVjYXRpb24gd2FybmluZyB3aGVuIG5leHRUaWNrIGlzIHVzZWQgcmVjdXJzaXZlbHlcbiAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jdWpvanMvd2hlbi9pc3N1ZXMvNDEwIGZvciBkZXRhaWxzXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHByb2Nlc3MubmV4dFRpY2soZmx1c2gpO1xuICB9O1xufVxuXG4vLyB2ZXJ0eFxuZnVuY3Rpb24gdXNlVmVydHhUaW1lcigpIHtcbiAgaWYgKHR5cGVvZiB2ZXJ0eE5leHQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZlcnR4TmV4dChmbHVzaCk7XG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiB1c2VTZXRUaW1lb3V0KCk7XG59XG5cbmZ1bmN0aW9uIHVzZU11dGF0aW9uT2JzZXJ2ZXIoKSB7XG4gIHZhciBpdGVyYXRpb25zID0gMDtcbiAgdmFyIG9ic2VydmVyID0gbmV3IEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKGZsdXNoKTtcbiAgdmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyk7XG4gIG9ic2VydmVyLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhOiB0cnVlIH0pO1xuXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgbm9kZS5kYXRhID0gaXRlcmF0aW9ucyA9ICsraXRlcmF0aW9ucyAlIDI7XG4gIH07XG59XG5cbi8vIHdlYiB3b3JrZXJcbmZ1bmN0aW9uIHVzZU1lc3NhZ2VDaGFubmVsKCkge1xuICB2YXIgY2hhbm5lbCA9IG5ldyBNZXNzYWdlQ2hhbm5lbCgpO1xuICBjaGFubmVsLnBvcnQxLm9ubWVzc2FnZSA9IGZsdXNoO1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VTZXRUaW1lb3V0KCkge1xuICAvLyBTdG9yZSBzZXRUaW1lb3V0IHJlZmVyZW5jZSBzbyBlczYtcHJvbWlzZSB3aWxsIGJlIHVuYWZmZWN0ZWQgYnlcbiAgLy8gb3RoZXIgY29kZSBtb2RpZnlpbmcgc2V0VGltZW91dCAobGlrZSBzaW5vbi51c2VGYWtlVGltZXJzKCkpXG4gIHZhciBnbG9iYWxTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gZ2xvYmFsU2V0VGltZW91dChmbHVzaCwgMSk7XG4gIH07XG59XG5cbnZhciBxdWV1ZSA9IG5ldyBBcnJheSgxMDAwKTtcbmZ1bmN0aW9uIGZsdXNoKCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSArPSAyKSB7XG4gICAgdmFyIGNhbGxiYWNrID0gcXVldWVbaV07XG4gICAgdmFyIGFyZyA9IHF1ZXVlW2kgKyAxXTtcblxuICAgIGNhbGxiYWNrKGFyZyk7XG5cbiAgICBxdWV1ZVtpXSA9IHVuZGVmaW5lZDtcbiAgICBxdWV1ZVtpICsgMV0gPSB1bmRlZmluZWQ7XG4gIH1cblxuICBsZW4gPSAwO1xufVxuXG5mdW5jdGlvbiBhdHRlbXB0VmVydHgoKSB7XG4gIHRyeSB7XG4gICAgdmFyIHIgPSByZXF1aXJlO1xuICAgIHZhciB2ZXJ0eCA9IHIoJ3ZlcnR4Jyk7XG4gICAgdmVydHhOZXh0ID0gdmVydHgucnVuT25Mb29wIHx8IHZlcnR4LnJ1bk9uQ29udGV4dDtcbiAgICByZXR1cm4gdXNlVmVydHhUaW1lcigpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIHVzZVNldFRpbWVvdXQoKTtcbiAgfVxufVxuXG52YXIgc2NoZWR1bGVGbHVzaCA9IHVuZGVmaW5lZDtcbi8vIERlY2lkZSB3aGF0IGFzeW5jIG1ldGhvZCB0byB1c2UgdG8gdHJpZ2dlcmluZyBwcm9jZXNzaW5nIG9mIHF1ZXVlZCBjYWxsYmFja3M6XG5pZiAoaXNOb2RlKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VOZXh0VGljaygpO1xufSBlbHNlIGlmIChCcm93c2VyTXV0YXRpb25PYnNlcnZlcikge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTXV0YXRpb25PYnNlcnZlcigpO1xufSBlbHNlIGlmIChpc1dvcmtlcikge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTWVzc2FnZUNoYW5uZWwoKTtcbn0gZWxzZSBpZiAoYnJvd3NlcldpbmRvdyA9PT0gdW5kZWZpbmVkICYmIHR5cGVvZiByZXF1aXJlID09PSAnZnVuY3Rpb24nKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSBhdHRlbXB0VmVydHgoKTtcbn0gZWxzZSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VTZXRUaW1lb3V0KCk7XG59XG5cbmZ1bmN0aW9uIHRoZW4ob25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgdmFyIF9hcmd1bWVudHMgPSBhcmd1bWVudHM7XG5cbiAgdmFyIHBhcmVudCA9IHRoaXM7XG5cbiAgdmFyIGNoaWxkID0gbmV3IHRoaXMuY29uc3RydWN0b3Iobm9vcCk7XG5cbiAgaWYgKGNoaWxkW1BST01JU0VfSURdID09PSB1bmRlZmluZWQpIHtcbiAgICBtYWtlUHJvbWlzZShjaGlsZCk7XG4gIH1cblxuICB2YXIgX3N0YXRlID0gcGFyZW50Ll9zdGF0ZTtcblxuICBpZiAoX3N0YXRlKSB7XG4gICAgKGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBjYWxsYmFjayA9IF9hcmd1bWVudHNbX3N0YXRlIC0gMV07XG4gICAgICBhc2FwKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGludm9rZUNhbGxiYWNrKF9zdGF0ZSwgY2hpbGQsIGNhbGxiYWNrLCBwYXJlbnQuX3Jlc3VsdCk7XG4gICAgICB9KTtcbiAgICB9KSgpO1xuICB9IGVsc2Uge1xuICAgIHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbik7XG4gIH1cblxuICByZXR1cm4gY2hpbGQ7XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yZXNvbHZlYCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHdpbGwgYmVjb21lIHJlc29sdmVkIHdpdGggdGhlXG4gIHBhc3NlZCBgdmFsdWVgLiBJdCBpcyBzaG9ydGhhbmQgZm9yIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgcmVzb2x2ZSgxKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyB2YWx1ZSA9PT0gMVxuICB9KTtcbiAgYGBgXG5cbiAgSW5zdGVhZCBvZiB3cml0aW5nIHRoZSBhYm92ZSwgeW91ciBjb2RlIG5vdyBzaW1wbHkgYmVjb21lcyB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoMSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyB2YWx1ZSA9PT0gMVxuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCByZXNvbHZlXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBbnl9IHZhbHVlIHZhbHVlIHRoYXQgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSByZXNvbHZlZCB3aXRoXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgd2lsbCBiZWNvbWUgZnVsZmlsbGVkIHdpdGggdGhlIGdpdmVuXG4gIGB2YWx1ZWBcbiovXG5mdW5jdGlvbiByZXNvbHZlKG9iamVjdCkge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gIGlmIChvYmplY3QgJiYgdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgJiYgb2JqZWN0LmNvbnN0cnVjdG9yID09PSBDb25zdHJ1Y3Rvcikge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcbiAgX3Jlc29sdmUocHJvbWlzZSwgb2JqZWN0KTtcbiAgcmV0dXJuIHByb21pc2U7XG59XG5cbnZhciBQUk9NSVNFX0lEID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc3Vic3RyaW5nKDE2KTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnZhciBQRU5ESU5HID0gdm9pZCAwO1xudmFyIEZVTEZJTExFRCA9IDE7XG52YXIgUkVKRUNURUQgPSAyO1xuXG52YXIgR0VUX1RIRU5fRVJST1IgPSBuZXcgRXJyb3JPYmplY3QoKTtcblxuZnVuY3Rpb24gc2VsZkZ1bGZpbGxtZW50KCkge1xuICByZXR1cm4gbmV3IFR5cGVFcnJvcihcIllvdSBjYW5ub3QgcmVzb2x2ZSBhIHByb21pc2Ugd2l0aCBpdHNlbGZcIik7XG59XG5cbmZ1bmN0aW9uIGNhbm5vdFJldHVybk93bigpIHtcbiAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoJ0EgcHJvbWlzZXMgY2FsbGJhY2sgY2Fubm90IHJldHVybiB0aGF0IHNhbWUgcHJvbWlzZS4nKTtcbn1cblxuZnVuY3Rpb24gZ2V0VGhlbihwcm9taXNlKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHByb21pc2UudGhlbjtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBHRVRfVEhFTl9FUlJPUi5lcnJvciA9IGVycm9yO1xuICAgIHJldHVybiBHRVRfVEhFTl9FUlJPUjtcbiAgfVxufVxuXG5mdW5jdGlvbiB0cnlUaGVuKHRoZW4sIHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpIHtcbiAgdHJ5IHtcbiAgICB0aGVuLmNhbGwodmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUsIHRoZW4pIHtcbiAgYXNhcChmdW5jdGlvbiAocHJvbWlzZSkge1xuICAgIHZhciBzZWFsZWQgPSBmYWxzZTtcbiAgICB2YXIgZXJyb3IgPSB0cnlUaGVuKHRoZW4sIHRoZW5hYmxlLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIGlmIChzZWFsZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgIGlmICh0aGVuYWJsZSAhPT0gdmFsdWUpIHtcbiAgICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgaWYgKHNlYWxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuXG4gICAgICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSwgJ1NldHRsZTogJyArIChwcm9taXNlLl9sYWJlbCB8fCAnIHVua25vd24gcHJvbWlzZScpKTtcblxuICAgIGlmICghc2VhbGVkICYmIGVycm9yKSB7XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgX3JlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgfVxuICB9LCBwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgdGhlbmFibGUpIHtcbiAgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gRlVMRklMTEVEKSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgfSBlbHNlIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IFJFSkVDVEVEKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCB0aGVuYWJsZS5fcmVzdWx0KTtcbiAgfSBlbHNlIHtcbiAgICBzdWJzY3JpYmUodGhlbmFibGUsIHVuZGVmaW5lZCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICByZXR1cm4gX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHJldHVybiBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuJCQpIHtcbiAgaWYgKG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IgPT09IHByb21pc2UuY29uc3RydWN0b3IgJiYgdGhlbiQkID09PSB0aGVuICYmIG1heWJlVGhlbmFibGUuY29uc3RydWN0b3IucmVzb2x2ZSA9PT0gcmVzb2x2ZSkge1xuICAgIGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICB9IGVsc2Uge1xuICAgIGlmICh0aGVuJCQgPT09IEdFVF9USEVOX0VSUk9SKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIEdFVF9USEVOX0VSUk9SLmVycm9yKTtcbiAgICB9IGVsc2UgaWYgKHRoZW4kJCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgIH0gZWxzZSBpZiAoaXNGdW5jdGlvbih0aGVuJCQpKSB7XG4gICAgICBoYW5kbGVGb3JlaWduVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbiQkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpIHtcbiAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCBzZWxmRnVsZmlsbG1lbnQoKSk7XG4gIH0gZWxzZSBpZiAob2JqZWN0T3JGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIHZhbHVlLCBnZXRUaGVuKHZhbHVlKSk7XG4gIH0gZWxzZSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHVibGlzaFJlamVjdGlvbihwcm9taXNlKSB7XG4gIGlmIChwcm9taXNlLl9vbmVycm9yKSB7XG4gICAgcHJvbWlzZS5fb25lcnJvcihwcm9taXNlLl9yZXN1bHQpO1xuICB9XG5cbiAgcHVibGlzaChwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gZnVsZmlsbChwcm9taXNlLCB2YWx1ZSkge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlLl9yZXN1bHQgPSB2YWx1ZTtcbiAgcHJvbWlzZS5fc3RhdGUgPSBGVUxGSUxMRUQ7XG5cbiAgaWYgKHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCAhPT0gMCkge1xuICAgIGFzYXAocHVibGlzaCwgcHJvbWlzZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gX3JlamVjdChwcm9taXNlLCByZWFzb24pIHtcbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHByb21pc2UuX3N0YXRlID0gUkVKRUNURUQ7XG4gIHByb21pc2UuX3Jlc3VsdCA9IHJlYXNvbjtcblxuICBhc2FwKHB1Ymxpc2hSZWplY3Rpb24sIHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pIHtcbiAgdmFyIF9zdWJzY3JpYmVycyA9IHBhcmVudC5fc3Vic2NyaWJlcnM7XG4gIHZhciBsZW5ndGggPSBfc3Vic2NyaWJlcnMubGVuZ3RoO1xuXG4gIHBhcmVudC5fb25lcnJvciA9IG51bGw7XG5cbiAgX3N1YnNjcmliZXJzW2xlbmd0aF0gPSBjaGlsZDtcbiAgX3N1YnNjcmliZXJzW2xlbmd0aCArIEZVTEZJTExFRF0gPSBvbkZ1bGZpbGxtZW50O1xuICBfc3Vic2NyaWJlcnNbbGVuZ3RoICsgUkVKRUNURURdID0gb25SZWplY3Rpb247XG5cbiAgaWYgKGxlbmd0aCA9PT0gMCAmJiBwYXJlbnQuX3N0YXRlKSB7XG4gICAgYXNhcChwdWJsaXNoLCBwYXJlbnQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHB1Ymxpc2gocHJvbWlzZSkge1xuICB2YXIgc3Vic2NyaWJlcnMgPSBwcm9taXNlLl9zdWJzY3JpYmVycztcbiAgdmFyIHNldHRsZWQgPSBwcm9taXNlLl9zdGF0ZTtcblxuICBpZiAoc3Vic2NyaWJlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGNoaWxkID0gdW5kZWZpbmVkLFxuICAgICAgY2FsbGJhY2sgPSB1bmRlZmluZWQsXG4gICAgICBkZXRhaWwgPSBwcm9taXNlLl9yZXN1bHQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdWJzY3JpYmVycy5sZW5ndGg7IGkgKz0gMykge1xuICAgIGNoaWxkID0gc3Vic2NyaWJlcnNbaV07XG4gICAgY2FsbGJhY2sgPSBzdWJzY3JpYmVyc1tpICsgc2V0dGxlZF07XG5cbiAgICBpZiAoY2hpbGQpIHtcbiAgICAgIGludm9rZUNhbGxiYWNrKHNldHRsZWQsIGNoaWxkLCBjYWxsYmFjaywgZGV0YWlsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2soZGV0YWlsKTtcbiAgICB9XG4gIH1cblxuICBwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggPSAwO1xufVxuXG5mdW5jdGlvbiBFcnJvck9iamVjdCgpIHtcbiAgdGhpcy5lcnJvciA9IG51bGw7XG59XG5cbnZhciBUUllfQ0FUQ0hfRVJST1IgPSBuZXcgRXJyb3JPYmplY3QoKTtcblxuZnVuY3Rpb24gdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCkge1xuICB0cnkge1xuICAgIHJldHVybiBjYWxsYmFjayhkZXRhaWwpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgVFJZX0NBVENIX0VSUk9SLmVycm9yID0gZTtcbiAgICByZXR1cm4gVFJZX0NBVENIX0VSUk9SO1xuICB9XG59XG5cbmZ1bmN0aW9uIGludm9rZUNhbGxiYWNrKHNldHRsZWQsIHByb21pc2UsIGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgdmFyIGhhc0NhbGxiYWNrID0gaXNGdW5jdGlvbihjYWxsYmFjayksXG4gICAgICB2YWx1ZSA9IHVuZGVmaW5lZCxcbiAgICAgIGVycm9yID0gdW5kZWZpbmVkLFxuICAgICAgc3VjY2VlZGVkID0gdW5kZWZpbmVkLFxuICAgICAgZmFpbGVkID0gdW5kZWZpbmVkO1xuXG4gIGlmIChoYXNDYWxsYmFjaykge1xuICAgIHZhbHVlID0gdHJ5Q2F0Y2goY2FsbGJhY2ssIGRldGFpbCk7XG5cbiAgICBpZiAodmFsdWUgPT09IFRSWV9DQVRDSF9FUlJPUikge1xuICAgICAgZmFpbGVkID0gdHJ1ZTtcbiAgICAgIGVycm9yID0gdmFsdWUuZXJyb3I7XG4gICAgICB2YWx1ZSA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHByb21pc2UgPT09IHZhbHVlKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGNhbm5vdFJldHVybk93bigpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFsdWUgPSBkZXRhaWw7XG4gICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgfVxuXG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIC8vIG5vb3BcbiAgfSBlbHNlIGlmIChoYXNDYWxsYmFjayAmJiBzdWNjZWVkZWQpIHtcbiAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGZhaWxlZCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBlcnJvcik7XG4gICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBGVUxGSUxMRUQpIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gUkVKRUNURUQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaW5pdGlhbGl6ZVByb21pc2UocHJvbWlzZSwgcmVzb2x2ZXIpIHtcbiAgdHJ5IHtcbiAgICByZXNvbHZlcihmdW5jdGlvbiByZXNvbHZlUHJvbWlzZSh2YWx1ZSkge1xuICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0sIGZ1bmN0aW9uIHJlamVjdFByb21pc2UocmVhc29uKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIGUpO1xuICB9XG59XG5cbnZhciBpZCA9IDA7XG5mdW5jdGlvbiBuZXh0SWQoKSB7XG4gIHJldHVybiBpZCsrO1xufVxuXG5mdW5jdGlvbiBtYWtlUHJvbWlzZShwcm9taXNlKSB7XG4gIHByb21pc2VbUFJPTUlTRV9JRF0gPSBpZCsrO1xuICBwcm9taXNlLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgcHJvbWlzZS5fcmVzdWx0ID0gdW5kZWZpbmVkO1xuICBwcm9taXNlLl9zdWJzY3JpYmVycyA9IFtdO1xufVxuXG5mdW5jdGlvbiBFbnVtZXJhdG9yKENvbnN0cnVjdG9yLCBpbnB1dCkge1xuICB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yID0gQ29uc3RydWN0b3I7XG4gIHRoaXMucHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcblxuICBpZiAoIXRoaXMucHJvbWlzZVtQUk9NSVNFX0lEXSkge1xuICAgIG1ha2VQcm9taXNlKHRoaXMucHJvbWlzZSk7XG4gIH1cblxuICBpZiAoaXNBcnJheShpbnB1dCkpIHtcbiAgICB0aGlzLl9pbnB1dCA9IGlucHV0O1xuICAgIHRoaXMubGVuZ3RoID0gaW5wdXQubGVuZ3RoO1xuICAgIHRoaXMuX3JlbWFpbmluZyA9IGlucHV0Lmxlbmd0aDtcblxuICAgIHRoaXMuX3Jlc3VsdCA9IG5ldyBBcnJheSh0aGlzLmxlbmd0aCk7XG5cbiAgICBpZiAodGhpcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLmxlbmd0aCA9IHRoaXMubGVuZ3RoIHx8IDA7XG4gICAgICB0aGlzLl9lbnVtZXJhdGUoKTtcbiAgICAgIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICAgICAgZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIF9yZWplY3QodGhpcy5wcm9taXNlLCB2YWxpZGF0aW9uRXJyb3IoKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGlvbkVycm9yKCkge1xuICByZXR1cm4gbmV3IEVycm9yKCdBcnJheSBNZXRob2RzIG11c3QgYmUgcHJvdmlkZWQgYW4gQXJyYXknKTtcbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9lbnVtZXJhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgdmFyIF9pbnB1dCA9IHRoaXMuX2lucHV0O1xuXG4gIGZvciAodmFyIGkgPSAwOyB0aGlzLl9zdGF0ZSA9PT0gUEVORElORyAmJiBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB0aGlzLl9lYWNoRW50cnkoX2lucHV0W2ldLCBpKTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX2VhY2hFbnRyeSA9IGZ1bmN0aW9uIChlbnRyeSwgaSkge1xuICB2YXIgYyA9IHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3I7XG4gIHZhciByZXNvbHZlJCQgPSBjLnJlc29sdmU7XG5cbiAgaWYgKHJlc29sdmUkJCA9PT0gcmVzb2x2ZSkge1xuICAgIHZhciBfdGhlbiA9IGdldFRoZW4oZW50cnkpO1xuXG4gICAgaWYgKF90aGVuID09PSB0aGVuICYmIGVudHJ5Ll9zdGF0ZSAhPT0gUEVORElORykge1xuICAgICAgdGhpcy5fc2V0dGxlZEF0KGVudHJ5Ll9zdGF0ZSwgaSwgZW50cnkuX3Jlc3VsdCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgX3RoZW4gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuICAgICAgdGhpcy5fcmVzdWx0W2ldID0gZW50cnk7XG4gICAgfSBlbHNlIGlmIChjID09PSBQcm9taXNlKSB7XG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBjKG5vb3ApO1xuICAgICAgaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCBlbnRyeSwgX3RoZW4pO1xuICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KHByb21pc2UsIGkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl93aWxsU2V0dGxlQXQobmV3IGMoZnVuY3Rpb24gKHJlc29sdmUkJCkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSQkKGVudHJ5KTtcbiAgICAgIH0pLCBpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5fd2lsbFNldHRsZUF0KHJlc29sdmUkJChlbnRyeSksIGkpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fc2V0dGxlZEF0ID0gZnVuY3Rpb24gKHN0YXRlLCBpLCB2YWx1ZSkge1xuICB2YXIgcHJvbWlzZSA9IHRoaXMucHJvbWlzZTtcblxuICBpZiAocHJvbWlzZS5fc3RhdGUgPT09IFBFTkRJTkcpIHtcbiAgICB0aGlzLl9yZW1haW5pbmctLTtcblxuICAgIGlmIChzdGF0ZSA9PT0gUkVKRUNURUQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9yZXN1bHRbaV0gPSB2YWx1ZTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgZnVsZmlsbChwcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fd2lsbFNldHRsZUF0ID0gZnVuY3Rpb24gKHByb21pc2UsIGkpIHtcbiAgdmFyIGVudW1lcmF0b3IgPSB0aGlzO1xuXG4gIHN1YnNjcmliZShwcm9taXNlLCB1bmRlZmluZWQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiBlbnVtZXJhdG9yLl9zZXR0bGVkQXQoRlVMRklMTEVELCBpLCB2YWx1ZSk7XG4gIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICByZXR1cm4gZW51bWVyYXRvci5fc2V0dGxlZEF0KFJFSkVDVEVELCBpLCByZWFzb24pO1xuICB9KTtcbn07XG5cbi8qKlxuICBgUHJvbWlzZS5hbGxgIGFjY2VwdHMgYW4gYXJyYXkgb2YgcHJvbWlzZXMsIGFuZCByZXR1cm5zIGEgbmV3IHByb21pc2Ugd2hpY2hcbiAgaXMgZnVsZmlsbGVkIHdpdGggYW4gYXJyYXkgb2YgZnVsZmlsbG1lbnQgdmFsdWVzIGZvciB0aGUgcGFzc2VkIHByb21pc2VzLCBvclxuICByZWplY3RlZCB3aXRoIHRoZSByZWFzb24gb2YgdGhlIGZpcnN0IHBhc3NlZCBwcm9taXNlIHRvIGJlIHJlamVjdGVkLiBJdCBjYXN0cyBhbGxcbiAgZWxlbWVudHMgb2YgdGhlIHBhc3NlZCBpdGVyYWJsZSB0byBwcm9taXNlcyBhcyBpdCBydW5zIHRoaXMgYWxnb3JpdGhtLlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSByZXNvbHZlKDEpO1xuICBsZXQgcHJvbWlzZTIgPSByZXNvbHZlKDIpO1xuICBsZXQgcHJvbWlzZTMgPSByZXNvbHZlKDMpO1xuICBsZXQgcHJvbWlzZXMgPSBbIHByb21pc2UxLCBwcm9taXNlMiwgcHJvbWlzZTMgXTtcblxuICBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbihhcnJheSl7XG4gICAgLy8gVGhlIGFycmF5IGhlcmUgd291bGQgYmUgWyAxLCAyLCAzIF07XG4gIH0pO1xuICBgYGBcblxuICBJZiBhbnkgb2YgdGhlIGBwcm9taXNlc2AgZ2l2ZW4gdG8gYGFsbGAgYXJlIHJlamVjdGVkLCB0aGUgZmlyc3QgcHJvbWlzZVxuICB0aGF0IGlzIHJlamVjdGVkIHdpbGwgYmUgZ2l2ZW4gYXMgYW4gYXJndW1lbnQgdG8gdGhlIHJldHVybmVkIHByb21pc2VzJ3NcbiAgcmVqZWN0aW9uIGhhbmRsZXIuIEZvciBleGFtcGxlOlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSByZXNvbHZlKDEpO1xuICBsZXQgcHJvbWlzZTIgPSByZWplY3QobmV3IEVycm9yKFwiMlwiKSk7XG4gIGxldCBwcm9taXNlMyA9IHJlamVjdChuZXcgRXJyb3IoXCIzXCIpKTtcbiAgbGV0IHByb21pc2VzID0gWyBwcm9taXNlMSwgcHJvbWlzZTIsIHByb21pc2UzIF07XG5cbiAgUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24oYXJyYXkpe1xuICAgIC8vIENvZGUgaGVyZSBuZXZlciBydW5zIGJlY2F1c2UgdGhlcmUgYXJlIHJlamVjdGVkIHByb21pc2VzIVxuICB9LCBmdW5jdGlvbihlcnJvcikge1xuICAgIC8vIGVycm9yLm1lc3NhZ2UgPT09IFwiMlwiXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIGFsbFxuICBAc3RhdGljXG4gIEBwYXJhbSB7QXJyYXl9IGVudHJpZXMgYXJyYXkgb2YgcHJvbWlzZXNcbiAgQHBhcmFtIHtTdHJpbmd9IGxhYmVsIG9wdGlvbmFsIHN0cmluZyBmb3IgbGFiZWxpbmcgdGhlIHByb21pc2UuXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gcHJvbWlzZSB0aGF0IGlzIGZ1bGZpbGxlZCB3aGVuIGFsbCBgcHJvbWlzZXNgIGhhdmUgYmVlblxuICBmdWxmaWxsZWQsIG9yIHJlamVjdGVkIGlmIGFueSBvZiB0aGVtIGJlY29tZSByZWplY3RlZC5cbiAgQHN0YXRpY1xuKi9cbmZ1bmN0aW9uIGFsbChlbnRyaWVzKSB7XG4gIHJldHVybiBuZXcgRW51bWVyYXRvcih0aGlzLCBlbnRyaWVzKS5wcm9taXNlO1xufVxuXG4vKipcbiAgYFByb21pc2UucmFjZWAgcmV0dXJucyBhIG5ldyBwcm9taXNlIHdoaWNoIGlzIHNldHRsZWQgaW4gdGhlIHNhbWUgd2F5IGFzIHRoZVxuICBmaXJzdCBwYXNzZWQgcHJvbWlzZSB0byBzZXR0bGUuXG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAxJyk7XG4gICAgfSwgMjAwKTtcbiAgfSk7XG5cbiAgbGV0IHByb21pc2UyID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDInKTtcbiAgICB9LCAxMDApO1xuICB9KTtcblxuICBQcm9taXNlLnJhY2UoW3Byb21pc2UxLCBwcm9taXNlMl0pLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAvLyByZXN1bHQgPT09ICdwcm9taXNlIDInIGJlY2F1c2UgaXQgd2FzIHJlc29sdmVkIGJlZm9yZSBwcm9taXNlMVxuICAgIC8vIHdhcyByZXNvbHZlZC5cbiAgfSk7XG4gIGBgYFxuXG4gIGBQcm9taXNlLnJhY2VgIGlzIGRldGVybWluaXN0aWMgaW4gdGhhdCBvbmx5IHRoZSBzdGF0ZSBvZiB0aGUgZmlyc3RcbiAgc2V0dGxlZCBwcm9taXNlIG1hdHRlcnMuIEZvciBleGFtcGxlLCBldmVuIGlmIG90aGVyIHByb21pc2VzIGdpdmVuIHRvIHRoZVxuICBgcHJvbWlzZXNgIGFycmF5IGFyZ3VtZW50IGFyZSByZXNvbHZlZCwgYnV0IHRoZSBmaXJzdCBzZXR0bGVkIHByb21pc2UgaGFzXG4gIGJlY29tZSByZWplY3RlZCBiZWZvcmUgdGhlIG90aGVyIHByb21pc2VzIGJlY2FtZSBmdWxmaWxsZWQsIHRoZSByZXR1cm5lZFxuICBwcm9taXNlIHdpbGwgYmVjb21lIHJlamVjdGVkOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDEnKTtcbiAgICB9LCAyMDApO1xuICB9KTtcblxuICBsZXQgcHJvbWlzZTIgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ3Byb21pc2UgMicpKTtcbiAgICB9LCAxMDApO1xuICB9KTtcblxuICBQcm9taXNlLnJhY2UoW3Byb21pc2UxLCBwcm9taXNlMl0pLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAvLyBDb2RlIGhlcmUgbmV2ZXIgcnVuc1xuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAncHJvbWlzZSAyJyBiZWNhdXNlIHByb21pc2UgMiBiZWNhbWUgcmVqZWN0ZWQgYmVmb3JlXG4gICAgLy8gcHJvbWlzZSAxIGJlY2FtZSBmdWxmaWxsZWRcbiAgfSk7XG4gIGBgYFxuXG4gIEFuIGV4YW1wbGUgcmVhbC13b3JsZCB1c2UgY2FzZSBpcyBpbXBsZW1lbnRpbmcgdGltZW91dHM6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBQcm9taXNlLnJhY2UoW2FqYXgoJ2Zvby5qc29uJyksIHRpbWVvdXQoNTAwMCldKVxuICBgYGBcblxuICBAbWV0aG9kIHJhY2VcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FycmF5fSBwcm9taXNlcyBhcnJheSBvZiBwcm9taXNlcyB0byBvYnNlcnZlXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHdoaWNoIHNldHRsZXMgaW4gdGhlIHNhbWUgd2F5IGFzIHRoZSBmaXJzdCBwYXNzZWRcbiAgcHJvbWlzZSB0byBzZXR0bGUuXG4qL1xuZnVuY3Rpb24gcmFjZShlbnRyaWVzKSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgaWYgKCFpc0FycmF5KGVudHJpZXMpKSB7XG4gICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbiAoXywgcmVqZWN0KSB7XG4gICAgICByZXR1cm4gcmVqZWN0KG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYW4gYXJyYXkgdG8gcmFjZS4nKSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBDb25zdHJ1Y3RvcihmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICB2YXIgbGVuZ3RoID0gZW50cmllcy5sZW5ndGg7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIENvbnN0cnVjdG9yLnJlc29sdmUoZW50cmllc1tpXSkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yZWplY3RgIHJldHVybnMgYSBwcm9taXNlIHJlamVjdGVkIHdpdGggdGhlIHBhc3NlZCBgcmVhc29uYC5cbiAgSXQgaXMgc2hvcnRoYW5kIGZvciB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHJlamVjdChuZXcgRXJyb3IoJ1dIT09QUycpKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyBDb2RlIGhlcmUgZG9lc24ndCBydW4gYmVjYXVzZSB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCFcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ1dIT09QUydcbiAgfSk7XG4gIGBgYFxuXG4gIEluc3RlYWQgb2Ygd3JpdGluZyB0aGUgYWJvdmUsIHlvdXIgY29kZSBub3cgc2ltcGx5IGJlY29tZXMgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdXSE9PUFMnKSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAvLyBDb2RlIGhlcmUgZG9lc24ndCBydW4gYmVjYXVzZSB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCFcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ1dIT09QUydcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgcmVqZWN0XG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBbnl9IHJlYXNvbiB2YWx1ZSB0aGF0IHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVqZWN0ZWQgd2l0aC5cbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgcmVqZWN0ZWQgd2l0aCB0aGUgZ2l2ZW4gYHJlYXNvbmAuXG4qL1xuZnVuY3Rpb24gcmVqZWN0KHJlYXNvbikge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuICB2YXIgcHJvbWlzZSA9IG5ldyBDb25zdHJ1Y3Rvcihub29wKTtcbiAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICByZXR1cm4gcHJvbWlzZTtcbn1cblxuZnVuY3Rpb24gbmVlZHNSZXNvbHZlcigpIHtcbiAgdGhyb3cgbmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhIHJlc29sdmVyIGZ1bmN0aW9uIGFzIHRoZSBmaXJzdCBhcmd1bWVudCB0byB0aGUgcHJvbWlzZSBjb25zdHJ1Y3RvcicpO1xufVxuXG5mdW5jdGlvbiBuZWVkc05ldygpIHtcbiAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkZhaWxlZCB0byBjb25zdHJ1Y3QgJ1Byb21pc2UnOiBQbGVhc2UgdXNlIHRoZSAnbmV3JyBvcGVyYXRvciwgdGhpcyBvYmplY3QgY29uc3RydWN0b3IgY2Fubm90IGJlIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLlwiKTtcbn1cblxuLyoqXG4gIFByb21pc2Ugb2JqZWN0cyByZXByZXNlbnQgdGhlIGV2ZW50dWFsIHJlc3VsdCBvZiBhbiBhc3luY2hyb25vdXMgb3BlcmF0aW9uLiBUaGVcbiAgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCwgd2hpY2hcbiAgcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGUgcmVhc29uXG4gIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuXG4gIFRlcm1pbm9sb2d5XG4gIC0tLS0tLS0tLS0tXG5cbiAgLSBgcHJvbWlzZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHdpdGggYSBgdGhlbmAgbWV0aG9kIHdob3NlIGJlaGF2aW9yIGNvbmZvcm1zIHRvIHRoaXMgc3BlY2lmaWNhdGlvbi5cbiAgLSBgdGhlbmFibGVgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgYSBgdGhlbmAgbWV0aG9kLlxuICAtIGB2YWx1ZWAgaXMgYW55IGxlZ2FsIEphdmFTY3JpcHQgdmFsdWUgKGluY2x1ZGluZyB1bmRlZmluZWQsIGEgdGhlbmFibGUsIG9yIGEgcHJvbWlzZSkuXG4gIC0gYGV4Y2VwdGlvbmAgaXMgYSB2YWx1ZSB0aGF0IGlzIHRocm93biB1c2luZyB0aGUgdGhyb3cgc3RhdGVtZW50LlxuICAtIGByZWFzb25gIGlzIGEgdmFsdWUgdGhhdCBpbmRpY2F0ZXMgd2h5IGEgcHJvbWlzZSB3YXMgcmVqZWN0ZWQuXG4gIC0gYHNldHRsZWRgIHRoZSBmaW5hbCByZXN0aW5nIHN0YXRlIG9mIGEgcHJvbWlzZSwgZnVsZmlsbGVkIG9yIHJlamVjdGVkLlxuXG4gIEEgcHJvbWlzZSBjYW4gYmUgaW4gb25lIG9mIHRocmVlIHN0YXRlczogcGVuZGluZywgZnVsZmlsbGVkLCBvciByZWplY3RlZC5cblxuICBQcm9taXNlcyB0aGF0IGFyZSBmdWxmaWxsZWQgaGF2ZSBhIGZ1bGZpbGxtZW50IHZhbHVlIGFuZCBhcmUgaW4gdGhlIGZ1bGZpbGxlZFxuICBzdGF0ZS4gIFByb21pc2VzIHRoYXQgYXJlIHJlamVjdGVkIGhhdmUgYSByZWplY3Rpb24gcmVhc29uIGFuZCBhcmUgaW4gdGhlXG4gIHJlamVjdGVkIHN0YXRlLiAgQSBmdWxmaWxsbWVudCB2YWx1ZSBpcyBuZXZlciBhIHRoZW5hYmxlLlxuXG4gIFByb21pc2VzIGNhbiBhbHNvIGJlIHNhaWQgdG8gKnJlc29sdmUqIGEgdmFsdWUuICBJZiB0aGlzIHZhbHVlIGlzIGFsc28gYVxuICBwcm9taXNlLCB0aGVuIHRoZSBvcmlnaW5hbCBwcm9taXNlJ3Mgc2V0dGxlZCBzdGF0ZSB3aWxsIG1hdGNoIHRoZSB2YWx1ZSdzXG4gIHNldHRsZWQgc3RhdGUuICBTbyBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2lsbFxuICBpdHNlbGYgcmVqZWN0LCBhbmQgYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCBmdWxmaWxscyB3aWxsXG4gIGl0c2VsZiBmdWxmaWxsLlxuXG5cbiAgQmFzaWMgVXNhZ2U6XG4gIC0tLS0tLS0tLS0tLVxuXG4gIGBgYGpzXG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgLy8gb24gc3VjY2Vzc1xuICAgIHJlc29sdmUodmFsdWUpO1xuXG4gICAgLy8gb24gZmFpbHVyZVxuICAgIHJlamVjdChyZWFzb24pO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAvLyBvbiBmdWxmaWxsbWVudFxuICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAvLyBvbiByZWplY3Rpb25cbiAgfSk7XG4gIGBgYFxuXG4gIEFkdmFuY2VkIFVzYWdlOlxuICAtLS0tLS0tLS0tLS0tLS1cblxuICBQcm9taXNlcyBzaGluZSB3aGVuIGFic3RyYWN0aW5nIGF3YXkgYXN5bmNocm9ub3VzIGludGVyYWN0aW9ucyBzdWNoIGFzXG4gIGBYTUxIdHRwUmVxdWVzdGBzLlxuXG4gIGBgYGpzXG4gIGZ1bmN0aW9uIGdldEpTT04odXJsKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgICBsZXQgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cbiAgICAgIHhoci5vcGVuKCdHRVQnLCB1cmwpO1xuICAgICAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGhhbmRsZXI7XG4gICAgICB4aHIucmVzcG9uc2VUeXBlID0gJ2pzb24nO1xuICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoJ0FjY2VwdCcsICdhcHBsaWNhdGlvbi9qc29uJyk7XG4gICAgICB4aHIuc2VuZCgpO1xuXG4gICAgICBmdW5jdGlvbiBoYW5kbGVyKCkge1xuICAgICAgICBpZiAodGhpcy5yZWFkeVN0YXRlID09PSB0aGlzLkRPTkUpIHtcbiAgICAgICAgICBpZiAodGhpcy5zdGF0dXMgPT09IDIwMCkge1xuICAgICAgICAgICAgcmVzb2x2ZSh0aGlzLnJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignZ2V0SlNPTjogYCcgKyB1cmwgKyAnYCBmYWlsZWQgd2l0aCBzdGF0dXM6IFsnICsgdGhpcy5zdGF0dXMgKyAnXScpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSk7XG4gIH1cblxuICBnZXRKU09OKCcvcG9zdHMuanNvbicpLnRoZW4oZnVuY3Rpb24oanNvbikge1xuICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgIC8vIG9uIHJlamVjdGlvblxuICB9KTtcbiAgYGBgXG5cbiAgVW5saWtlIGNhbGxiYWNrcywgcHJvbWlzZXMgYXJlIGdyZWF0IGNvbXBvc2FibGUgcHJpbWl0aXZlcy5cblxuICBgYGBqc1xuICBQcm9taXNlLmFsbChbXG4gICAgZ2V0SlNPTignL3Bvc3RzJyksXG4gICAgZ2V0SlNPTignL2NvbW1lbnRzJylcbiAgXSkudGhlbihmdW5jdGlvbih2YWx1ZXMpe1xuICAgIHZhbHVlc1swXSAvLyA9PiBwb3N0c0pTT05cbiAgICB2YWx1ZXNbMV0gLy8gPT4gY29tbWVudHNKU09OXG5cbiAgICByZXR1cm4gdmFsdWVzO1xuICB9KTtcbiAgYGBgXG5cbiAgQGNsYXNzIFByb21pc2VcbiAgQHBhcmFtIHtmdW5jdGlvbn0gcmVzb2x2ZXJcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAY29uc3RydWN0b3JcbiovXG5mdW5jdGlvbiBQcm9taXNlKHJlc29sdmVyKSB7XG4gIHRoaXNbUFJPTUlTRV9JRF0gPSBuZXh0SWQoKTtcbiAgdGhpcy5fcmVzdWx0ID0gdGhpcy5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gIHRoaXMuX3N1YnNjcmliZXJzID0gW107XG5cbiAgaWYgKG5vb3AgIT09IHJlc29sdmVyKSB7XG4gICAgdHlwZW9mIHJlc29sdmVyICE9PSAnZnVuY3Rpb24nICYmIG5lZWRzUmVzb2x2ZXIoKTtcbiAgICB0aGlzIGluc3RhbmNlb2YgUHJvbWlzZSA/IGluaXRpYWxpemVQcm9taXNlKHRoaXMsIHJlc29sdmVyKSA6IG5lZWRzTmV3KCk7XG4gIH1cbn1cblxuUHJvbWlzZS5hbGwgPSBhbGw7XG5Qcm9taXNlLnJhY2UgPSByYWNlO1xuUHJvbWlzZS5yZXNvbHZlID0gcmVzb2x2ZTtcblByb21pc2UucmVqZWN0ID0gcmVqZWN0O1xuUHJvbWlzZS5fc2V0U2NoZWR1bGVyID0gc2V0U2NoZWR1bGVyO1xuUHJvbWlzZS5fc2V0QXNhcCA9IHNldEFzYXA7XG5Qcm9taXNlLl9hc2FwID0gYXNhcDtcblxuUHJvbWlzZS5wcm90b3R5cGUgPSB7XG4gIGNvbnN0cnVjdG9yOiBQcm9taXNlLFxuXG4gIC8qKlxuICAgIFRoZSBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLFxuICAgIHdoaWNoIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlXG4gICAgcmVhc29uIHdoeSB0aGUgcHJvbWlzZSBjYW5ub3QgYmUgZnVsZmlsbGVkLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbih1c2VyKXtcbiAgICAgIC8vIHVzZXIgaXMgYXZhaWxhYmxlXG4gICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHVzZXIgaXMgdW5hdmFpbGFibGUsIGFuZCB5b3UgYXJlIGdpdmVuIHRoZSByZWFzb24gd2h5XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIENoYWluaW5nXG4gICAgLS0tLS0tLS1cbiAgXG4gICAgVGhlIHJldHVybiB2YWx1ZSBvZiBgdGhlbmAgaXMgaXRzZWxmIGEgcHJvbWlzZS4gIFRoaXMgc2Vjb25kLCAnZG93bnN0cmVhbSdcbiAgICBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZmlyc3QgcHJvbWlzZSdzIGZ1bGZpbGxtZW50XG4gICAgb3IgcmVqZWN0aW9uIGhhbmRsZXIsIG9yIHJlamVjdGVkIGlmIHRoZSBoYW5kbGVyIHRocm93cyBhbiBleGNlcHRpb24uXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gdXNlci5uYW1lO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHJldHVybiAnZGVmYXVsdCBuYW1lJztcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh1c2VyTmFtZSkge1xuICAgICAgLy8gSWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGB1c2VyTmFtZWAgd2lsbCBiZSB0aGUgdXNlcidzIG5hbWUsIG90aGVyd2lzZSBpdFxuICAgICAgLy8gd2lsbCBiZSBgJ2RlZmF1bHQgbmFtZSdgXG4gICAgfSk7XG4gIFxuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScpO1xuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gaWYgYGZpbmRVc2VyYCBmdWxmaWxsZWQsIGByZWFzb25gIHdpbGwgYmUgJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jy5cbiAgICAgIC8vIElmIGBmaW5kVXNlcmAgcmVqZWN0ZWQsIGByZWFzb25gIHdpbGwgYmUgJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknLlxuICAgIH0pO1xuICAgIGBgYFxuICAgIElmIHRoZSBkb3duc3RyZWFtIHByb21pc2UgZG9lcyBub3Qgc3BlY2lmeSBhIHJlamVjdGlvbiBoYW5kbGVyLCByZWplY3Rpb24gcmVhc29ucyB3aWxsIGJlIHByb3BhZ2F0ZWQgZnVydGhlciBkb3duc3RyZWFtLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBlZGFnb2dpY2FsRXhjZXB0aW9uKCdVcHN0cmVhbSBlcnJvcicpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBUaGUgYFBlZGdhZ29jaWFsRXhjZXB0aW9uYCBpcyBwcm9wYWdhdGVkIGFsbCB0aGUgd2F5IGRvd24gdG8gaGVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBBc3NpbWlsYXRpb25cbiAgICAtLS0tLS0tLS0tLS1cbiAgXG4gICAgU29tZXRpbWVzIHRoZSB2YWx1ZSB5b3Ugd2FudCB0byBwcm9wYWdhdGUgdG8gYSBkb3duc3RyZWFtIHByb21pc2UgY2FuIG9ubHkgYmVcbiAgICByZXRyaWV2ZWQgYXN5bmNocm9ub3VzbHkuIFRoaXMgY2FuIGJlIGFjaGlldmVkIGJ5IHJldHVybmluZyBhIHByb21pc2UgaW4gdGhlXG4gICAgZnVsZmlsbG1lbnQgb3IgcmVqZWN0aW9uIGhhbmRsZXIuIFRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCB0aGVuIGJlIHBlbmRpbmdcbiAgICB1bnRpbCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBpcyBzZXR0bGVkLiBUaGlzIGlzIGNhbGxlZCAqYXNzaW1pbGF0aW9uKi5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgLy8gVGhlIHVzZXIncyBjb21tZW50cyBhcmUgbm93IGF2YWlsYWJsZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBJZiB0aGUgYXNzaW1saWF0ZWQgcHJvbWlzZSByZWplY3RzLCB0aGVuIHRoZSBkb3duc3RyZWFtIHByb21pc2Ugd2lsbCBhbHNvIHJlamVjdC5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiBmaW5kQ29tbWVudHNCeUF1dGhvcih1c2VyKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uIChjb21tZW50cykge1xuICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCBmdWxmaWxscywgd2UnbGwgaGF2ZSB0aGUgdmFsdWUgaGVyZVxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgcmVqZWN0cywgd2UnbGwgaGF2ZSB0aGUgcmVhc29uIGhlcmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgU2ltcGxlIEV4YW1wbGVcbiAgICAtLS0tLS0tLS0tLS0tLVxuICBcbiAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBsZXQgcmVzdWx0O1xuICBcbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gZmluZFJlc3VsdCgpO1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfVxuICAgIGBgYFxuICBcbiAgICBFcnJiYWNrIEV4YW1wbGVcbiAgXG4gICAgYGBganNcbiAgICBmaW5kUmVzdWx0KGZ1bmN0aW9uKHJlc3VsdCwgZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBQcm9taXNlIEV4YW1wbGU7XG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBmaW5kUmVzdWx0KCkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEFkdmFuY2VkIEV4YW1wbGVcbiAgICAtLS0tLS0tLS0tLS0tLVxuICBcbiAgICBTeW5jaHJvbm91cyBFeGFtcGxlXG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBsZXQgYXV0aG9yLCBib29rcztcbiAgXG4gICAgdHJ5IHtcbiAgICAgIGF1dGhvciA9IGZpbmRBdXRob3IoKTtcbiAgICAgIGJvb2tzICA9IGZpbmRCb29rc0J5QXV0aG9yKGF1dGhvcik7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9XG4gICAgYGBgXG4gIFxuICAgIEVycmJhY2sgRXhhbXBsZVxuICBcbiAgICBgYGBqc1xuICBcbiAgICBmdW5jdGlvbiBmb3VuZEJvb2tzKGJvb2tzKSB7XG4gIFxuICAgIH1cbiAgXG4gICAgZnVuY3Rpb24gZmFpbHVyZShyZWFzb24pIHtcbiAgXG4gICAgfVxuICBcbiAgICBmaW5kQXV0aG9yKGZ1bmN0aW9uKGF1dGhvciwgZXJyKXtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZpbmRCb29va3NCeUF1dGhvcihhdXRob3IsIGZ1bmN0aW9uKGJvb2tzLCBlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBmb3VuZEJvb2tzKGJvb2tzKTtcbiAgICAgICAgICAgICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgICAgICAgICAgICBmYWlsdXJlKHJlYXNvbik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFByb21pc2UgRXhhbXBsZTtcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGZpbmRBdXRob3IoKS5cbiAgICAgIHRoZW4oZmluZEJvb2tzQnlBdXRob3IpLlxuICAgICAgdGhlbihmdW5jdGlvbihib29rcyl7XG4gICAgICAgIC8vIGZvdW5kIGJvb2tzXG4gICAgfSkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEBtZXRob2QgdGhlblxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uRnVsZmlsbGVkXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZFxuICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAqL1xuICB0aGVuOiB0aGVuLFxuXG4gIC8qKlxuICAgIGBjYXRjaGAgaXMgc2ltcGx5IHN1Z2FyIGZvciBgdGhlbih1bmRlZmluZWQsIG9uUmVqZWN0aW9uKWAgd2hpY2ggbWFrZXMgaXQgdGhlIHNhbWVcbiAgICBhcyB0aGUgY2F0Y2ggYmxvY2sgb2YgYSB0cnkvY2F0Y2ggc3RhdGVtZW50LlxuICBcbiAgICBgYGBqc1xuICAgIGZ1bmN0aW9uIGZpbmRBdXRob3IoKXtcbiAgICAgIHRocm93IG5ldyBFcnJvcignY291bGRuJ3QgZmluZCB0aGF0IGF1dGhvcicpO1xuICAgIH1cbiAgXG4gICAgLy8gc3luY2hyb25vdXNcbiAgICB0cnkge1xuICAgICAgZmluZEF1dGhvcigpO1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH1cbiAgXG4gICAgLy8gYXN5bmMgd2l0aCBwcm9taXNlc1xuICAgIGZpbmRBdXRob3IoKS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQG1ldGhvZCBjYXRjaFxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0aW9uXG4gICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICovXG4gICdjYXRjaCc6IGZ1bmN0aW9uIF9jYXRjaChvblJlamVjdGlvbikge1xuICAgIHJldHVybiB0aGlzLnRoZW4obnVsbCwgb25SZWplY3Rpb24pO1xuICB9XG59O1xuXG5mdW5jdGlvbiBwb2x5ZmlsbCgpIHtcbiAgICB2YXIgbG9jYWwgPSB1bmRlZmluZWQ7XG5cbiAgICBpZiAodHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbG9jYWwgPSBnbG9iYWw7XG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbG9jYWwgPSBzZWxmO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsb2NhbCA9IEZ1bmN0aW9uKCdyZXR1cm4gdGhpcycpKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigncG9seWZpbGwgZmFpbGVkIGJlY2F1c2UgZ2xvYmFsIG9iamVjdCBpcyB1bmF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgUCA9IGxvY2FsLlByb21pc2U7XG5cbiAgICBpZiAoUCkge1xuICAgICAgICB2YXIgcHJvbWlzZVRvU3RyaW5nID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHByb21pc2VUb1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChQLnJlc29sdmUoKSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIC8vIHNpbGVudGx5IGlnbm9yZWRcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9taXNlVG9TdHJpbmcgPT09ICdbb2JqZWN0IFByb21pc2VdJyAmJiAhUC5jYXN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBsb2NhbC5Qcm9taXNlID0gUHJvbWlzZTtcbn1cblxuLy8gU3RyYW5nZSBjb21wYXQuLlxuUHJvbWlzZS5wb2x5ZmlsbCA9IHBvbHlmaWxsO1xuUHJvbWlzZS5Qcm9taXNlID0gUHJvbWlzZTtcblxucmV0dXJuIFByb21pc2U7XG5cbn0pKSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1lczYtcHJvbWlzZS5tYXAiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gY2FjaGVkIGZyb20gd2hhdGV2ZXIgZ2xvYmFsIGlzIHByZXNlbnQgc28gdGhhdCB0ZXN0IHJ1bm5lcnMgdGhhdCBzdHViIGl0XG4vLyBkb24ndCBicmVhayB0aGluZ3MuICBCdXQgd2UgbmVlZCB0byB3cmFwIGl0IGluIGEgdHJ5IGNhdGNoIGluIGNhc2UgaXQgaXNcbi8vIHdyYXBwZWQgaW4gc3RyaWN0IG1vZGUgY29kZSB3aGljaCBkb2Vzbid0IGRlZmluZSBhbnkgZ2xvYmFscy4gIEl0J3MgaW5zaWRlIGFcbi8vIGZ1bmN0aW9uIGJlY2F1c2UgdHJ5L2NhdGNoZXMgZGVvcHRpbWl6ZSBpbiBjZXJ0YWluIGVuZ2luZXMuXG5cbnZhciBjYWNoZWRTZXRUaW1lb3V0O1xudmFyIGNhY2hlZENsZWFyVGltZW91dDtcblxuZnVuY3Rpb24gZGVmYXVsdFNldFRpbW91dCgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NldFRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbmZ1bmN0aW9uIGRlZmF1bHRDbGVhclRpbWVvdXQgKCkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2xlYXJUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG4oZnVuY3Rpb24gKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2V0VGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2xlYXJUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBkZWZhdWx0Q2xlYXJUaW1lb3V0O1xuICAgIH1cbn0gKCkpXG5mdW5jdGlvbiBydW5UaW1lb3V0KGZ1bikge1xuICAgIGlmIChjYWNoZWRTZXRUaW1lb3V0ID09PSBzZXRUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICAvLyBpZiBzZXRUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkU2V0VGltZW91dCA9PT0gZGVmYXVsdFNldFRpbW91dCB8fCAhY2FjaGVkU2V0VGltZW91dCkgJiYgc2V0VGltZW91dCkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dChmdW4sIDApO1xuICAgIH0gY2F0Y2goZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwobnVsbCwgZnVuLCAwKTtcbiAgICAgICAgfSBjYXRjaChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKHRoaXMsIGZ1biwgMCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxufVxuZnVuY3Rpb24gcnVuQ2xlYXJUaW1lb3V0KG1hcmtlcikge1xuICAgIGlmIChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGNsZWFyVGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICAvLyBpZiBjbGVhclRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRDbGVhclRpbWVvdXQgPT09IGRlZmF1bHRDbGVhclRpbWVvdXQgfHwgIWNhY2hlZENsZWFyVGltZW91dCkgJiYgY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgcmV0dXJuIGNsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCAgdHJ1c3QgdGhlIGdsb2JhbCBvYmplY3Qgd2hlbiBjYWxsZWQgbm9ybWFsbHlcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbChudWxsLCBtYXJrZXIpO1xuICAgICAgICB9IGNhdGNoIChlKXtcbiAgICAgICAgICAgIC8vIHNhbWUgYXMgYWJvdmUgYnV0IHdoZW4gaXQncyBhIHZlcnNpb24gb2YgSS5FLiB0aGF0IG11c3QgaGF2ZSB0aGUgZ2xvYmFsIG9iamVjdCBmb3IgJ3RoaXMnLCBob3BmdWxseSBvdXIgY29udGV4dCBjb3JyZWN0IG90aGVyd2lzZSBpdCB3aWxsIHRocm93IGEgZ2xvYmFsIGVycm9yLlxuICAgICAgICAgICAgLy8gU29tZSB2ZXJzaW9ucyBvZiBJLkUuIGhhdmUgZGlmZmVyZW50IHJ1bGVzIGZvciBjbGVhclRpbWVvdXQgdnMgc2V0VGltZW91dFxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKHRoaXMsIG1hcmtlcik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBpZiAoIWRyYWluaW5nIHx8ICFjdXJyZW50UXVldWUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBydW5UaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBydW5DbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBydW5UaW1lb3V0KGRyYWluUXVldWUpO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiZXhwb3J0IGNvbnN0IEVWRU5UUyA9IHtcclxuICBTSUdOSU46ICdTSUdOSU4nLFxyXG4gIFNJR05PVVQ6ICdTSUdOT1VUJyxcclxuICBTSUdOVVA6ICdTSUdOVVAnXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgVVJMUyA9IHtcclxuICB0b2tlbjogJ3Rva2VuJyxcclxuICBzaWdudXA6ICcxL3VzZXIvc2lnbnVwJyxcclxuICByZXF1ZXN0UmVzZXRQYXNzd29yZDogJzEvdXNlci9yZXF1ZXN0UmVzZXRQYXNzd29yZCcsXHJcbiAgcmVzZXRQYXNzd29yZDogJzEvdXNlci9yZXNldFBhc3N3b3JkJyxcclxuICBjaGFuZ2VQYXNzd29yZDogJzEvdXNlci9jaGFuZ2VQYXNzd29yZCcsXHJcbiAgb2JqZWN0czogJzEvb2JqZWN0cycsXHJcbiAgb2JqZWN0c0FjdGlvbjogJzEvb2JqZWN0cy9hY3Rpb24nLFxyXG4gIC8vIHNvY2lhbExvZ2luV2l0aENvZGU6ICcxL3VzZXIvUFJPVklERVIvY29kZScsXHJcbiAgLy8gc29jaWFsU2luZ3VwV2l0aENvZGU6ICcxL3VzZXIvUFJPVklERVIvc2lnbnVwQ29kZScsXHJcbiAgc29jaWFsU2lnbmluV2l0aFRva2VuOiAnMS91c2VyL1BST1ZJREVSL3Rva2VuJyxcclxuICBwcm9maWxlOiAnL2FwaS9hY2NvdW50L3Byb2ZpbGUnLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IFNPQ0lBTF9QUk9WSURFUlMgPSB7XHJcbiAgZ2l0aHViOiB7bmFtZTogJ2dpdGh1YicsIGxhYmVsOiAnR2l0aHViJywgdXJsOiAnd3d3LmdpdGh1Yi5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjNDQ0J30sIGlkOiAxfSxcclxuICBnb29nbGU6IHtuYW1lOiAnZ29vZ2xlJywgbGFiZWw6ICdHb29nbGUnLCB1cmw6ICd3d3cuZ29vZ2xlLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyNkZDRiMzknfSwgaWQ6IDJ9LFxyXG4gIGZhY2Vib29rOiB7bmFtZTogJ2ZhY2Vib29rJywgbGFiZWw6ICdGYWNlYm9vaycsIHVybDogJ3d3dy5mYWNlYm9vay5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjM2I1OTk4J30sIGlkOiAzfSxcclxuICB0d2l0dGVyOiB7bmFtZTogJ3R3aXR0ZXInLCBsYWJlbDogJ1R3aXR0ZXInLCB1cmw6ICd3d3cudHdpdHRlci5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjNTVhY2VlJ30sIGlkOiA0fVxyXG59O1xyXG4iLCJleHBvcnQgZGVmYXVsdCB7XHJcbiAgYXBwTmFtZTogbnVsbCxcclxuICBhbm9ueW1vdXNUb2tlbjogbnVsbCxcclxuICBzaWduVXBUb2tlbjogbnVsbCxcclxuICBhcGlVcmw6ICdodHRwczovL2FwaS5iYWNrYW5kLmNvbScsXHJcbiAgc3RvcmFnZTogd2luZG93LmxvY2FsU3RvcmFnZSxcclxuICBzdG9yYWdlUHJlZml4OiAnQkFDS0FORF8nLFxyXG4gIG1hbmFnZVJlZnJlc2hUb2tlbjogdHJ1ZSxcclxuICBydW5TaWduaW5BZnRlclNpZ251cDogdHJ1ZSxcclxuICBydW5Tb2NrZXQ6IGZhbHNlLFxyXG4gIHNvY2tldFVybDogJ2h0dHBzOi8vc29ja2V0LmJhY2thbmQuY29tJyxcclxuICBpc01vYmlsZTogZmFsc2UsXHJcbn07XHJcbiIsImV4cG9ydCBjb25zdCBmaWx0ZXIgPSB7XHJcbiAgY3JlYXRlOiAoZmllbGROYW1lLCBvcGVyYXRvciwgdmFsdWUpID0+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGZpZWxkTmFtZSxcclxuICAgICAgb3BlcmF0b3IsXHJcbiAgICAgIHZhbHVlXHJcbiAgICB9XHJcbiAgfSxcclxuICBvcGVyYXRvcnM6IHtcclxuICAgIG51bWVyaWM6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIGdyZWF0ZXJUaGFuOiBcImdyZWF0ZXJUaGFuXCIsIGdyZWF0ZXJUaGFuT3JFcXVhbHNUbzogXCJncmVhdGVyVGhhbk9yRXF1YWxzVG9cIiwgbGVzc1RoYW46IFwibGVzc1RoYW5cIiwgbGVzc1RoYW5PckVxdWFsc1RvOiBcImxlc3NUaGFuT3JFcXVhbHNUb1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICBkYXRlOiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBncmVhdGVyVGhhbjogXCJncmVhdGVyVGhhblwiLCBncmVhdGVyVGhhbk9yRXF1YWxzVG86IFwiZ3JlYXRlclRoYW5PckVxdWFsc1RvXCIsIGxlc3NUaGFuOiBcImxlc3NUaGFuXCIsIGxlc3NUaGFuT3JFcXVhbHNUbzogXCJsZXNzVGhhbk9yRXF1YWxzVG9cIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgdGV4dDogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgc3RhcnRzV2l0aDogXCJzdGFydHNXaXRoXCIsIGVuZHNXaXRoOiBcImVuZHNXaXRoXCIsIGNvbnRhaW5zOiBcImNvbnRhaW5zXCIsIG5vdENvbnRhaW5zOiBcIm5vdENvbnRhaW5zXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIGJvb2xlYW46IHsgZXF1YWxzOiBcImVxdWFsc1wiIH0sXHJcbiAgICByZWxhdGlvbjogeyBpbjogXCJpblwiIH1cclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzb3J0ID0ge1xyXG4gIGNyZWF0ZTogKGZpZWxkTmFtZSwgb3JkZXIpID0+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGZpZWxkTmFtZSxcclxuICAgICAgb3JkZXJcclxuICAgIH1cclxuICB9LFxyXG4gIG9yZGVyczogeyBhc2M6IFwiYXNjXCIsIGRlc2M6IFwiZGVzY1wiIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGV4Y2x1ZGUgPSB7XHJcbiAgb3B0aW9uczogeyBtZXRhZGF0YTogXCJtZXRhZGF0YVwiLCB0b3RhbFJvd3M6IFwidG90YWxSb3dzXCIsIGFsbDogXCJtZXRhZGF0YSx0b3RhbFJvd3NcIiB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBTdG9yYWdlQWJzdHJhY3Qge1xyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgaWYgKHRoaXMuY29uc3RydWN0b3IgPT09IFN0b3JhZ2VBYnN0cmFjdCkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2FuIG5vdCBjb25zdHJ1Y3QgYWJzdHJhY3QgY2xhc3MuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuc2V0SXRlbSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuc2V0SXRlbSA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5zZXRJdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIHNldEl0ZW0gbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLmdldEl0ZW0gPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldEl0ZW0gPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUuZ2V0SXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSBnZXRJdGVtIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5yZW1vdmVJdGVtID09PSB1bmRlZmluZWQgfHwgdGhpcy5yZW1vdmVJdGVtID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLnJlbW92ZUl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgcmVtb3ZlSXRlbSBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuY2xlYXIgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmNsZWFyID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLmNsZWFyKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIGNsZWFyIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICAvLyB0aGlzLmRhdGEgPSB7fTtcclxuICB9XHJcbiAgc2V0SXRlbSAoaWQsIHZhbCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBzZXRJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gcmV0dXJuIHRoaXMuZGF0YVtpZF0gPSBTdHJpbmcodmFsKTtcclxuICB9XHJcbiAgZ2V0SXRlbSAoaWQpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2QgZ2V0SXRlbSBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIHJldHVybiB0aGlzLmRhdGEuaGFzT3duUHJvcGVydHkoaWQpID8gdGhpcy5fZGF0YVtpZF0gOiBudWxsO1xyXG4gIH1cclxuICByZW1vdmVJdGVtIChpZCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCByZW1vdmVJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gZGVsZXRlIHRoaXMuZGF0YVtpZF07XHJcbiAgICAvLyByZXR1cm4gbnVsbDtcclxuICAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2QgY2xlYXIgZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyByZXR1cm4gdGhpcy5kYXRhID0ge307XHJcbiAgIH1cclxufVxyXG4iLCIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICogYmFja2FuZCBKYXZhU2NyaXB0IExpYnJhcnlcclxuICogQXV0aG9yczogYmFja2FuZFxyXG4gKiBMaWNlbnNlOiBNSVQgKGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwKVxyXG4gKiBDb21waWxlZCBBdDogMjYvMTEvMjAxNlxyXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJ1xyXG5pbXBvcnQgKiBhcyBjb25zdGFudHMgZnJvbSAnLi9jb25zdGFudHMnXHJcbmltcG9ydCAqIGFzIGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJ1xyXG5pbXBvcnQgU3RvcmFnZSBmcm9tICcuL3V0aWxzL3N0b3JhZ2UnXHJcbmltcG9ydCBIdHRwIGZyb20gJy4vdXRpbHMvaHR0cCdcclxuaW1wb3J0IFNvY2tldCBmcm9tICcuL3V0aWxzL3NvY2tldCdcclxuaW1wb3J0ICogYXMgYXV0aCBmcm9tICcuL3NlcnZpY2VzL2F1dGgnXHJcbmltcG9ydCAqIGFzIGNydWQgZnJvbSAnLi9zZXJ2aWNlcy9jcnVkJ1xyXG5pbXBvcnQgKiBhcyBmaWxlcyBmcm9tICcuL3NlcnZpY2VzL2ZpbGVzJ1xyXG5cclxubGV0IGJhY2thbmQgPSB7XHJcbiAgY29uc3RhbnRzLFxyXG4gIGhlbHBlcnMsXHJcbn1cclxuYmFja2FuZC5pbml0aWF0ZSA9IChjb25maWcgPSB7fSkgPT4ge1xyXG5cclxuICAvLyBjb21iaW5lIGRlZmF1bHRzIHdpdGggdXNlciBjb25maWdcclxuICBPYmplY3QuYXNzaWduKGRlZmF1bHRzLCBjb25maWcpO1xyXG4gIC8vIGNvbnNvbGUubG9nKGRlZmF1bHRzKTtcclxuXHJcbiAgLy8gdmVyaWZ5IG5ldyBkZWZhdWx0c1xyXG4gIGlmICghZGVmYXVsdHMuYXBwTmFtZSlcclxuICAgIHRocm93IG5ldyBFcnJvcignYXBwTmFtZSBpcyBtaXNzaW5nJyk7XHJcbiAgaWYgKCFkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbilcclxuICAgIHRocm93IG5ldyBFcnJvcignYW5vbnltb3VzVG9rZW4gaXMgbWlzc2luZycpO1xyXG4gIGlmICghZGVmYXVsdHMuc2lnblVwVG9rZW4pXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3NpZ25VcFRva2VuIGlzIG1pc3NpbmcnKTtcclxuXHJcbiAgLy8gaW5pdCBnbG9iYWxzXHJcbiAgbGV0IHN0b3JhZ2UgPSBuZXcgU3RvcmFnZShkZWZhdWx0cy5zdG9yYWdlLCBkZWZhdWx0cy5zdG9yYWdlUHJlZml4KTtcclxuICBsZXQgaHR0cCA9IEh0dHAuY3JlYXRlKHtcclxuICAgIGJhc2VVUkw6IGRlZmF1bHRzLmFwaVVybFxyXG4gIH0pO1xyXG4gIGxldCBzY29wZSA9IHtcclxuICAgIHN0b3JhZ2UsXHJcbiAgICBodHRwLFxyXG4gICAgaXNJRTogd2luZG93LmRvY3VtZW50ICYmIChmYWxzZSB8fCAhIWRvY3VtZW50LmRvY3VtZW50TW9kZSksXHJcbiAgfVxyXG4gIGxldCBzb2NrZXQgPSBudWxsO1xyXG4gIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgIHNvY2tldCA9IG5ldyBTb2NrZXQoZGVmYXVsdHMuc29ja2V0VXJsKTtcclxuICAgIHNjb3BlLnNvY2tldCA9IHNvY2tldDtcclxuICB9XHJcblxyXG4gIC8vIGJpbmQgZ2xvYmFscyB0byBhbGwgc2VydmljZSBmdW5jdGlvbnNcclxuICBsZXQgc2VydmljZSA9IE9iamVjdC5hc3NpZ24oe30sIGF1dGgsIGNydWQsIGZpbGVzKTtcclxuICBmb3IgKGxldCBmbiBpbiBzZXJ2aWNlKSB7XHJcbiAgICBzZXJ2aWNlW2ZuXSA9IHNlcnZpY2VbZm5dLmJpbmQoc2NvcGUpO1xyXG4gIH1cclxuXHJcbiAgLy8gc2V0IGludGVyY2VwdG9yIGZvciBhdXRoSGVhZGVycyAmIHJlZnJlc2hUb2tlblxyXG4gIGh0dHAuY29uZmlnLmludGVyY2VwdG9ycyA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gICAgICBpZiAoY29uZmlnLnVybC5pbmRleE9mKGNvbnN0YW50cy5VUkxTLnRva2VuKSA9PT0gIC0xICYmIHN0b3JhZ2UuZ2V0KCd1c2VyJykpIHtcclxuICAgICAgICBjb25maWcuaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGNvbmZpZy5oZWFkZXJzLCBzdG9yYWdlLmdldCgndXNlcicpLnRva2VuKVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgcmVzcG9uc2VFcnJvcjogZnVuY3Rpb24gKGVycm9yLCBjb25maWcsIHJlc29sdmUsIHJlamVjdCwgc2NiLCBlY2IpIHtcclxuICAgICAgaWYgKGNvbmZpZy51cmwuaW5kZXhPZihjb25zdGFudHMuVVJMUy50b2tlbikgPT09ICAtMVxyXG4gICAgICAgJiYgZGVmYXVsdHMubWFuYWdlUmVmcmVzaFRva2VuXHJcbiAgICAgICAmJiBlcnJvci5zdGF0dXMgPT09IDQwMVxyXG4gICAgICAgJiYgZXJyb3IuZGF0YSAmJiBlcnJvci5kYXRhLk1lc3NhZ2UgPT09ICdpbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nKSB7XHJcbiAgICAgICAgIGF1dGguX19oYW5kbGVSZWZyZXNoVG9rZW5fXy5jYWxsKHNjb3BlLCBlcnJvcilcclxuICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgIHRoaXMucmVxdWVzdChjb25maWcsIHNjYiwgZWNiKTtcclxuICAgICAgICAgfSlcclxuICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGdldCBkYXRhIGZyb20gdXJsIGluIHNvY2lhbCBzaWduLWluIHBvcHVwXHJcbiAgaWYgKCFkZWZhdWx0cy5pc01vYmlsZSkge1xyXG4gICAgbGV0IGRhdGFNYXRjaCA9IC9cXD8oZGF0YXxlcnJvcik9KC4rKS8uZXhlYyh3aW5kb3cubG9jYXRpb24uaHJlZik7XHJcbiAgICBpZiAoZGF0YU1hdGNoICYmIGRhdGFNYXRjaFsxXSAmJiBkYXRhTWF0Y2hbMl0pIHtcclxuICAgICAgbGV0IGRhdGEgPSB7XHJcbiAgICAgICAgZGF0YTogSlNPTi5wYXJzZShkZWNvZGVVUklDb21wb25lbnQoZGF0YU1hdGNoWzJdLnJlcGxhY2UoLyMuKi8sICcnKSkpXHJcbiAgICAgIH1cclxuICAgICAgZGF0YS5zdGF0dXMgPSAoZGF0YU1hdGNoWzFdID09PSAnZGF0YScpID8gMjAwIDogMDtcclxuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ1NPQ0lBTF9EQVRBJywgSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xyXG4gICAgICAvLyB2YXIgaXNJRSA9IGZhbHNlIHx8ICEhZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xyXG4gICAgICAvLyBpZiAoIWlzSUUpIHtcclxuICAgICAgLy8gICB3aW5kb3cub3BlbmVyLnBvc3RNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGRhdGEpLCBsb2NhdGlvbi5vcmlnaW4pO1xyXG4gICAgICAvLyB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBleHBvc2UgYmFja2FuZCBuYW1lc3BhY2UgdG8gd2luZG93XHJcbiAgZGVsZXRlIGJhY2thbmQuaW5pdGlhdGU7XHJcbiAgT2JqZWN0LmFzc2lnbihiYWNrYW5kLCB7c2VydmljZX0pO1xyXG4gIGlmKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgc3RvcmFnZS5nZXQoJ3VzZXInKSAmJiBzb2NrZXQuY29ubmVjdChzdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24gfHwgbnVsbCwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpXHJcbiAgICBPYmplY3QuYXNzaWduKGJhY2thbmQsIHtzb2NrZXR9KTtcclxuICB9XG5cclxufVxyXG5cbm1vZHVsZS5leHBvcnRzID0gYmFja2FuZFxyXG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcbmltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xyXG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi8uLi9kZWZhdWx0cydcblxyXG5mdW5jdGlvbiBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18gKHN0YXR1cyA9IDAsIHN0YXR1c1RleHQgPSAnJywgaGVhZGVycyA9IFtdLCBkYXRhID0gJycpIHtcclxuICByZXR1cm4ge1xyXG4gICAgc3RhdHVzLFxyXG4gICAgc3RhdHVzVGV4dCxcclxuICAgIGhlYWRlcnMsXHJcbiAgICBkYXRhXHJcbiAgfVxyXG59XHJcbmZ1bmN0aW9uIF9fZGlzcGF0Y2hFdmVudF9fIChuYW1lKSB7XHJcbiAgbGV0IGV2ZW50O1xyXG4gIGlmKGRlZmF1bHRzLmlzTW9iaWxlKVxyXG4gICAgcmV0dXJuO1xyXG4gIGlmIChkb2N1bWVudC5jcmVhdGVFdmVudCkge1xyXG4gICAgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcclxuICAgIGV2ZW50LmluaXRFdmVudChuYW1lLCB0cnVlLCB0cnVlKTtcclxuICAgIGV2ZW50LmV2ZW50TmFtZSA9IG5hbWU7XHJcbiAgICB3aW5kb3cuZGlzcGF0Y2hFdmVudChldmVudCk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnRPYmplY3QoKTtcclxuICAgIGV2ZW50LmV2ZW50VHlwZSA9IG5hbWU7XHJcbiAgICBldmVudC5ldmVudE5hbWUgPSBuYW1lO1xyXG4gICAgd2luZG93LmZpcmVFdmVudCgnb24nICsgZXZlbnQuZXZlbnRUeXBlLCBldmVudCk7XHJcbiAgfVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBfX2hhbmRsZVJlZnJlc2hUb2tlbl9fIChlcnJvcikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlciB8fCAhdXNlci5kZXRhaWxzLnJlZnJlc2hfdG9rZW4pIHtcclxuICAgICAgcmVqZWN0KF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdObyBjYWNoZWQgdXNlciBvciByZWZyZXNoVG9rZW4gZm91bmQuIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkLicpKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgIHVzZXJuYW1lOiB1c2VyLmRldGFpbHMudXNlcm5hbWUsXHJcbiAgICAgICAgcmVmcmVzaFRva2VuOiB1c2VyLmRldGFpbHMucmVmcmVzaF90b2tlbixcclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH0pXHJcbn07XHJcbmV4cG9ydCBmdW5jdGlvbiB1c2VBbm9ueW1vdXNBdXRoIChzY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRldGFpbHMgPSB7XHJcbiAgICAgIFwiYWNjZXNzX3Rva2VuXCI6IGRlZmF1bHRzLmFub255bW91c1Rva2VuLFxyXG4gICAgICBcInRva2VuX3R5cGVcIjogXCJBbm9ueW1vdXNUb2tlblwiLFxyXG4gICAgICBcImV4cGlyZXNfaW5cIjogMCxcclxuICAgICAgXCJhcHBOYW1lXCI6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgIFwidXNlcm5hbWVcIjogXCJHdWVzdFwiLFxyXG4gICAgICBcInJvbGVcIjogXCJVc2VyXCIsXHJcbiAgICAgIFwiZmlyc3ROYW1lXCI6IFwiYW5vbnltb3VzXCIsXHJcbiAgICAgIFwibGFzdE5hbWVcIjogXCJhbm9ueW1vdXNcIixcclxuICAgICAgXCJmdWxsTmFtZVwiOiBcIlwiLFxyXG4gICAgICBcInJlZ0lkXCI6IDAgLFxyXG4gICAgICBcInVzZXJJZFwiOiBudWxsXHJcbiAgICB9XHJcbiAgICB0aGlzLnN0b3JhZ2Uuc2V0KCd1c2VyJywge1xyXG4gICAgICB0b2tlbjoge1xyXG4gICAgICAgIEFub255bW91c1Rva2VuOiBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlblxyXG4gICAgICB9LFxyXG4gICAgICBkZXRhaWxzLFxyXG4gICAgfSk7XHJcbiAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdChudWxsLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSk7XHJcbiAgICB9XHJcbiAgICBzY2IgJiYgc2NiKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCBkZXRhaWxzKSk7XHJcbiAgICByZXNvbHZlKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCBkZXRhaWxzKSk7XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25pbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMudG9rZW4sXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnXHJcbiAgICAgIH0sXHJcbiAgICAgIGRhdGE6IGB1c2VybmFtZT0ke3VzZXJuYW1lfSZwYXNzd29yZD0ke3Bhc3N3b3JkfSZhcHBOYW1lPSR7ZGVmYXVsdHMuYXBwTmFtZX0mZ3JhbnRfdHlwZT1wYXNzd29yZGBcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHRoaXMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlbn1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWxzOiByZXNwb25zZS5kYXRhXHJcbiAgICAgIH0pO1xyXG4gICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICAgIHRoaXMuc29ja2V0LmNvbm5lY3QodGhpcy5zdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24sIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgICAgfVxyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2lnbnVwIChlbWFpbCwgcGFzc3dvcmQsIGNvbmZpcm1QYXNzd29yZCwgZmlyc3ROYW1lLCBsYXN0TmFtZSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgdGhpcy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnNpZ251cCxcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnU2lnblVwVG9rZW4nOiBkZWZhdWx0cy5zaWduVXBUb2tlblxyXG4gICAgICB9LFxyXG4gICAgICBkYXRhOiB7XHJcbiAgICAgICAgZmlyc3ROYW1lLFxyXG4gICAgICAgIGxhc3ROYW1lLFxyXG4gICAgICAgIGVtYWlsLFxyXG4gICAgICAgIHBhc3N3b3JkLFxyXG4gICAgICAgIGNvbmZpcm1QYXNzd29yZFxyXG4gICAgICB9XHJcbiAgICB9LCBzY2IgLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICBpZihkZWZhdWx0cy5ydW5TaWduaW5BZnRlclNpZ251cCkge1xyXG4gICAgICAgIHJldHVybiBzaWduaW4uY2FsbCh0aGlzLCByZXNwb25zZS5kYXRhLnVzZXJuYW1lLCBwYXNzd29yZCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIF9fZ2V0U29jaWFsVXJsX18gKHByb3ZpZGVyTmFtZSwgaXNTaWdudXAsIGlzQXV0b1NpZ25VcCkge1xyXG4gIGxldCBwcm92aWRlciA9IFNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJOYW1lXTtcclxuICBsZXQgYWN0aW9uID0gaXNTaWdudXAgPyAndXAnIDogJ2luJztcclxuICBsZXQgYXV0b1NpZ25VcFBhcmFtID0gYCZzaWdudXBJZk5vdFNpZ25lZEluPSR7KCFpc1NpZ251cCAmJiBpc0F1dG9TaWduVXApID8gJ3RydWUnIDogJ2ZhbHNlJ31gO1xyXG4gIHJldHVybiBgL3VzZXIvc29jaWFsU2lnbiR7YWN0aW9ufT9wcm92aWRlcj0ke3Byb3ZpZGVyLmxhYmVsfSR7YXV0b1NpZ25VcFBhcmFtfSZyZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD1zZWxmJnJlZGlyZWN0X3VyaT0ke3Byb3ZpZGVyLnVybH0mc3RhdGU9YDtcclxufVxyXG5mdW5jdGlvbiBfX3NvY2lhbEF1dGhfXyAocHJvdmlkZXIsIGlzU2lnblVwLCBzcGVjLCBlbWFpbCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBpZiAoIVNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJdKSB7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBTb2NpYWwgUHJvdmlkZXInKSk7XHJcbiAgICB9XHJcbiAgICBsZXQgdXJsID0gIGAke2RlZmF1bHRzLmFwaVVybH0vMS8ke19fZ2V0U29jaWFsVXJsX18ocHJvdmlkZXIsIGlzU2lnblVwLCB0cnVlKX0mYXBwbmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JHtlbWFpbCA/ICcmZW1haWw9JytlbWFpbCA6ICcnfSZyZXR1cm5BZGRyZXNzPWAgLy8gJHtsb2NhdGlvbi5ocmVmfVxuICAgIGxldCBwb3B1cCA9IG51bGw7XG4gICAgaWYgKCF0aGlzLmlzSUUpIHtcbiAgICAgIHBvcHVwID0gd2luZG93Lm9wZW4odXJsLCAnc29jaWFscG9wdXAnLCBzcGVjKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBwb3B1cCA9IHdpbmRvdy5vcGVuKCcnLCAnJywgc3BlYyk7XG4gICAgICBwb3B1cC5sb2NhdGlvbiA9IHVybDtcbiAgICB9XG4gICAgaWYgKHBvcHVwICYmIHBvcHVwLmZvY3VzKSB7IHBvcHVwLmZvY3VzKCkgfVxyXG5cclxuICAgIGxldCBoYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgICBsZXQgdXJsID0gZS50eXBlID09PSAnbWVzc2FnZScgPyBlLm9yaWdpbiA6IGUudXJsO1xyXG4gICAgICBpZiAodXJsLmluZGV4T2Yod2luZG93LmxvY2F0aW9uLmhyZWYpID09PSAtMSkge1xyXG4gICAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBPcmlnaW4gTWVzc2FnZScpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlcyA9IGUudHlwZSA9PT0gJ21lc3NhZ2UnID8gSlNPTi5wYXJzZShlLmRhdGEpIDogSlNPTi5wYXJzZShlLm5ld1ZhbHVlKTtcclxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoZS50eXBlLCBoYW5kbGVyLCBmYWxzZSk7XHJcbiAgICAgIGlmIChwb3B1cCAmJiBwb3B1cC5jbG9zZSkgeyBwb3B1cC5jbG9zZSgpIH1cclxuICAgICAgZS50eXBlID09PSAnc3RvcmFnZScgJiYgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oZS5rZXkpO1xyXG5cclxuICAgICAgaWYgKHJlcy5zdGF0dXMgIT0gMjAwKSB7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfVxyXG4gICAgaGFuZGxlciA9IGhhbmRsZXIuYmluZChwb3B1cCk7XHJcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgaGFuZGxlciAsIGZhbHNlKTtcclxuICAgIC8vIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWduaW4gKHByb3ZpZGVyLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fLmNhbGwodGhpcywgcHJvdmlkZXIsIGZhbHNlLCBzcGVjLCAnJylcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHNvY2lhbFNpZ25pbldpdGhUb2tlbiAocHJvdmlkZXIsIHRva2VuLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc29jaWFsU2lnbmluV2l0aFRva2VuLnJlcGxhY2UoJ1BST1ZJREVSJywgcHJvdmlkZXIpLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBwYXJhbXM6IHtcclxuICAgICAgICBhY2Nlc3NUb2tlbjogdG9rZW4sXHJcbiAgICAgICAgYXBwTmFtZTogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgICBzaWdudXBJZk5vdFNpZ25lZEluOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIFRPRE86UEFUQ0hcclxuICAgICAgdGhpcy5odHRwKHtcclxuICAgICAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vdXNlcnNgLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICBmaWx0ZXI6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwiZmllbGROYW1lXCI6IFwiZW1haWxcIixcclxuICAgICAgICAgICAgICBcIm9wZXJhdG9yXCI6IFwiZXF1YWxzXCIsXHJcbiAgICAgICAgICAgICAgXCJ2YWx1ZVwiOiByZXNwb25zZS5kYXRhLnVzZXJuYW1lXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihwYXRjaCA9PiB7XHJcbiAgICAgICAgbGV0IHtpZCwgZmlyc3ROYW1lLCBsYXN0TmFtZX0gPSBwYXRjaC5kYXRhLmRhdGFbMF07XG4gICAgICAgIGxldCB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xuICAgICAgICBsZXQgbmV3RGV0YWlscyA9ICB7dXNlcklkOiBpZC50b1N0cmluZygpLCBmaXJzdE5hbWUsIGxhc3ROYW1lfTtcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcbiAgICAgICAgICB0b2tlbjogdXNlci50b2tlbixcbiAgICAgICAgICBkZXRhaWxzOiBPYmplY3QuYXNzaWduKHt9LCB1c2VyLmRldGFpbHMsIG5ld0RldGFpbHMpXG4gICAgICAgIH0pO1xuICAgICAgICB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgICAgIGxldCByZXMgPSBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18ocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCByZXNwb25zZS5oZWFkZXJzLCB1c2VyLmRldGFpbHMpO1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIEVPUFxyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn07XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWdudXAgKHByb3ZpZGVyLCBlbWFpbCwgc2NiLCBlY2IsIHNwZWMgPSAnbGVmdD0xLCB0b3A9MSwgd2lkdGg9NTAwLCBoZWlnaHQ9NTYwJykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBfX3NvY2lhbEF1dGhfXy5jYWxsKHRoaXMsIHByb3ZpZGVyLCB0cnVlLCBzcGVjLCBlbWFpbClcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgICByZXR1cm4gX19zaWduaW5XaXRoVG9rZW5fXy5jYWxsKHRoaXMsIHtcclxuICAgICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gIH0pO1xyXG5cclxufVxyXG5mdW5jdGlvbiBfX3NpZ25pbldpdGhUb2tlbl9fICh0b2tlbkRhdGEpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRhdGEgPSBbXTtcclxuICAgIGZvciAobGV0IG9iaiBpbiB0b2tlbkRhdGEpIHtcclxuICAgICAgICBkYXRhLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KG9iaikgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQodG9rZW5EYXRhW29ial0pKTtcclxuICAgIH1cclxuICAgIGRhdGEgPSBkYXRhLmpvaW4oXCImXCIpO1xyXG5cclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYCR7ZGF0YX0mYXBwTmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JmdyYW50X3R5cGU9cGFzc3dvcmRgXHJcbiAgICB9KVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0KCd1c2VyJywge1xyXG4gICAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW59YFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZGV0YWlsczogcmVzcG9uc2UuZGF0YVxyXG4gICAgICB9KTtcclxuICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05JTik7XHJcbiAgICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgICB0aGlzLnNvY2tldC5jb25uZWN0KHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbi5BdXRob3JpemF0aW9uLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RSZXNldFBhc3N3b3JkICh1c2VybmFtZSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXF1ZXN0UmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGFwcE5hbWU6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgICAgdXNlcm5hbWVcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRQYXNzd29yZCAobmV3UGFzc3dvcmQsIHJlc2V0VG9rZW4sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMucmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG5ld1Bhc3N3b3JkLFxyXG4gICAgICAgIHJlc2V0VG9rZW5cclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY2hhbmdlUGFzc3dvcmQgKG9sZFBhc3N3b3JkLCBuZXdQYXNzd29yZCwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5jaGFuZ2VQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG9sZFBhc3N3b3JkLFxyXG4gICAgICAgIG5ld1Bhc3N3b3JkXHJcbiAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25vdXQgKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLnN0b3JhZ2UucmVtb3ZlKCd1c2VyJyk7XHJcbiAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmRpc2Nvbm5lY3QoKTtcclxuICAgIH1cclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOT1VUKTtcclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKSkpO1xyXG4gICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdGhpcy5zdG9yYWdlLmdldCgndXNlcicpKSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18gKCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlcikge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdXNlci5kZXRhaWxzKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFVzZXJEZXRhaWxzKHNjYiwgZWNiLCBmb3JjZSA9IGZhbHNlKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGlmIChmb3JjZSkge1xyXG4gICAgICB0aGlzLmh0dHAoe1xyXG4gICAgICAgIHVybDogVVJMUy5wcm9maWxlLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgICAgICBsZXQgbmV3RGV0YWlscyA9IHJlc3BvbnNlLmRhdGE7XHJcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICAgIHRva2VuOiB1c2VyLnRva2VuLFxyXG4gICAgICAgICAgZGV0YWlsczogT2JqZWN0LmFzc2lnbih7fSwgdXNlci5kZXRhaWxzLCBuZXdEZXRhaWxzKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXy5jYWxsKHRoaXMpO1xyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18uY2FsbCh0aGlzKVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5mdW5jdGlvbiBfX2FsbG93ZWRQYXJhbXNfXyAoYWxsb3dlZFBhcmFtcywgcGFyYW1zKSB7XHJcbiAgbGV0IG5ld1BhcmFtcyA9IHt9O1xyXG4gIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xyXG4gICAgaWYgKGFsbG93ZWRQYXJhbXMuaW5kZXhPZihwYXJhbSkgIT0gLTEpIHtcclxuICAgICAgbmV3UGFyYW1zW3BhcmFtXSA9IHBhcmFtc1twYXJhbV07XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBuZXdQYXJhbXM7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3QgKG9iamVjdCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncGFnZVNpemUnLCdwYWdlTnVtYmVyJywnZmlsdGVyJywnc29ydCcsJ3NlYXJjaCcsJ2V4Y2x1ZGUnLCdkZWVwJywncmVsYXRlZE9iamVjdHMnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlIChvYmplY3QsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRPbmUgKG9iamVjdCwgaWQsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ2RlZXAnLCdleGNsdWRlJywnbGV2ZWwnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlIChvYmplY3QsIGlkLCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICBjb25zdCBhbGxvd2VkUGFyYW1zID0gWydyZXR1cm5PYmplY3QnLCdkZWVwJ107XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgaWQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ0RFTEVURScsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIgKG9iamVjdCwgZmlsZUFjdGlvbiwgZGF0YSA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbiIsImltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkRmlsZSAob2JqZWN0LCBmaWxlQWN0aW9uLCBmaWxlbmFtZSwgZmlsZWRhdGEsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHtmaWxlQWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgICBmaWxlZGF0YTogZmlsZWRhdGEuc3Vic3RyKGZpbGVkYXRhLmluZGV4T2YoJywnKSArIDEsIGZpbGVkYXRhLmxlbmd0aClcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVGaWxlIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcblxyXG5jbGFzcyBIdHRwIHtcclxuICBjb25zdHJ1Y3RvciAoY29uZmlnID0ge30pIHtcclxuICAgIGlmICghd2luZG93LlhNTEh0dHBSZXF1ZXN0KVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1hNTEh0dHBSZXF1ZXN0IGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG5cclxuICAgIHRoaXMuY29uZmlnID0gT2JqZWN0LmFzc2lnbih7XHJcbiAgICAgIC8vIHVybDogJy8nLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBoZWFkZXJzOiB7fSxcclxuICAgICAgcGFyYW1zOiB7fSxcclxuICAgICAgaW50ZXJjZXB0b3JzOiB7fSxcclxuICAgICAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcclxuICAgICAgcmVzcG9uc2VUeXBlOiAnanNvbicsXHJcbiAgICAgIC8vIHRpbWVvdXQ6IG51bGwsXHJcbiAgICAgIGF1dGg6IHtcclxuICAgICAgIHVzZXJuYW1lOiBudWxsLFxyXG4gICAgICAgcGFzc3dvcmQ6IG51bGxcclxuICAgICAgfVxyXG4gICAgfSwgY29uZmlnKVxyXG4gIH1cclxuICBfZ2V0SGVhZGVycyAoaGVhZGVycykge1xyXG4gICAgcmV0dXJuIGhlYWRlcnMuc3BsaXQoJ1xcclxcbicpLmZpbHRlcihoZWFkZXIgPT4gaGVhZGVyKS5tYXAoaGVhZGVyID0+IHtcclxuICAgICAgbGV0IGpoZWFkZXIgPSB7fVxyXG4gICAgICBsZXQgcGFydHMgPSBoZWFkZXIuc3BsaXQoJzonKTtcclxuICAgICAgamhlYWRlcltwYXJ0c1swXV0gPSBwYXJ0c1sxXVxyXG4gICAgICByZXR1cm4gamhlYWRlcjtcclxuICAgIH0pO1xyXG4gIH1cclxuICBfZ2V0RGF0YSAodHlwZSwgZGF0YSkge1xyXG4gICAgaWYgKCF0eXBlKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodHlwZS5pbmRleE9mKCdqc29uJykgPT09IC0xKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gICAgfVxyXG4gIH1cclxuICBfY3JlYXRlUmVzcG9uc2UgKHJlcSwgY29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXM6IHJlcS5zdGF0dXMsXHJcbiAgICAgIHN0YXR1c1RleHQ6IHJlcS5zdGF0dXNUZXh0LFxyXG4gICAgICBoZWFkZXJzOiB0aGlzLl9nZXRIZWFkZXJzKHJlcS5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSksXHJcbiAgICAgIGNvbmZpZyxcclxuICAgICAgZGF0YTogdGhpcy5fZ2V0RGF0YShyZXEuZ2V0UmVzcG9uc2VIZWFkZXIoXCJDb250ZW50LVR5cGVcIiksIHJlcS5yZXNwb25zZVRleHQpLFxyXG4gICAgfVxyXG4gIH1cclxuICBfaGFuZGxlRXJyb3IgKGRhdGEsIGNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiAwLFxyXG4gICAgICBzdGF0dXNUZXh0OiAnRVJST1InLFxyXG4gICAgICBoZWFkZXJzOiBbXSxcclxuICAgICAgY29uZmlnLFxyXG4gICAgICBkYXRhLFxyXG4gICAgfVxyXG4gIH1cclxuICBfZW5jb2RlUGFyYW1zIChwYXJhbXMpIHtcclxuICAgIGxldCBwYXJhbXNBcnIgPSBbXTtcclxuICAgIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1twYXJhbV07XG4gICAgICBpZiAodHlwZW9mIHZhbCA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICB2YWwgPSBKU09OLnN0cmluZ2lmeSh2YWwpO1xyXG4gICAgICB9XHJcbiAgICAgIHBhcmFtc0Fyci5wdXNoKGAke3BhcmFtfT0ke2VuY29kZVVSSUNvbXBvbmVudCh2YWwpfWApXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFyYW1zQXJyLmpvaW4oJyYnKTtcclxuICB9XHJcbiAgX3NldEhlYWRlcnMgKHJlcSwgaGVhZGVycykge1xyXG4gICAgZm9yIChsZXQgaGVhZGVyIGluIGhlYWRlcnMpIHtcclxuICAgICAgcmVxLnNldFJlcXVlc3RIZWFkZXIoaGVhZGVyLCBoZWFkZXJzW2hlYWRlcl0pO1xyXG4gICAgfVxyXG4gIH1cclxuICBfc2V0RGF0YSAocmVxLCBkYXRhKSB7XHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgcmVxLnNlbmQoKTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHR5cGVvZiBkYXRhICE9ICdvYmplY3QnKSB7XHJcbiAgICAgIHJlcS5zZW5kKGRhdGEpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJlcS5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvbjtjaGFyc2V0PVVURi04XCIpO1xyXG4gICAgICByZXEuc2VuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJlcXVlc3QgKGNmZywgc2NiICwgZWNiKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cclxuICAgICAgbGV0IHJlcSA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgICBsZXQgY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb25maWcsIGNmZyk7XHJcblxyXG4gICAgICBpZiAoIWNvbmZpZy51cmwgfHwgdHlwZW9mIGNvbmZpZy51cmwgIT09ICdzdHJpbmcnIHx8IGNvbmZpZy51cmwubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2hhbmRsZUVycm9yKCd1cmwgcGFyYW1ldGVyIGlzIG1pc3NpbmcnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY29uZmlnLndpdGhDcmVkZW50aWFscykgeyByZXEud2l0aENyZWRlbnRpYWxzID0gdHJ1ZSB9XHJcbiAgICAgIGlmIChjb25maWcudGltZW91dCkgeyByZXEudGltZW91dCA9IHRydWUgfVxyXG4gICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlcXVlc3QgJiYgY29uZmlnLmludGVyY2VwdG9ycy5yZXF1ZXN0LmNhbGwodGhpcywgY29uZmlnKTtcclxuICAgICAgbGV0IHBhcmFtcyA9IHRoaXMuX2VuY29kZVBhcmFtcyhjb25maWcucGFyYW1zKTtcclxuICAgICAgcmVxLm9wZW4oY29uZmlnLm1ldGhvZCwgYCR7Y29uZmlnLmJhc2VVUkwgPyBjb25maWcuYmFzZVVSTCsnLycgOiAnJ30ke2NvbmZpZy51cmx9JHtwYXJhbXMgPyAnPycrcGFyYW1zIDogJyd9YCwgdHJ1ZSwgY29uZmlnLmF1dGgudXNlcm5hbWUsIGNvbmZpZy5hdXRoLnBhc3N3b3JkKTtcclxuICAgICAgcmVxLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcigndGltZW91dCcsIGNvbmZpZyk7XHJcbiAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9O1xyXG4gICAgICByZXEub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcignYWJvcnQnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfTtcclxuICAgICAgcmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9ICgpID0+IHtcclxuICAgICAgICBpZiAocmVxLnJlYWR5U3RhdGUgPT0gWE1MSHR0cFJlcXVlc3QuRE9ORSkge1xyXG4gICAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2NyZWF0ZVJlc3BvbnNlKHJlcSwgY29uZmlnKTtcclxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzID09PSAyMDApe1xyXG4gICAgICAgICAgICBpZiAoY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2UuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgc2NiICYmIHNjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlc29sdmUocmVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IpIHtcclxuICAgICAgICAgICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuX3NldEhlYWRlcnMocmVxLCBjb25maWcuaGVhZGVycyk7XHJcbiAgICAgIHRoaXMuX3NldERhdGEocmVxLCBjb25maWcuZGF0YSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG59XHJcbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlKGNvbmZpZyA9IHt9KSB7XHJcbiAgdmFyIGNvbnRleHQgPSBuZXcgSHR0cChjb25maWcpO1xyXG4gIHZhciBpbnN0YW5jZSA9ICguLi5hcmdzKSA9PiBIdHRwLnByb3RvdHlwZS5yZXF1ZXN0LmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xyXG4gIGluc3RhbmNlLmNvbmZpZyA9IGNvbnRleHQuY29uZmlnO1xyXG4gIHJldHVybiBpbnN0YW5jZTtcclxufVxyXG5cclxudmFyIGh0dHAgPSBjcmVhdGVJbnN0YW5jZSgpO1xyXG5odHRwLmNyZWF0ZSA9IChjb25maWcpID0+IHtcclxuICByZXR1cm4gY3JlYXRlSW5zdGFuY2UoY29uZmlnKTtcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGh0dHA7XHJcbndpbmRvdy5odHRwID0gd2luZG93Lmh0dHAgfHwgaHR0cDtcclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU29ja2V0IHtcclxuICBjb25zdHJ1Y3RvciAodXJsKSB7XHJcbiAgICBpZiAoIXdpbmRvdy5pbylcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdydW5Tb2NrZXQgaXMgdHJ1ZSBidXQgc29ja2V0aW8tY2xpZW50IGlzIG5vdCBpbmNsdWRlZCcpO1xyXG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5vbkFyciA9IFtdO1xuICAgIHRoaXMuc29ja2V0ID0gbnVsbDtcbiAgfVxyXG4gIG9uIChldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLm9uQXJyLnB1c2goe2V2ZW50TmFtZSwgY2FsbGJhY2t9KTtcclxuICB9XHJcbiAgY29ubmVjdCAodG9rZW4sIGFub255bW91c1Rva2VuLCBhcHBOYW1lKSB7XHJcbiAgICB0aGlzLmRpc2Nvbm5lY3QoKTtcclxuICAgIHRoaXMuc29ja2V0ID0gaW8uY29ubmVjdCh0aGlzLnVybCwgeydmb3JjZU5ldyc6dHJ1ZSB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignY29ubmVjdCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGB0cnlpbmcgdG8gZXN0YWJsaXNoIGEgc29ja2V0IGNvbm5lY3Rpb24gdG8gJHthcHBOYW1lfSAuLi5gKTtcclxuICAgICAgdGhpcy5zb2NrZXQuZW1pdChcImxvZ2luXCIsIHRva2VuLCBhbm9ueW1vdXNUb2tlbiwgYXBwTmFtZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignYXV0aG9yaXplZCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgY29ubmVjdGVkYCk7XHJcbiAgICAgIHRoaXMub25BcnIuZm9yRWFjaChmbiA9PiB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQub24oZm4uZXZlbnROYW1lLCBkYXRhID0+IHtcclxuICAgICAgICAgIGZuLmNhbGxiYWNrKGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdub3RBdXRob3JpemVkJywgKCkgPT4ge1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZGlzY29ubmVjdCgpLCAxMDAwKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCBkaXNjb25uZWN0YCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbigncmVjb25uZWN0aW5nJywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCByZWNvbm5lY3RpbmdgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLndhcm4oYGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGRpc2Nvbm5lY3QgKCkge1xyXG4gICAgaWYgKHRoaXMuc29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFN0b3JhZ2Uge1xyXG4gIGNvbnN0cnVjdG9yIChzdG9yYWdlLCBwcmVmaXggPSAnJykge1xyXG4gICAgaWYgKCFzdG9yYWdlKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG4gICAgaWYgKCFzdG9yYWdlLnNldEl0ZW0gfHwgIXN0b3JhZ2UuZ2V0SXRlbSB8fCAhc3RvcmFnZS5yZW1vdmVJdGVtIHx8ICFzdG9yYWdlLmNsZWFyKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIG5vdCBpbXBsZW1lbnQgdGhlIG5lY2Vzc2FyeSBmdW5jdGlvbnMnKTtcclxuICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XHJcbiAgICB0aGlzLnByZWZpeCA9IHByZWZpeDtcclxuICAgIHRoaXMuZGVsaW1pdGVyID0gJ19fX19fX19fX18nO1xyXG4gIH1cclxuICBnZXQgKGtleSkge1xyXG4gICAgbGV0IGl0ZW0gPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICAgIGlmICghaXRlbSkge1xyXG4gICAgICByZXR1cm4gaXRlbVxyXG4gICAgfVxyXG4gICAgZWxzZSB7XG4gICAgICBsZXQgW3R5cGUsIHZhbF0gPSBpdGVtLnNwbGl0KHRoaXMuZGVsaW1pdGVyKTtcbiAgICAgIGlmICh0eXBlICE9ICdKU09OJykge1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbCk7XG4gICAgICB9XG4gICAgfVxyXG4gIH1cclxuICBzZXQgKGtleSwgdmFsKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbCAhPSAnb2JqZWN0Jykge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgU1RSSU5HJHt0aGlzLmRlbGltaXRlcn0ke3ZhbH1gKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgSlNPTiR7dGhpcy5kZWxpbWl0ZXJ9JHtKU09OLnN0cmluZ2lmeSh2YWwpfWApO1xyXG4gICAgfVxyXG4gIH1cclxuICByZW1vdmUgKGtleSkge1xyXG4gICAgdGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oYCR7dGhpcy5wcmVmaXh9JHtrZXl9YCk7XHJcbiAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIGZvcih2YXIgaSA9MDsgaSA8IHRoaXMuc3RvcmFnZS5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICBpZih0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2Uua2V5KGkpKS5pbmRleE9mKHRoaXMucHJlZml4KSAhPSAtMSlcclxuICAgICAgICB0aGlzLnJlbW92ZSh0aGlzLnN0b3JhZ2Uua2V5KGkpKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXX0=
