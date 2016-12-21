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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGNydWQuanMiLCJzcmNcXHNlcnZpY2VzXFxmaWxlcy5qcyIsInNyY1xcdXRpbHNcXGh0dHAuanMiLCJzcmNcXHV0aWxzXFxzb2NrZXQuanMiLCJzcmNcXHV0aWxzXFxzdG9yYWdlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwb0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDcExPLElBQU0sMEJBQVM7QUFDcEIsVUFBUSxRQURZO0FBRXBCLFdBQVMsU0FGVztBQUdwQixVQUFRO0FBSFksQ0FBZjs7QUFNQSxJQUFNLHNCQUFPO0FBQ2xCLFNBQU8sT0FEVztB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Q0FBakIsQ0FBckIsRUFBMEMsT0FBMUMsQ0FBa0QsS0FBSyxNQUF2RCxLQUFrRSxDQUFDLENBQXRFLEVBQ0MsS0FBSyxNQUFMLENBQVksS0FBSyxPQUFMLENBQWEsR0FBYixDQUFpQixDQUFqQixDQUFaO0FBQ0g7QUFDRjs7Ozs7O2tCQXpDa0IsTyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKiFcbiAqIEBvdmVydmlldyBlczYtcHJvbWlzZSAtIGEgdGlueSBpbXBsZW1lbnRhdGlvbiBvZiBQcm9taXNlcy9BKy5cbiAqIEBjb3B5cmlnaHQgQ29weXJpZ2h0IChjKSAyMDE0IFllaHVkYSBLYXR6LCBUb20gRGFsZSwgU3RlZmFuIFBlbm5lciBhbmQgY29udHJpYnV0b3JzIChDb252ZXJzaW9uIHRvIEVTNiBBUEkgYnkgSmFrZSBBcmNoaWJhbGQpXG4gKiBAbGljZW5zZSAgIExpY2Vuc2VkIHVuZGVyIE1JVCBsaWNlbnNlXG4gKiAgICAgICAgICAgIFNlZSBodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vc3RlZmFucGVubmVyL2VzNi1wcm9taXNlL21hc3Rlci9MSUNFTlNFXG4gKiBAdmVyc2lvbiAgIDQuMC41XG4gKi9cblxuKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcbiAgICB0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKSA6XG4gICAgdHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kID8gZGVmaW5lKGZhY3RvcnkpIDpcbiAgICAoZ2xvYmFsLkVTNlByb21pc2UgPSBmYWN0b3J5KCkpO1xufSh0aGlzLCAoZnVuY3Rpb24gKCkgeyAndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIG9iamVjdE9yRnVuY3Rpb24oeCkge1xuICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgfHwgdHlwZW9mIHggPT09ICdvYmplY3QnICYmIHggIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oeCkge1xuICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbic7XG59XG5cbnZhciBfaXNBcnJheSA9IHVuZGVmaW5lZDtcbmlmICghQXJyYXkuaXNBcnJheSkge1xuICBfaXNBcnJheSA9IGZ1bmN0aW9uICh4KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4KSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcbn0gZWxzZSB7XG4gIF9pc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcbn1cblxudmFyIGlzQXJyYXkgPSBfaXNBcnJheTtcblxudmFyIGxlbiA9IDA7XG52YXIgdmVydHhOZXh0ID0gdW5kZWZpbmVkO1xudmFyIGN1c3RvbVNjaGVkdWxlckZuID0gdW5kZWZpbmVkO1xuXG52YXIgYXNhcCA9IGZ1bmN0aW9uIGFzYXAoY2FsbGJhY2ssIGFyZykge1xuICBxdWV1ZVtsZW5dID0gY2FsbGJhY2s7XG4gIHF1ZXVlW2xlbiArIDFdID0gYXJnO1xuICBsZW4gKz0gMjtcbiAgaWYgKGxlbiA9PT0gMikge1xuICAgIC8vIElmIGxlbiBpcyAyLCB0aGF0IG1lYW5zIHRoYXQgd2UgbmVlZCB0byBzY2hlZHVsZSBhbiBhc3luYyBmbHVzaC5cbiAgICAvLyBJZiBhZGRpdGlvbmFsIGNhbGxiYWNrcyBhcmUgcXVldWVkIGJlZm9yZSB0aGUgcXVldWUgaXMgZmx1c2hlZCwgdGhleVxuICAgIC8vIHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoaXMgZmx1c2ggdGhhdCB3ZSBhcmUgc2NoZWR1bGluZy5cbiAgICBpZiAoY3VzdG9tU2NoZWR1bGVyRm4pIHtcbiAgICAgIGN1c3RvbVNjaGVkdWxlckZuKGZsdXNoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZWR1bGVGbHVzaCgpO1xuICAgIH1cbiAgfVxufTtcblxuZnVuY3Rpb24gc2V0U2NoZWR1bGVyKHNjaGVkdWxlRm4pIHtcbiAgY3VzdG9tU2NoZWR1bGVyRm4gPSBzY2hlZHVsZUZuO1xufVxuXG5mdW5jdGlvbiBzZXRBc2FwKGFzYXBGbikge1xuICBhc2FwID0gYXNhcEZuO1xufVxuXG52YXIgYnJvd3NlcldpbmRvdyA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogdW5kZWZpbmVkO1xudmFyIGJyb3dzZXJHbG9iYWwgPSBicm93c2VyV2luZG93IHx8IHt9O1xudmFyIEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyID0gYnJvd3Nlckdsb2JhbC5NdXRhdGlvbk9ic2VydmVyIHx8IGJyb3dzZXJHbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjtcbnZhciBpc05vZGUgPSB0eXBlb2Ygc2VsZiA9PT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHByb2Nlc3MgIT09ICd1bmRlZmluZWQnICYmICh7fSkudG9TdHJpbmcuY2FsbChwcm9jZXNzKSA9PT0gJ1tvYmplY3QgcHJvY2Vzc10nO1xuXG4vLyB0ZXN0IGZvciB3ZWIgd29ya2VyIGJ1dCBub3QgaW4gSUUxMFxudmFyIGlzV29ya2VyID0gdHlwZW9mIFVpbnQ4Q2xhbXBlZEFycmF5ICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgaW1wb3J0U2NyaXB0cyAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIE1lc3NhZ2VDaGFubmVsICE9PSAndW5kZWZpbmVkJztcblxuLy8gbm9kZVxuZnVuY3Rpb24gdXNlTmV4dFRpY2soKSB7XG4gIC8vIG5vZGUgdmVyc2lvbiAwLjEwLnggZGlzcGxheXMgYSBkZXByZWNhdGlvbiB3YXJuaW5nIHdoZW4gbmV4dFRpY2sgaXMgdXNlZCByZWN1cnNpdmVseVxuICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2N1am9qcy93aGVuL2lzc3Vlcy80MTAgZm9yIGRldGFpbHNcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gcHJvY2Vzcy5uZXh0VGljayhmbHVzaCk7XG4gIH07XG59XG5cbi8vIHZlcnR4XG5mdW5jdGlvbiB1c2VWZXJ0eFRpbWVyKCkge1xuICBpZiAodHlwZW9mIHZlcnR4TmV4dCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmVydHhOZXh0KGZsdXNoKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHVzZVNldFRpbWVvdXQoKTtcbn1cblxuZnVuY3Rpb24gdXNlTXV0YXRpb25PYnNlcnZlcigpIHtcbiAgdmFyIGl0ZXJhdGlvbnMgPSAwO1xuICB2YXIgb2JzZXJ2ZXIgPSBuZXcgQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIoZmx1c2gpO1xuICB2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcbiAgb2JzZXJ2ZXIub2JzZXJ2ZShub2RlLCB7IGNoYXJhY3RlckRhdGE6IHRydWUgfSk7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICBub2RlLmRhdGEgPSBpdGVyYXRpb25zID0gKytpdGVyYXRpb25zICUgMjtcbiAgfTtcbn1cblxuLy8gd2ViIHdvcmtlclxuZnVuY3Rpb24gdXNlTWVzc2FnZUNoYW5uZWwoKSB7XG4gIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZmx1c2g7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGNoYW5uZWwucG9ydDIucG9zdE1lc3NhZ2UoMCk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZVNldFRpbWVvdXQoKSB7XG4gIC8vIFN0b3JlIHNldFRpbWVvdXQgcmVmZXJlbmNlIHNvIGVzNi1wcm9taXNlIHdpbGwgYmUgdW5hZmZlY3RlZCBieVxuICAvLyBvdGhlciBjb2RlIG1vZGlmeWluZyBzZXRUaW1lb3V0IChsaWtlIHNpbm9uLnVzZUZha2VUaW1lcnMoKSlcbiAgdmFyIGdsb2JhbFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBnbG9iYWxTZXRUaW1lb3V0KGZsdXNoLCAxKTtcbiAgfTtcbn1cblxudmFyIHF1ZXVlID0gbmV3IEFycmF5KDEwMDApO1xuZnVuY3Rpb24gZmx1c2goKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpICs9IDIpIHtcbiAgICB2YXIgY2FsbGJhY2sgPSBxdWV1ZVtpXTtcbiAgICB2YXIgYXJnID0gcXVldWVbaSArIDFdO1xuXG4gICAgY2FsbGJhY2soYXJnKTtcblxuICAgIHF1ZXVlW2ldID0gdW5kZWZpbmVkO1xuICAgIHF1ZXVlW2kgKyAxXSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGxlbiA9IDA7XG59XG5cbmZ1bmN0aW9uIGF0dGVtcHRWZXJ0eCgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgciA9IHJlcXVpcmU7XG4gICAgdmFyIHZlcnR4ID0gcigndmVydHgnKTtcbiAgICB2ZXJ0eE5leHQgPSB2ZXJ0eC5ydW5Pbkxvb3AgfHwgdmVydHgucnVuT25Db250ZXh0O1xuICAgIHJldHVybiB1c2VWZXJ0eFRpbWVyKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gdXNlU2V0VGltZW91dCgpO1xuICB9XG59XG5cbnZhciBzY2hlZHVsZUZsdXNoID0gdW5kZWZpbmVkO1xuLy8gRGVjaWRlIHdoYXQgYXN5bmMgbWV0aG9kIHRvIHVzZSB0byB0cmlnZ2VyaW5nIHByb2Nlc3Npbmcgb2YgcXVldWVkIGNhbGxiYWNrczpcbmlmIChpc05vZGUpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU5leHRUaWNrKCk7XG59IGVsc2UgaWYgKEJyb3dzZXJNdXRhdGlvbk9ic2VydmVyKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VNdXRhdGlvbk9ic2VydmVyKCk7XG59IGVsc2UgaWYgKGlzV29ya2VyKSB7XG4gIHNjaGVkdWxlRmx1c2ggPSB1c2VNZXNzYWdlQ2hhbm5lbCgpO1xufSBlbHNlIGlmIChicm93c2VyV2luZG93ID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIHJlcXVpcmUgPT09ICdmdW5jdGlvbicpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IGF0dGVtcHRWZXJ0eCgpO1xufSBlbHNlIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZVNldFRpbWVvdXQoKTtcbn1cblxuZnVuY3Rpb24gdGhlbihvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICB2YXIgX2FyZ3VtZW50cyA9IGFyZ3VtZW50cztcblxuICB2YXIgcGFyZW50ID0gdGhpcztcblxuICB2YXIgY2hpbGQgPSBuZXcgdGhpcy5jb25zdHJ1Y3Rvcihub29wKTtcblxuICBpZiAoY2hpbGRbUFJPTUlTRV9JRF0gPT09IHVuZGVmaW5lZCkge1xuICAgIG1ha2VQcm9taXNlKGNoaWxkKTtcbiAgfVxuXG4gIHZhciBfc3RhdGUgPSBwYXJlbnQuX3N0YXRlO1xuXG4gIGlmIChfc3RhdGUpIHtcbiAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGNhbGxiYWNrID0gX2FyZ3VtZW50c1tfc3RhdGUgLSAxXTtcbiAgICAgIGFzYXAoZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gaW52b2tlQ2FsbGJhY2soX3N0YXRlLCBjaGlsZCwgY2FsbGJhY2ssIHBhcmVudC5fcmVzdWx0KTtcbiAgICAgIH0pO1xuICAgIH0pKCk7XG4gIH0gZWxzZSB7XG4gICAgc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKTtcbiAgfVxuXG4gIHJldHVybiBjaGlsZDtcbn1cblxuLyoqXG4gIGBQcm9taXNlLnJlc29sdmVgIHJldHVybnMgYSBwcm9taXNlIHRoYXQgd2lsbCBiZWNvbWUgcmVzb2x2ZWQgd2l0aCB0aGVcbiAgcGFzc2VkIGB2YWx1ZWAuIEl0IGlzIHNob3J0aGFuZCBmb3IgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICByZXNvbHZlKDEpO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIHZhbHVlID09PSAxXG4gIH0pO1xuICBgYGBcblxuICBJbnN0ZWFkIG9mIHdyaXRpbmcgdGhlIGFib3ZlLCB5b3VyIGNvZGUgbm93IHNpbXBseSBiZWNvbWVzIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgxKTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIHZhbHVlID09PSAxXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIHJlc29sdmVcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FueX0gdmFsdWUgdmFsdWUgdGhhdCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlc29sdmVkIHdpdGhcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCB3aWxsIGJlY29tZSBmdWxmaWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAgYHZhbHVlYFxuKi9cbmZ1bmN0aW9uIHJlc29sdmUob2JqZWN0KSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG5cbiAgaWYgKG9iamVjdCAmJiB0eXBlb2Ygb2JqZWN0ID09PSAnb2JqZWN0JyAmJiBvYmplY3QuY29uc3RydWN0b3IgPT09IENvbnN0cnVjdG9yKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuICBfcmVzb2x2ZShwcm9taXNlLCBvYmplY3QpO1xuICByZXR1cm4gcHJvbWlzZTtcbn1cblxudmFyIFBST01JU0VfSUQgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoMTYpO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxudmFyIFBFTkRJTkcgPSB2b2lkIDA7XG52YXIgRlVMRklMTEVEID0gMTtcbnZhciBSRUpFQ1RFRCA9IDI7XG5cbnZhciBHRVRfVEhFTl9FUlJPUiA9IG5ldyBFcnJvck9iamVjdCgpO1xuXG5mdW5jdGlvbiBzZWxmRnVsZmlsbG1lbnQoKSB7XG4gIHJldHVybiBuZXcgVHlwZUVycm9yKFwiWW91IGNhbm5vdCByZXNvbHZlIGEgcHJvbWlzZSB3aXRoIGl0c2VsZlwiKTtcbn1cblxuZnVuY3Rpb24gY2Fubm90UmV0dXJuT3duKCkge1xuICByZXR1cm4gbmV3IFR5cGVFcnJvcignQSBwcm9taXNlcyBjYWxsYmFjayBjYW5ub3QgcmV0dXJuIHRoYXQgc2FtZSBwcm9taXNlLicpO1xufVxuXG5mdW5jdGlvbiBnZXRUaGVuKHByb21pc2UpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gcHJvbWlzZS50aGVuO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIEdFVF9USEVOX0VSUk9SLmVycm9yID0gZXJyb3I7XG4gICAgcmV0dXJuIEdFVF9USEVOX0VSUk9SO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRyeVRoZW4odGhlbiwgdmFsdWUsIGZ1bGZpbGxtZW50SGFuZGxlciwgcmVqZWN0aW9uSGFuZGxlcikge1xuICB0cnkge1xuICAgIHRoZW4uY2FsbCh2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSwgdGhlbikge1xuICBhc2FwKGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgdmFyIHNlYWxlZCA9IGZhbHNlO1xuICAgIHZhciBlcnJvciA9IHRyeVRoZW4odGhlbiwgdGhlbmFibGUsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgaWYgKHNlYWxlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzZWFsZWQgPSB0cnVlO1xuICAgICAgaWYgKHRoZW5hYmxlICE9PSB2YWx1ZSkge1xuICAgICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICBpZiAoc2VhbGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlYWxlZCA9IHRydWU7XG5cbiAgICAgIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9LCAnU2V0dGxlOiAnICsgKHByb21pc2UuX2xhYmVsIHx8ICcgdW5rbm93biBwcm9taXNlJykpO1xuXG4gICAgaWYgKCFzZWFsZWQgJiYgZXJyb3IpIHtcbiAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICB9XG4gIH0sIHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCB0aGVuYWJsZSkge1xuICBpZiAodGhlbmFibGUuX3N0YXRlID09PSBGVUxGSUxMRUQpIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICB9IGVsc2UgaWYgKHRoZW5hYmxlLl9zdGF0ZSA9PT0gUkVKRUNURUQpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIHRoZW5hYmxlLl9yZXN1bHQpO1xuICB9IGVsc2Uge1xuICAgIHN1YnNjcmliZSh0aGVuYWJsZSwgdW5kZWZpbmVkLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIHJldHVybiBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgcmV0dXJuIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4kJCkge1xuICBpZiAobWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3RvciA9PT0gcHJvbWlzZS5jb25zdHJ1Y3RvciAmJiB0aGVuJCQgPT09IHRoZW4gJiYgbWF5YmVUaGVuYWJsZS5jb25zdHJ1Y3Rvci5yZXNvbHZlID09PSByZXNvbHZlKSB7XG4gICAgaGFuZGxlT3duVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gIH0gZWxzZSB7XG4gICAgaWYgKHRoZW4kJCA9PT0gR0VUX1RIRU5fRVJST1IpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgR0VUX1RIRU5fRVJST1IuZXJyb3IpO1xuICAgIH0gZWxzZSBpZiAodGhlbiQkID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgfSBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoZW4kJCkpIHtcbiAgICAgIGhhbmRsZUZvcmVpZ25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlLCB0aGVuJCQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIG1heWJlVGhlbmFibGUpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSkge1xuICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICBfcmVqZWN0KHByb21pc2UsIHNlbGZGdWxmaWxsbWVudCgpKTtcbiAgfSBlbHNlIGlmIChvYmplY3RPckZ1bmN0aW9uKHZhbHVlKSkge1xuICAgIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgdmFsdWUsIGdldFRoZW4odmFsdWUpKTtcbiAgfSBlbHNlIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwdWJsaXNoUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgaWYgKHByb21pc2UuX29uZXJyb3IpIHtcbiAgICBwcm9taXNlLl9vbmVycm9yKHByb21pc2UuX3Jlc3VsdCk7XG4gIH1cblxuICBwdWJsaXNoKHByb21pc2UpO1xufVxuXG5mdW5jdGlvbiBmdWxmaWxsKHByb21pc2UsIHZhbHVlKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UuX3Jlc3VsdCA9IHZhbHVlO1xuICBwcm9taXNlLl9zdGF0ZSA9IEZVTEZJTExFRDtcblxuICBpZiAocHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoICE9PSAwKSB7XG4gICAgYXNhcChwdWJsaXNoLCBwcm9taXNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfcmVqZWN0KHByb21pc2UsIHJlYXNvbikge1xuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgcHJvbWlzZS5fc3RhdGUgPSBSRUpFQ1RFRDtcbiAgcHJvbWlzZS5fcmVzdWx0ID0gcmVhc29uO1xuXG4gIGFzYXAocHVibGlzaFJlamVjdGlvbiwgcHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIHN1YnNjcmliZShwYXJlbnQsIGNoaWxkLCBvbkZ1bGZpbGxtZW50LCBvblJlamVjdGlvbikge1xuICB2YXIgX3N1YnNjcmliZXJzID0gcGFyZW50Ll9zdWJzY3JpYmVycztcbiAgdmFyIGxlbmd0aCA9IF9zdWJzY3JpYmVycy5sZW5ndGg7XG5cbiAgcGFyZW50Ll9vbmVycm9yID0gbnVsbDtcblxuICBfc3Vic2NyaWJlcnNbbGVuZ3RoXSA9IGNoaWxkO1xuICBfc3Vic2NyaWJlcnNbbGVuZ3RoICsgRlVMRklMTEVEXSA9IG9uRnVsZmlsbG1lbnQ7XG4gIF9zdWJzY3JpYmVyc1tsZW5ndGggKyBSRUpFQ1RFRF0gPSBvblJlamVjdGlvbjtcblxuICBpZiAobGVuZ3RoID09PSAwICYmIHBhcmVudC5fc3RhdGUpIHtcbiAgICBhc2FwKHB1Ymxpc2gsIHBhcmVudCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHVibGlzaChwcm9taXNlKSB7XG4gIHZhciBzdWJzY3JpYmVycyA9IHByb21pc2UuX3N1YnNjcmliZXJzO1xuICB2YXIgc2V0dGxlZCA9IHByb21pc2UuX3N0YXRlO1xuXG4gIGlmIChzdWJzY3JpYmVycy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgY2hpbGQgPSB1bmRlZmluZWQsXG4gICAgICBjYWxsYmFjayA9IHVuZGVmaW5lZCxcbiAgICAgIGRldGFpbCA9IHByb21pc2UuX3Jlc3VsdDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN1YnNjcmliZXJzLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgY2hpbGQgPSBzdWJzY3JpYmVyc1tpXTtcbiAgICBjYWxsYmFjayA9IHN1YnNjcmliZXJzW2kgKyBzZXR0bGVkXTtcblxuICAgIGlmIChjaGlsZCkge1xuICAgICAgaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgY2hpbGQsIGNhbGxiYWNrLCBkZXRhaWwpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjYWxsYmFjayhkZXRhaWwpO1xuICAgIH1cbiAgfVxuXG4gIHByb21pc2UuX3N1YnNjcmliZXJzLmxlbmd0aCA9IDA7XG59XG5cbmZ1bmN0aW9uIEVycm9yT2JqZWN0KCkge1xuICB0aGlzLmVycm9yID0gbnVsbDtcbn1cblxudmFyIFRSWV9DQVRDSF9FUlJPUiA9IG5ldyBFcnJvck9iamVjdCgpO1xuXG5mdW5jdGlvbiB0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGNhbGxiYWNrKGRldGFpbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBUUllfQ0FUQ0hfRVJST1IuZXJyb3IgPSBlO1xuICAgIHJldHVybiBUUllfQ0FUQ0hfRVJST1I7XG4gIH1cbn1cblxuZnVuY3Rpb24gaW52b2tlQ2FsbGJhY2soc2V0dGxlZCwgcHJvbWlzZSwgY2FsbGJhY2ssIGRldGFpbCkge1xuICB2YXIgaGFzQ2FsbGJhY2sgPSBpc0Z1bmN0aW9uKGNhbGxiYWNrKSxcbiAgICAgIHZhbHVlID0gdW5kZWZpbmVkLFxuICAgICAgZXJyb3IgPSB1bmRlZmluZWQsXG4gICAgICBzdWNjZWVkZWQgPSB1bmRlZmluZWQsXG4gICAgICBmYWlsZWQgPSB1bmRlZmluZWQ7XG5cbiAgaWYgKGhhc0NhbGxiYWNrKSB7XG4gICAgdmFsdWUgPSB0cnlDYXRjaChjYWxsYmFjaywgZGV0YWlsKTtcblxuICAgIGlmICh2YWx1ZSA9PT0gVFJZX0NBVENIX0VSUk9SKSB7XG4gICAgICBmYWlsZWQgPSB0cnVlO1xuICAgICAgZXJyb3IgPSB2YWx1ZS5lcnJvcjtcbiAgICAgIHZhbHVlID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3VjY2VlZGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAocHJvbWlzZSA9PT0gdmFsdWUpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgY2Fubm90UmV0dXJuT3duKCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YWx1ZSA9IGRldGFpbDtcbiAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICB9XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgLy8gbm9vcFxuICB9IGVsc2UgaWYgKGhhc0NhbGxiYWNrICYmIHN1Y2NlZWRlZCkge1xuICAgICAgX3Jlc29sdmUocHJvbWlzZSwgdmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoZmFpbGVkKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIGVycm9yKTtcbiAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IEZVTEZJTExFRCkge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChzZXR0bGVkID09PSBSRUpFQ1RFRCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBpbml0aWFsaXplUHJvbWlzZShwcm9taXNlLCByZXNvbHZlcikge1xuICB0cnkge1xuICAgIHJlc29sdmVyKGZ1bmN0aW9uIHJlc29sdmVQcm9taXNlKHZhbHVlKSB7XG4gICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gcmVqZWN0UHJvbWlzZShyZWFzb24pIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgZSk7XG4gIH1cbn1cblxudmFyIGlkID0gMDtcbmZ1bmN0aW9uIG5leHRJZCgpIHtcbiAgcmV0dXJuIGlkKys7XG59XG5cbmZ1bmN0aW9uIG1ha2VQcm9taXNlKHByb21pc2UpIHtcbiAgcHJvbWlzZVtQUk9NSVNFX0lEXSA9IGlkKys7XG4gIHByb21pc2UuX3N0YXRlID0gdW5kZWZpbmVkO1xuICBwcm9taXNlLl9yZXN1bHQgPSB1bmRlZmluZWQ7XG4gIHByb21pc2UuX3N1YnNjcmliZXJzID0gW107XG59XG5cbmZ1bmN0aW9uIEVudW1lcmF0b3IoQ29uc3RydWN0b3IsIGlucHV0KSB7XG4gIHRoaXMuX2luc3RhbmNlQ29uc3RydWN0b3IgPSBDb25zdHJ1Y3RvcjtcbiAgdGhpcy5wcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuXG4gIGlmICghdGhpcy5wcm9taXNlW1BST01JU0VfSURdKSB7XG4gICAgbWFrZVByb21pc2UodGhpcy5wcm9taXNlKTtcbiAgfVxuXG4gIGlmIChpc0FycmF5KGlucHV0KSkge1xuICAgIHRoaXMuX2lucHV0ID0gaW5wdXQ7XG4gICAgdGhpcy5sZW5ndGggPSBpbnB1dC5sZW5ndGg7XG4gICAgdGhpcy5fcmVtYWluaW5nID0gaW5wdXQubGVuZ3RoO1xuXG4gICAgdGhpcy5fcmVzdWx0ID0gbmV3IEFycmF5KHRoaXMubGVuZ3RoKTtcblxuICAgIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZnVsZmlsbCh0aGlzLnByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGVuZ3RoID0gdGhpcy5sZW5ndGggfHwgMDtcbiAgICAgIHRoaXMuX2VudW1lcmF0ZSgpO1xuICAgICAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgICAgICBmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgX3JlamVjdCh0aGlzLnByb21pc2UsIHZhbGlkYXRpb25FcnJvcigpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0aW9uRXJyb3IoKSB7XG4gIHJldHVybiBuZXcgRXJyb3IoJ0FycmF5IE1ldGhvZHMgbXVzdCBiZSBwcm92aWRlZCBhbiBBcnJheScpO1xufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX2VudW1lcmF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGxlbmd0aCA9IHRoaXMubGVuZ3RoO1xuICB2YXIgX2lucHV0ID0gdGhpcy5faW5wdXQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IHRoaXMuX3N0YXRlID09PSBQRU5ESU5HICYmIGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHRoaXMuX2VhY2hFbnRyeShfaW5wdXRbaV0sIGkpO1xuICB9XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fZWFjaEVudHJ5ID0gZnVuY3Rpb24gKGVudHJ5LCBpKSB7XG4gIHZhciBjID0gdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvcjtcbiAgdmFyIHJlc29sdmUkJCA9IGMucmVzb2x2ZTtcblxuICBpZiAocmVzb2x2ZSQkID09PSByZXNvbHZlKSB7XG4gICAgdmFyIF90aGVuID0gZ2V0VGhlbihlbnRyeSk7XG5cbiAgICBpZiAoX3RoZW4gPT09IHRoZW4gJiYgZW50cnkuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgICB0aGlzLl9zZXR0bGVkQXQoZW50cnkuX3N0YXRlLCBpLCBlbnRyeS5fcmVzdWx0KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBfdGhlbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhpcy5fcmVtYWluaW5nLS07XG4gICAgICB0aGlzLl9yZXN1bHRbaV0gPSBlbnRyeTtcbiAgICB9IGVsc2UgaWYgKGMgPT09IFByb21pc2UpIHtcbiAgICAgIHZhciBwcm9taXNlID0gbmV3IGMobm9vcCk7XG4gICAgICBoYW5kbGVNYXliZVRoZW5hYmxlKHByb21pc2UsIGVudHJ5LCBfdGhlbik7XG4gICAgICB0aGlzLl93aWxsU2V0dGxlQXQocHJvbWlzZSwgaSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChuZXcgYyhmdW5jdGlvbiAocmVzb2x2ZSQkKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlJCQoZW50cnkpO1xuICAgICAgfSksIGkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aGlzLl93aWxsU2V0dGxlQXQocmVzb2x2ZSQkKGVudHJ5KSwgaSk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9zZXR0bGVkQXQgPSBmdW5jdGlvbiAoc3RhdGUsIGksIHZhbHVlKSB7XG4gIHZhciBwcm9taXNlID0gdGhpcy5wcm9taXNlO1xuXG4gIGlmIChwcm9taXNlLl9zdGF0ZSA9PT0gUEVORElORykge1xuICAgIHRoaXMuX3JlbWFpbmluZy0tO1xuXG4gICAgaWYgKHN0YXRlID09PSBSRUpFQ1RFRCkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IHZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLl9yZW1haW5pbmcgPT09IDApIHtcbiAgICBmdWxmaWxsKHByb21pc2UsIHRoaXMuX3Jlc3VsdCk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl93aWxsU2V0dGxlQXQgPSBmdW5jdGlvbiAocHJvbWlzZSwgaSkge1xuICB2YXIgZW51bWVyYXRvciA9IHRoaXM7XG5cbiAgc3Vic2NyaWJlKHByb21pc2UsIHVuZGVmaW5lZCwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGVudW1lcmF0b3IuX3NldHRsZWRBdChGVUxGSUxMRUQsIGksIHZhbHVlKTtcbiAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgIHJldHVybiBlbnVtZXJhdG9yLl9zZXR0bGVkQXQoUkVKRUNURUQsIGksIHJlYXNvbik7XG4gIH0pO1xufTtcblxuLyoqXG4gIGBQcm9taXNlLmFsbGAgYWNjZXB0cyBhbiBhcnJheSBvZiBwcm9taXNlcywgYW5kIHJldHVybnMgYSBuZXcgcHJvbWlzZSB3aGljaFxuICBpcyBmdWxmaWxsZWQgd2l0aCBhbiBhcnJheSBvZiBmdWxmaWxsbWVudCB2YWx1ZXMgZm9yIHRoZSBwYXNzZWQgcHJvbWlzZXMsIG9yXG4gIHJlamVjdGVkIHdpdGggdGhlIHJlYXNvbiBvZiB0aGUgZmlyc3QgcGFzc2VkIHByb21pc2UgdG8gYmUgcmVqZWN0ZWQuIEl0IGNhc3RzIGFsbFxuICBlbGVtZW50cyBvZiB0aGUgcGFzc2VkIGl0ZXJhYmxlIHRvIHByb21pc2VzIGFzIGl0IHJ1bnMgdGhpcyBhbGdvcml0aG0uXG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IHJlc29sdmUoMSk7XG4gIGxldCBwcm9taXNlMiA9IHJlc29sdmUoMik7XG4gIGxldCBwcm9taXNlMyA9IHJlc29sdmUoMyk7XG4gIGxldCBwcm9taXNlcyA9IFsgcHJvbWlzZTEsIHByb21pc2UyLCBwcm9taXNlMyBdO1xuXG4gIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGZ1bmN0aW9uKGFycmF5KXtcbiAgICAvLyBUaGUgYXJyYXkgaGVyZSB3b3VsZCBiZSBbIDEsIDIsIDMgXTtcbiAgfSk7XG4gIGBgYFxuXG4gIElmIGFueSBvZiB0aGUgYHByb21pc2VzYCBnaXZlbiB0byBgYWxsYCBhcmUgcmVqZWN0ZWQsIHRoZSBmaXJzdCBwcm9taXNlXG4gIHRoYXQgaXMgcmVqZWN0ZWQgd2lsbCBiZSBnaXZlbiBhcyBhbiBhcmd1bWVudCB0byB0aGUgcmV0dXJuZWQgcHJvbWlzZXMnc1xuICByZWplY3Rpb24gaGFuZGxlci4gRm9yIGV4YW1wbGU6XG5cbiAgRXhhbXBsZTpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IHJlc29sdmUoMSk7XG4gIGxldCBwcm9taXNlMiA9IHJlamVjdChuZXcgRXJyb3IoXCIyXCIpKTtcbiAgbGV0IHByb21pc2UzID0gcmVqZWN0KG5ldyBFcnJvcihcIjNcIikpO1xuICBsZXQgcHJvbWlzZXMgPSBbIHByb21pc2UxLCBwcm9taXNlMiwgcHJvbWlzZTMgXTtcblxuICBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihmdW5jdGlvbihhcnJheSl7XG4gICAgLy8gQ29kZSBoZXJlIG5ldmVyIHJ1bnMgYmVjYXVzZSB0aGVyZSBhcmUgcmVqZWN0ZWQgcHJvbWlzZXMhXG4gIH0sIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgLy8gZXJyb3IubWVzc2FnZSA9PT0gXCIyXCJcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgYWxsXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBcnJheX0gZW50cmllcyBhcnJheSBvZiBwcm9taXNlc1xuICBAcGFyYW0ge1N0cmluZ30gbGFiZWwgb3B0aW9uYWwgc3RyaW5nIGZvciBsYWJlbGluZyB0aGUgcHJvbWlzZS5cbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBwcm9taXNlIHRoYXQgaXMgZnVsZmlsbGVkIHdoZW4gYWxsIGBwcm9taXNlc2AgaGF2ZSBiZWVuXG4gIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQgaWYgYW55IG9mIHRoZW0gYmVjb21lIHJlamVjdGVkLlxuICBAc3RhdGljXG4qL1xuZnVuY3Rpb24gYWxsKGVudHJpZXMpIHtcbiAgcmV0dXJuIG5ldyBFbnVtZXJhdG9yKHRoaXMsIGVudHJpZXMpLnByb21pc2U7XG59XG5cbi8qKlxuICBgUHJvbWlzZS5yYWNlYCByZXR1cm5zIGEgbmV3IHByb21pc2Ugd2hpY2ggaXMgc2V0dGxlZCBpbiB0aGUgc2FtZSB3YXkgYXMgdGhlXG4gIGZpcnN0IHBhc3NlZCBwcm9taXNlIHRvIHNldHRsZS5cblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXNvbHZlKCdwcm9taXNlIDEnKTtcbiAgICB9LCAyMDApO1xuICB9KTtcblxuICBsZXQgcHJvbWlzZTIgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMicpO1xuICAgIH0sIDEwMCk7XG4gIH0pO1xuXG4gIFByb21pc2UucmFjZShbcHJvbWlzZTEsIHByb21pc2UyXSkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgIC8vIHJlc3VsdCA9PT0gJ3Byb21pc2UgMicgYmVjYXVzZSBpdCB3YXMgcmVzb2x2ZWQgYmVmb3JlIHByb21pc2UxXG4gICAgLy8gd2FzIHJlc29sdmVkLlxuICB9KTtcbiAgYGBgXG5cbiAgYFByb21pc2UucmFjZWAgaXMgZGV0ZXJtaW5pc3RpYyBpbiB0aGF0IG9ubHkgdGhlIHN0YXRlIG9mIHRoZSBmaXJzdFxuICBzZXR0bGVkIHByb21pc2UgbWF0dGVycy4gRm9yIGV4YW1wbGUsIGV2ZW4gaWYgb3RoZXIgcHJvbWlzZXMgZ2l2ZW4gdG8gdGhlXG4gIGBwcm9taXNlc2AgYXJyYXkgYXJndW1lbnQgYXJlIHJlc29sdmVkLCBidXQgdGhlIGZpcnN0IHNldHRsZWQgcHJvbWlzZSBoYXNcbiAgYmVjb21lIHJlamVjdGVkIGJlZm9yZSB0aGUgb3RoZXIgcHJvbWlzZXMgYmVjYW1lIGZ1bGZpbGxlZCwgdGhlIHJldHVybmVkXG4gIHByb21pc2Ugd2lsbCBiZWNvbWUgcmVqZWN0ZWQ6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMScpO1xuICAgIH0sIDIwMCk7XG4gIH0pO1xuXG4gIGxldCBwcm9taXNlMiA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcigncHJvbWlzZSAyJykpO1xuICAgIH0sIDEwMCk7XG4gIH0pO1xuXG4gIFByb21pc2UucmFjZShbcHJvbWlzZTEsIHByb21pc2UyXSkudGhlbihmdW5jdGlvbihyZXN1bHQpe1xuICAgIC8vIENvZGUgaGVyZSBuZXZlciBydW5zXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdwcm9taXNlIDInIGJlY2F1c2UgcHJvbWlzZSAyIGJlY2FtZSByZWplY3RlZCBiZWZvcmVcbiAgICAvLyBwcm9taXNlIDEgYmVjYW1lIGZ1bGZpbGxlZFxuICB9KTtcbiAgYGBgXG5cbiAgQW4gZXhhbXBsZSByZWFsLXdvcmxkIHVzZSBjYXNlIGlzIGltcGxlbWVudGluZyB0aW1lb3V0czpcblxuICBgYGBqYXZhc2NyaXB0XG4gIFByb21pc2UucmFjZShbYWpheCgnZm9vLmpzb24nKSwgdGltZW91dCg1MDAwKV0pXG4gIGBgYFxuXG4gIEBtZXRob2QgcmFjZVxuICBAc3RhdGljXG4gIEBwYXJhbSB7QXJyYXl9IHByb21pc2VzIGFycmF5IG9mIHByb21pc2VzIHRvIG9ic2VydmVcbiAgVXNlZnVsIGZvciB0b29saW5nLlxuICBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2Ugd2hpY2ggc2V0dGxlcyBpbiB0aGUgc2FtZSB3YXkgYXMgdGhlIGZpcnN0IHBhc3NlZFxuICBwcm9taXNlIHRvIHNldHRsZS5cbiovXG5mdW5jdGlvbiByYWNlKGVudHJpZXMpIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICBpZiAoIWlzQXJyYXkoZW50cmllcykpIHtcbiAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uIChfLCByZWplY3QpIHtcbiAgICAgIHJldHVybiByZWplY3QobmV3IFR5cGVFcnJvcignWW91IG11c3QgcGFzcyBhbiBhcnJheSB0byByYWNlLicpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICAgIHZhciBsZW5ndGggPSBlbnRyaWVzLmxlbmd0aDtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgQ29uc3RydWN0b3IucmVzb2x2ZShlbnRyaWVzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuLyoqXG4gIGBQcm9taXNlLnJlamVjdGAgcmV0dXJucyBhIHByb21pc2UgcmVqZWN0ZWQgd2l0aCB0aGUgcGFzc2VkIGByZWFzb25gLlxuICBJdCBpcyBzaG9ydGhhbmQgZm9yIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgcmVqZWN0KG5ldyBFcnJvcignV0hPT1BTJykpO1xuICB9KTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIENvZGUgaGVyZSBkb2Vzbid0IHJ1biBiZWNhdXNlIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIVxuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAnV0hPT1BTJ1xuICB9KTtcbiAgYGBgXG5cbiAgSW5zdGVhZCBvZiB3cml0aW5nIHRoZSBhYm92ZSwgeW91ciBjb2RlIG5vdyBzaW1wbHkgYmVjb21lcyB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1dIT09QUycpKTtcblxuICBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpe1xuICAgIC8vIENvZGUgaGVyZSBkb2Vzbid0IHJ1biBiZWNhdXNlIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIVxuICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgIC8vIHJlYXNvbi5tZXNzYWdlID09PSAnV0hPT1BTJ1xuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCByZWplY3RcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FueX0gcmVhc29uIHZhbHVlIHRoYXQgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSByZWplY3RlZCB3aXRoLlxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSByZWplY3RlZCB3aXRoIHRoZSBnaXZlbiBgcmVhc29uYC5cbiovXG5mdW5jdGlvbiByZWplY3QocmVhc29uKSB7XG4gIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gIHZhciBDb25zdHJ1Y3RvciA9IHRoaXM7XG4gIHZhciBwcm9taXNlID0gbmV3IENvbnN0cnVjdG9yKG5vb3ApO1xuICBfcmVqZWN0KHByb21pc2UsIHJlYXNvbik7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG5mdW5jdGlvbiBuZWVkc1Jlc29sdmVyKCkge1xuICB0aHJvdyBuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGEgcmVzb2x2ZXIgZnVuY3Rpb24gYXMgdGhlIGZpcnN0IGFyZ3VtZW50IHRvIHRoZSBwcm9taXNlIGNvbnN0cnVjdG9yJyk7XG59XG5cbmZ1bmN0aW9uIG5lZWRzTmV3KCkge1xuICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRmFpbGVkIHRvIGNvbnN0cnVjdCAnUHJvbWlzZSc6IFBsZWFzZSB1c2UgdGhlICduZXcnIG9wZXJhdG9yLCB0aGlzIG9iamVjdCBjb25zdHJ1Y3RvciBjYW5ub3QgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24uXCIpO1xufVxuXG4vKipcbiAgUHJvbWlzZSBvYmplY3RzIHJlcHJlc2VudCB0aGUgZXZlbnR1YWwgcmVzdWx0IG9mIGFuIGFzeW5jaHJvbm91cyBvcGVyYXRpb24uIFRoZVxuICBwcmltYXJ5IHdheSBvZiBpbnRlcmFjdGluZyB3aXRoIGEgcHJvbWlzZSBpcyB0aHJvdWdoIGl0cyBgdGhlbmAgbWV0aG9kLCB3aGljaFxuICByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZSByZWFzb25cbiAgd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG5cbiAgVGVybWlub2xvZ3lcbiAgLS0tLS0tLS0tLS1cblxuICAtIGBwcm9taXNlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gd2l0aCBhIGB0aGVuYCBtZXRob2Qgd2hvc2UgYmVoYXZpb3IgY29uZm9ybXMgdG8gdGhpcyBzcGVjaWZpY2F0aW9uLlxuICAtIGB0aGVuYWJsZWAgaXMgYW4gb2JqZWN0IG9yIGZ1bmN0aW9uIHRoYXQgZGVmaW5lcyBhIGB0aGVuYCBtZXRob2QuXG4gIC0gYHZhbHVlYCBpcyBhbnkgbGVnYWwgSmF2YVNjcmlwdCB2YWx1ZSAoaW5jbHVkaW5nIHVuZGVmaW5lZCwgYSB0aGVuYWJsZSwgb3IgYSBwcm9taXNlKS5cbiAgLSBgZXhjZXB0aW9uYCBpcyBhIHZhbHVlIHRoYXQgaXMgdGhyb3duIHVzaW5nIHRoZSB0aHJvdyBzdGF0ZW1lbnQuXG4gIC0gYHJlYXNvbmAgaXMgYSB2YWx1ZSB0aGF0IGluZGljYXRlcyB3aHkgYSBwcm9taXNlIHdhcyByZWplY3RlZC5cbiAgLSBgc2V0dGxlZGAgdGhlIGZpbmFsIHJlc3Rpbmcgc3RhdGUgb2YgYSBwcm9taXNlLCBmdWxmaWxsZWQgb3IgcmVqZWN0ZWQuXG5cbiAgQSBwcm9taXNlIGNhbiBiZSBpbiBvbmUgb2YgdGhyZWUgc3RhdGVzOiBwZW5kaW5nLCBmdWxmaWxsZWQsIG9yIHJlamVjdGVkLlxuXG4gIFByb21pc2VzIHRoYXQgYXJlIGZ1bGZpbGxlZCBoYXZlIGEgZnVsZmlsbG1lbnQgdmFsdWUgYW5kIGFyZSBpbiB0aGUgZnVsZmlsbGVkXG4gIHN0YXRlLiAgUHJvbWlzZXMgdGhhdCBhcmUgcmVqZWN0ZWQgaGF2ZSBhIHJlamVjdGlvbiByZWFzb24gYW5kIGFyZSBpbiB0aGVcbiAgcmVqZWN0ZWQgc3RhdGUuICBBIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5ldmVyIGEgdGhlbmFibGUuXG5cbiAgUHJvbWlzZXMgY2FuIGFsc28gYmUgc2FpZCB0byAqcmVzb2x2ZSogYSB2YWx1ZS4gIElmIHRoaXMgdmFsdWUgaXMgYWxzbyBhXG4gIHByb21pc2UsIHRoZW4gdGhlIG9yaWdpbmFsIHByb21pc2UncyBzZXR0bGVkIHN0YXRlIHdpbGwgbWF0Y2ggdGhlIHZhbHVlJ3NcbiAgc2V0dGxlZCBzdGF0ZS4gIFNvIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aWxsXG4gIGl0c2VsZiByZWplY3QsIGFuZCBhIHByb21pc2UgdGhhdCAqcmVzb2x2ZXMqIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIHdpbGxcbiAgaXRzZWxmIGZ1bGZpbGwuXG5cblxuICBCYXNpYyBVc2FnZTpcbiAgLS0tLS0tLS0tLS0tXG5cbiAgYGBganNcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcbiAgICAvLyBvbiBzdWNjZXNzXG4gICAgcmVzb2x2ZSh2YWx1ZSk7XG5cbiAgICAvLyBvbiBmYWlsdXJlXG4gICAgcmVqZWN0KHJlYXNvbik7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgIC8vIG9uIGZ1bGZpbGxtZW50XG4gIH0sIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgIC8vIG9uIHJlamVjdGlvblxuICB9KTtcbiAgYGBgXG5cbiAgQWR2YW5jZWQgVXNhZ2U6XG4gIC0tLS0tLS0tLS0tLS0tLVxuXG4gIFByb21pc2VzIHNoaW5lIHdoZW4gYWJzdHJhY3RpbmcgYXdheSBhc3luY2hyb25vdXMgaW50ZXJhY3Rpb25zIHN1Y2ggYXNcbiAgYFhNTEh0dHBSZXF1ZXN0YHMuXG5cbiAgYGBganNcbiAgZnVuY3Rpb24gZ2V0SlNPTih1cmwpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICAgIGxldCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuICAgICAgeGhyLm9wZW4oJ0dFVCcsIHVybCk7XG4gICAgICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gaGFuZGxlcjtcbiAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnanNvbic7XG4gICAgICB4aHIuc2V0UmVxdWVzdEhlYWRlcignQWNjZXB0JywgJ2FwcGxpY2F0aW9uL2pzb24nKTtcbiAgICAgIHhoci5zZW5kKCk7XG5cbiAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLnJlYWR5U3RhdGUgPT09IHRoaXMuRE9ORSkge1xuICAgICAgICAgIGlmICh0aGlzLnN0YXR1cyA9PT0gMjAwKSB7XG4gICAgICAgICAgICByZXNvbHZlKHRoaXMucmVzcG9uc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdnZXRKU09OOiBgJyArIHVybCArICdgIGZhaWxlZCB3aXRoIHN0YXR1czogWycgKyB0aGlzLnN0YXR1cyArICddJykpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxuXG4gIGdldEpTT04oJy9wb3N0cy5qc29uJykudGhlbihmdW5jdGlvbihqc29uKSB7XG4gICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgLy8gb24gcmVqZWN0aW9uXG4gIH0pO1xuICBgYGBcblxuICBVbmxpa2UgY2FsbGJhY2tzLCBwcm9taXNlcyBhcmUgZ3JlYXQgY29tcG9zYWJsZSBwcmltaXRpdmVzLlxuXG4gIGBgYGpzXG4gIFByb21pc2UuYWxsKFtcbiAgICBnZXRKU09OKCcvcG9zdHMnKSxcbiAgICBnZXRKU09OKCcvY29tbWVudHMnKVxuICBdKS50aGVuKGZ1bmN0aW9uKHZhbHVlcyl7XG4gICAgdmFsdWVzWzBdIC8vID0+IHBvc3RzSlNPTlxuICAgIHZhbHVlc1sxXSAvLyA9PiBjb21tZW50c0pTT05cblxuICAgIHJldHVybiB2YWx1ZXM7XG4gIH0pO1xuICBgYGBcblxuICBAY2xhc3MgUHJvbWlzZVxuICBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlclxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEBjb25zdHJ1Y3RvclxuKi9cbmZ1bmN0aW9uIFByb21pc2UocmVzb2x2ZXIpIHtcbiAgdGhpc1tQUk9NSVNFX0lEXSA9IG5leHRJZCgpO1xuICB0aGlzLl9yZXN1bHQgPSB0aGlzLl9zdGF0ZSA9IHVuZGVmaW5lZDtcbiAgdGhpcy5fc3Vic2NyaWJlcnMgPSBbXTtcblxuICBpZiAobm9vcCAhPT0gcmVzb2x2ZXIpIHtcbiAgICB0eXBlb2YgcmVzb2x2ZXIgIT09ICdmdW5jdGlvbicgJiYgbmVlZHNSZXNvbHZlcigpO1xuICAgIHRoaXMgaW5zdGFuY2VvZiBQcm9taXNlID8gaW5pdGlhbGl6ZVByb21pc2UodGhpcywgcmVzb2x2ZXIpIDogbmVlZHNOZXcoKTtcbiAgfVxufVxuXG5Qcm9taXNlLmFsbCA9IGFsbDtcblByb21pc2UucmFjZSA9IHJhY2U7XG5Qcm9taXNlLnJlc29sdmUgPSByZXNvbHZlO1xuUHJvbWlzZS5yZWplY3QgPSByZWplY3Q7XG5Qcm9taXNlLl9zZXRTY2hlZHVsZXIgPSBzZXRTY2hlZHVsZXI7XG5Qcm9taXNlLl9zZXRBc2FwID0gc2V0QXNhcDtcblByb21pc2UuX2FzYXAgPSBhc2FwO1xuXG5Qcm9taXNlLnByb3RvdHlwZSA9IHtcbiAgY29uc3RydWN0b3I6IFByb21pc2UsXG5cbiAgLyoqXG4gICAgVGhlIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsXG4gICAgd2hpY2ggcmVnaXN0ZXJzIGNhbGxiYWNrcyB0byByZWNlaXZlIGVpdGhlciBhIHByb21pc2UncyBldmVudHVhbCB2YWx1ZSBvciB0aGVcbiAgICByZWFzb24gd2h5IHRoZSBwcm9taXNlIGNhbm5vdCBiZSBmdWxmaWxsZWQuXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uKHVzZXIpe1xuICAgICAgLy8gdXNlciBpcyBhdmFpbGFibGVcbiAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gdXNlciBpcyB1bmF2YWlsYWJsZSwgYW5kIHlvdSBhcmUgZ2l2ZW4gdGhlIHJlYXNvbiB3aHlcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQ2hhaW5pbmdcbiAgICAtLS0tLS0tLVxuICBcbiAgICBUaGUgcmV0dXJuIHZhbHVlIG9mIGB0aGVuYCBpcyBpdHNlbGYgYSBwcm9taXNlLiAgVGhpcyBzZWNvbmQsICdkb3duc3RyZWFtJ1xuICAgIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmaXJzdCBwcm9taXNlJ3MgZnVsZmlsbG1lbnRcbiAgICBvciByZWplY3Rpb24gaGFuZGxlciwgb3IgcmVqZWN0ZWQgaWYgdGhlIGhhbmRsZXIgdGhyb3dzIGFuIGV4Y2VwdGlvbi5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHJldHVybiB1c2VyLm5hbWU7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgcmV0dXJuICdkZWZhdWx0IG5hbWUnO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHVzZXJOYW1lKSB7XG4gICAgICAvLyBJZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHVzZXJOYW1lYCB3aWxsIGJlIHRoZSB1c2VyJ3MgbmFtZSwgb3RoZXJ3aXNlIGl0XG4gICAgICAvLyB3aWxsIGJlIGAnZGVmYXVsdCBuYW1lJ2BcbiAgICB9KTtcbiAgXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZvdW5kIHVzZXIsIGJ1dCBzdGlsbCB1bmhhcHB5Jyk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jyk7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBpZiBgZmluZFVzZXJgIGZ1bGZpbGxlZCwgYHJlYXNvbmAgd2lsbCBiZSAnRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknLlxuICAgICAgLy8gSWYgYGZpbmRVc2VyYCByZWplY3RlZCwgYHJlYXNvbmAgd2lsbCBiZSAnYGZpbmRVc2VyYCByZWplY3RlZCBhbmQgd2UncmUgdW5oYXBweScuXG4gICAgfSk7XG4gICAgYGBgXG4gICAgSWYgdGhlIGRvd25zdHJlYW0gcHJvbWlzZSBkb2VzIG5vdCBzcGVjaWZ5IGEgcmVqZWN0aW9uIGhhbmRsZXIsIHJlamVjdGlvbiByZWFzb25zIHdpbGwgYmUgcHJvcGFnYXRlZCBmdXJ0aGVyIGRvd25zdHJlYW0uXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGVkYWdvZ2ljYWxFeGNlcHRpb24oJ1Vwc3RyZWFtIGVycm9yJyk7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgIC8vIG5ldmVyIHJlYWNoZWRcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIFRoZSBgUGVkZ2Fnb2NpYWxFeGNlcHRpb25gIGlzIHByb3BhZ2F0ZWQgYWxsIHRoZSB3YXkgZG93biB0byBoZXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEFzc2ltaWxhdGlvblxuICAgIC0tLS0tLS0tLS0tLVxuICBcbiAgICBTb21ldGltZXMgdGhlIHZhbHVlIHlvdSB3YW50IHRvIHByb3BhZ2F0ZSB0byBhIGRvd25zdHJlYW0gcHJvbWlzZSBjYW4gb25seSBiZVxuICAgIHJldHJpZXZlZCBhc3luY2hyb25vdXNseS4gVGhpcyBjYW4gYmUgYWNoaWV2ZWQgYnkgcmV0dXJuaW5nIGEgcHJvbWlzZSBpbiB0aGVcbiAgICBmdWxmaWxsbWVudCBvciByZWplY3Rpb24gaGFuZGxlci4gVGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIHRoZW4gYmUgcGVuZGluZ1xuICAgIHVudGlsIHRoZSByZXR1cm5lZCBwcm9taXNlIGlzIHNldHRsZWQuIFRoaXMgaXMgY2FsbGVkICphc3NpbWlsYXRpb24qLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAvLyBUaGUgdXNlcidzIGNvbW1lbnRzIGFyZSBub3cgYXZhaWxhYmxlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIElmIHRoZSBhc3NpbWxpYXRlZCBwcm9taXNlIHJlamVjdHMsIHRoZW4gdGhlIGRvd25zdHJlYW0gcHJvbWlzZSB3aWxsIGFsc28gcmVqZWN0LlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIGZpbmRDb21tZW50c0J5QXV0aG9yKHVzZXIpO1xuICAgIH0pLnRoZW4oZnVuY3Rpb24gKGNvbW1lbnRzKSB7XG4gICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIGZ1bGZpbGxzLCB3ZSdsbCBoYXZlIHRoZSB2YWx1ZSBoZXJlXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gSWYgYGZpbmRDb21tZW50c0J5QXV0aG9yYCByZWplY3RzLCB3ZSdsbCBoYXZlIHRoZSByZWFzb24gaGVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBTaW1wbGUgRXhhbXBsZVxuICAgIC0tLS0tLS0tLS0tLS0tXG4gIFxuICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGxldCByZXN1bHQ7XG4gIFxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBmaW5kUmVzdWx0KCk7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9XG4gICAgYGBgXG4gIFxuICAgIEVycmJhY2sgRXhhbXBsZVxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRSZXN1bHQoZnVuY3Rpb24ocmVzdWx0LCBlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICAvLyBmYWlsdXJlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWNjZXNzXG4gICAgICB9XG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFByb21pc2UgRXhhbXBsZTtcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGZpbmRSZXN1bHQoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgICAvLyBzdWNjZXNzXG4gICAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIGZhaWx1cmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQWR2YW5jZWQgRXhhbXBsZVxuICAgIC0tLS0tLS0tLS0tLS0tXG4gIFxuICAgIFN5bmNocm9ub3VzIEV4YW1wbGVcbiAgXG4gICAgYGBgamF2YXNjcmlwdFxuICAgIGxldCBhdXRob3IsIGJvb2tzO1xuICBcbiAgICB0cnkge1xuICAgICAgYXV0aG9yID0gZmluZEF1dGhvcigpO1xuICAgICAgYm9va3MgID0gZmluZEJvb2tzQnlBdXRob3IoYXV0aG9yKTtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH1cbiAgICBgYGBcbiAgXG4gICAgRXJyYmFjayBFeGFtcGxlXG4gIFxuICAgIGBgYGpzXG4gIFxuICAgIGZ1bmN0aW9uIGZvdW5kQm9va3MoYm9va3MpIHtcbiAgXG4gICAgfVxuICBcbiAgICBmdW5jdGlvbiBmYWlsdXJlKHJlYXNvbikge1xuICBcbiAgICB9XG4gIFxuICAgIGZpbmRBdXRob3IoZnVuY3Rpb24oYXV0aG9yLCBlcnIpe1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZmluZEJvb29rc0J5QXV0aG9yKGF1dGhvciwgZnVuY3Rpb24oYm9va3MsIGVycikge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGZvdW5kQm9va3MoYm9va3MpO1xuICAgICAgICAgICAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgICAgICAgICAgIGZhaWx1cmUocmVhc29uKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgICAgZmFpbHVyZShlcnIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH1cbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgUHJvbWlzZSBFeGFtcGxlO1xuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgZmluZEF1dGhvcigpLlxuICAgICAgdGhlbihmaW5kQm9va3NCeUF1dGhvcikuXG4gICAgICB0aGVuKGZ1bmN0aW9uKGJvb2tzKXtcbiAgICAgICAgLy8gZm91bmQgYm9va3NcbiAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQG1ldGhvZCB0aGVuXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25GdWxmaWxsZWRcbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGVkXG4gICAgVXNlZnVsIGZvciB0b29saW5nLlxuICAgIEByZXR1cm4ge1Byb21pc2V9XG4gICovXG4gIHRoZW46IHRoZW4sXG5cbiAgLyoqXG4gICAgYGNhdGNoYCBpcyBzaW1wbHkgc3VnYXIgZm9yIGB0aGVuKHVuZGVmaW5lZCwgb25SZWplY3Rpb24pYCB3aGljaCBtYWtlcyBpdCB0aGUgc2FtZVxuICAgIGFzIHRoZSBjYXRjaCBibG9jayBvZiBhIHRyeS9jYXRjaCBzdGF0ZW1lbnQuXG4gIFxuICAgIGBgYGpzXG4gICAgZnVuY3Rpb24gZmluZEF1dGhvcigpe1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdjb3VsZG4ndCBmaW5kIHRoYXQgYXV0aG9yJyk7XG4gICAgfVxuICBcbiAgICAvLyBzeW5jaHJvbm91c1xuICAgIHRyeSB7XG4gICAgICBmaW5kQXV0aG9yKCk7XG4gICAgfSBjYXRjaChyZWFzb24pIHtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfVxuICBcbiAgICAvLyBhc3luYyB3aXRoIHByb21pc2VzXG4gICAgZmluZEF1dGhvcigpLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBAbWV0aG9kIGNhdGNoXG4gICAgQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3Rpb25cbiAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgQHJldHVybiB7UHJvbWlzZX1cbiAgKi9cbiAgJ2NhdGNoJzogZnVuY3Rpb24gX2NhdGNoKG9uUmVqZWN0aW9uKSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihudWxsLCBvblJlamVjdGlvbik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHBvbHlmaWxsKCkge1xuICAgIHZhciBsb2NhbCA9IHVuZGVmaW5lZDtcblxuICAgIGlmICh0eXBlb2YgZ2xvYmFsICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsb2NhbCA9IGdsb2JhbDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsb2NhbCA9IHNlbGY7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxvY2FsID0gRnVuY3Rpb24oJ3JldHVybiB0aGlzJykoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdwb2x5ZmlsbCBmYWlsZWQgYmVjYXVzZSBnbG9iYWwgb2JqZWN0IGlzIHVuYXZhaWxhYmxlIGluIHRoaXMgZW52aXJvbm1lbnQnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBQID0gbG9jYWwuUHJvbWlzZTtcblxuICAgIGlmIChQKSB7XG4gICAgICAgIHZhciBwcm9taXNlVG9TdHJpbmcgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcHJvbWlzZVRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKFAucmVzb2x2ZSgpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgLy8gc2lsZW50bHkgaWdub3JlZFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb21pc2VUb1N0cmluZyA9PT0gJ1tvYmplY3QgUHJvbWlzZV0nICYmICFQLmNhc3QpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGxvY2FsLlByb21pc2UgPSBQcm9taXNlO1xufVxuXG4vLyBTdHJhbmdlIGNvbXBhdC4uXG5Qcm9taXNlLnBvbHlmaWxsID0gcG9seWZpbGw7XG5Qcm9taXNlLlByb21pc2UgPSBQcm9taXNlO1xuXG5yZXR1cm4gUHJvbWlzZTtcblxufSkpKTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWVzNi1wcm9taXNlLm1hcCIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBjYWNoZWQgZnJvbSB3aGF0ZXZlciBnbG9iYWwgaXMgcHJlc2VudCBzbyB0aGF0IHRlc3QgcnVubmVycyB0aGF0IHN0dWIgaXRcbi8vIGRvbid0IGJyZWFrIHRoaW5ncy4gIEJ1dCB3ZSBuZWVkIHRvIHdyYXAgaXQgaW4gYSB0cnkgY2F0Y2ggaW4gY2FzZSBpdCBpc1xuLy8gd3JhcHBlZCBpbiBzdHJpY3QgbW9kZSBjb2RlIHdoaWNoIGRvZXNuJ3QgZGVmaW5lIGFueSBnbG9iYWxzLiAgSXQncyBpbnNpZGUgYVxuLy8gZnVuY3Rpb24gYmVjYXVzZSB0cnkvY2F0Y2hlcyBkZW9wdGltaXplIGluIGNlcnRhaW4gZW5naW5lcy5cblxudmFyIGNhY2hlZFNldFRpbWVvdXQ7XG52YXIgY2FjaGVkQ2xlYXJUaW1lb3V0O1xuXG5mdW5jdGlvbiBkZWZhdWx0U2V0VGltb3V0KCkge1xuICAgIHRocm93IG5ldyBFcnJvcignc2V0VGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuZnVuY3Rpb24gZGVmYXVsdENsZWFyVGltZW91dCAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjbGVhclRpbWVvdXQgaGFzIG5vdCBiZWVuIGRlZmluZWQnKTtcbn1cbihmdW5jdGlvbiAoKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBzZXRUaW1lb3V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gc2V0VGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjYWNoZWRTZXRUaW1lb3V0ID0gZGVmYXVsdFNldFRpbW91dDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGVhclRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGNsZWFyVGltZW91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZENsZWFyVGltZW91dCA9IGRlZmF1bHRDbGVhclRpbWVvdXQ7XG4gICAgfVxufSAoKSlcbmZ1bmN0aW9uIHJ1blRpbWVvdXQoZnVuKSB7XG4gICAgaWYgKGNhY2hlZFNldFRpbWVvdXQgPT09IHNldFRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIC8vIGlmIHNldFRpbWVvdXQgd2Fzbid0IGF2YWlsYWJsZSBidXQgd2FzIGxhdHRlciBkZWZpbmVkXG4gICAgaWYgKChjYWNoZWRTZXRUaW1lb3V0ID09PSBkZWZhdWx0U2V0VGltb3V0IHx8ICFjYWNoZWRTZXRUaW1lb3V0KSAmJiBzZXRUaW1lb3V0KSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW4sIDApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICAvLyB3aGVuIHdoZW4gc29tZWJvZHkgaGFzIHNjcmV3ZWQgd2l0aCBzZXRUaW1lb3V0IGJ1dCBubyBJLkUuIG1hZGRuZXNzXG4gICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfSBjYXRjaChlKXtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIEkuRS4gYnV0IHRoZSBzY3JpcHQgaGFzIGJlZW4gZXZhbGVkIHNvIEkuRS4gZG9lc24ndCB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbChudWxsLCBmdW4sIDApO1xuICAgICAgICB9IGNhdGNoKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3JcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRTZXRUaW1lb3V0LmNhbGwodGhpcywgZnVuLCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG59XG5mdW5jdGlvbiBydW5DbGVhclRpbWVvdXQobWFya2VyKSB7XG4gICAgaWYgKGNhY2hlZENsZWFyVGltZW91dCA9PT0gY2xlYXJUaW1lb3V0KSB7XG4gICAgICAgIC8vbm9ybWFsIGVudmlyb21lbnRzIGluIHNhbmUgc2l0dWF0aW9uc1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIC8vIGlmIGNsZWFyVGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZENsZWFyVGltZW91dCA9PT0gZGVmYXVsdENsZWFyVGltZW91dCB8fCAhY2FjaGVkQ2xlYXJUaW1lb3V0KSAmJiBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICByZXR1cm4gY2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dChtYXJrZXIpO1xuICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0ICB0cnVzdCB0aGUgZ2xvYmFsIG9iamVjdCB3aGVuIGNhbGxlZCBub3JtYWxseVxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZENsZWFyVGltZW91dC5jYWxsKG51bGwsIG1hcmtlcik7XG4gICAgICAgIH0gY2F0Y2ggKGUpe1xuICAgICAgICAgICAgLy8gc2FtZSBhcyBhYm92ZSBidXQgd2hlbiBpdCdzIGEgdmVyc2lvbiBvZiBJLkUuIHRoYXQgbXVzdCBoYXZlIHRoZSBnbG9iYWwgb2JqZWN0IGZvciAndGhpcycsIGhvcGZ1bGx5IG91ciBjb250ZXh0IGNvcnJlY3Qgb3RoZXJ3aXNlIGl0IHdpbGwgdGhyb3cgYSBnbG9iYWwgZXJyb3IuXG4gICAgICAgICAgICAvLyBTb21lIHZlcnNpb25zIG9mIEkuRS4gaGF2ZSBkaWZmZXJlbnQgcnVsZXMgZm9yIGNsZWFyVGltZW91dCB2cyBzZXRUaW1lb3V0XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwodGhpcywgbWFya2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG5cbn1cbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGlmICghZHJhaW5pbmcgfHwgIWN1cnJlbnRRdWV1ZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHJ1blRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRRdWV1ZSkge1xuICAgICAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIHJ1bkNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDEgJiYgIWRyYWluaW5nKSB7XG4gICAgICAgIHJ1blRpbWVvdXQoZHJhaW5RdWV1ZSk7XG4gICAgfVxufTtcblxuLy8gdjggbGlrZXMgcHJlZGljdGlibGUgb2JqZWN0c1xuZnVuY3Rpb24gSXRlbShmdW4sIGFycmF5KSB7XG4gICAgdGhpcy5mdW4gPSBmdW47XG4gICAgdGhpcy5hcnJheSA9IGFycmF5O1xufVxuSXRlbS5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVuLmFwcGx5KG51bGwsIHRoaXMuYXJyYXkpO1xufTtcbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCJleHBvcnQgY29uc3QgRVZFTlRTID0ge1xyXG4gIFNJR05JTjogJ1NJR05JTicsXHJcbiAgU0lHTk9VVDogJ1NJR05PVVQnLFxyXG4gIFNJR05VUDogJ1NJR05VUCdcclxufTtcclxuXHJcbmV4cG9ydCBjb25zdCBVUkxTID0ge1xyXG4gIHRva2VuOiAndG9rZW4nLFxyXG4gIHNpZ251cDogJzEvdXNlci9zaWdudXAnLFxyXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkOiAnMS91c2VyL3JlcXVlc3RSZXNldFBhc3N3b3JkJyxcclxuICByZXNldFBhc3N3b3JkOiAnMS91c2VyL3Jlc2V0UGFzc3dvcmQnLFxyXG4gIGNoYW5nZVBhc3N3b3JkOiAnMS91c2VyL2NoYW5nZVBhc3N3b3JkJyxcclxuICBvYmplY3RzOiAnMS9vYmplY3RzJyxcclxuICBvYmplY3RzQWN0aW9uOiAnMS9vYmplY3RzL2FjdGlvbicsXHJcbiAgLy8gc29jaWFsTG9naW5XaXRoQ29kZTogJzEvdXNlci9QUk9WSURFUi9jb2RlJyxcclxuICAvLyBzb2NpYWxTaW5ndXBXaXRoQ29kZTogJzEvdXNlci9QUk9WSURFUi9zaWdudXBDb2RlJyxcclxuICBzb2NpYWxTaWduaW5XaXRoVG9rZW46ICcxL3VzZXIvUFJPVklERVIvdG9rZW4nLFxyXG4gIHByb2ZpbGU6ICcvYXBpL2FjY291bnQvcHJvZmlsZScsXHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgU09DSUFMX1BST1ZJREVSUyA9IHtcclxuICBnaXRodWI6IHtuYW1lOiAnZ2l0aHViJywgbGFiZWw6ICdHaXRodWInLCB1cmw6ICd3d3cuZ2l0aHViLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyM0NDQnfSwgaWQ6IDF9LFxyXG4gIGdvb2dsZToge25hbWU6ICdnb29nbGUnLCBsYWJlbDogJ0dvb2dsZScsIHVybDogJ3d3dy5nb29nbGUuY29tJywgY3NzOiB7YmFja2dyb3VuZENvbG9yOiAnI2RkNGIzOSd9LCBpZDogMn0sXHJcbiAgZmFjZWJvb2s6IHtuYW1lOiAnZmFjZWJvb2snLCBsYWJlbDogJ0ZhY2Vib29rJywgdXJsOiAnd3d3LmZhY2Vib29rLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyMzYjU5OTgnfSwgaWQ6IDN9LFxyXG4gIHR3aXR0ZXI6IHtuYW1lOiAndHdpdHRlcicsIGxhYmVsOiAnVHdpdHRlcicsIHVybDogJ3d3dy50d2l0dGVyLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyM1NWFjZWUnfSwgaWQ6IDR9XHJcbn07XHJcbiIsImV4cG9ydCBkZWZhdWx0IHtcclxuICBhcHBOYW1lOiBudWxsLFxyXG4gIGFub255bW91c1Rva2VuOiBudWxsLFxyXG4gIHNpZ25VcFRva2VuOiBudWxsLFxyXG4gIGFwaVVybDogJ2h0dHBzOi8vYXBpLmJhY2thbmQuY29tJyxcclxuICBzdG9yYWdlOiB3aW5kb3cubG9jYWxTdG9yYWdlLFxyXG4gIHN0b3JhZ2VQcmVmaXg6ICdCQUNLQU5EXycsXHJcbiAgbWFuYWdlUmVmcmVzaFRva2VuOiB0cnVlLFxyXG4gIHJ1blNpZ25pbkFmdGVyU2lnbnVwOiB0cnVlLFxyXG4gIHJ1blNvY2tldDogZmFsc2UsXHJcbiAgc29ja2V0VXJsOiAnaHR0cHM6Ly9zb2NrZXQuYmFja2FuZC5jb20nLFxyXG4gIGlzTW9iaWxlOiBmYWxzZSxcclxufTtcclxuIiwiZXhwb3J0IGNvbnN0IGZpbHRlciA9IHtcclxuICBjcmVhdGU6IChmaWVsZE5hbWUsIG9wZXJhdG9yLCB2YWx1ZSkgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcGVyYXRvcixcclxuICAgICAgdmFsdWVcclxuICAgIH1cclxuICB9LFxyXG4gIG9wZXJhdG9yczoge1xyXG4gICAgbnVtZXJpYzogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgZ3JlYXRlclRoYW46IFwiZ3JlYXRlclRoYW5cIiwgZ3JlYXRlclRoYW5PckVxdWFsc1RvOiBcImdyZWF0ZXJUaGFuT3JFcXVhbHNUb1wiLCBsZXNzVGhhbjogXCJsZXNzVGhhblwiLCBsZXNzVGhhbk9yRXF1YWxzVG86IFwibGVzc1RoYW5PckVxdWFsc1RvXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIGRhdGU6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIGdyZWF0ZXJUaGFuOiBcImdyZWF0ZXJUaGFuXCIsIGdyZWF0ZXJUaGFuT3JFcXVhbHNUbzogXCJncmVhdGVyVGhhbk9yRXF1YWxzVG9cIiwgbGVzc1RoYW46IFwibGVzc1RoYW5cIiwgbGVzc1RoYW5PckVxdWFsc1RvOiBcImxlc3NUaGFuT3JFcXVhbHNUb1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICB0ZXh0OiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBzdGFydHNXaXRoOiBcInN0YXJ0c1dpdGhcIiwgZW5kc1dpdGg6IFwiZW5kc1dpdGhcIiwgY29udGFpbnM6IFwiY29udGFpbnNcIiwgbm90Q29udGFpbnM6IFwibm90Q29udGFpbnNcIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgYm9vbGVhbjogeyBlcXVhbHM6IFwiZXF1YWxzXCIgfSxcclxuICAgIHJlbGF0aW9uOiB7IGluOiBcImluXCIgfVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNvcnQgPSB7XHJcbiAgY3JlYXRlOiAoZmllbGROYW1lLCBvcmRlcikgPT4ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgZmllbGROYW1lLFxyXG4gICAgICBvcmRlclxyXG4gICAgfVxyXG4gIH0sXHJcbiAgb3JkZXJzOiB7IGFzYzogXCJhc2NcIiwgZGVzYzogXCJkZXNjXCIgfVxyXG59XHJcblxyXG5leHBvcnQgY29uc3QgZXhjbHVkZSA9IHtcclxuICBvcHRpb25zOiB7IG1ldGFkYXRhOiBcIm1ldGFkYXRhXCIsIHRvdGFsUm93czogXCJ0b3RhbFJvd3NcIiwgYWxsOiBcIm1ldGFkYXRhLHRvdGFsUm93c1wiIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFN0b3JhZ2VBYnN0cmFjdCB7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICBpZiAodGhpcy5jb25zdHJ1Y3RvciA9PT0gU3RvcmFnZUFic3RyYWN0KSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJDYW4gbm90IGNvbnN0cnVjdCBhYnN0cmFjdCBjbGFzcy5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zZXRJdGVtID09PSB1bmRlZmluZWQgfHwgdGhpcy5zZXRJdGVtID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLnNldEl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgc2V0SXRlbSBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuZ2V0SXRlbSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuZ2V0SXRlbSA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5nZXRJdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIGdldEl0ZW0gbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLnJlbW92ZUl0ZW0gPT09IHVuZGVmaW5lZCB8fCB0aGlzLnJlbW92ZUl0ZW0gPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUucmVtb3ZlSXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSByZW1vdmVJdGVtIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5jbGVhciA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuY2xlYXIgPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUuY2xlYXIpIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgY2xlYXIgbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIC8vIHRoaXMuZGF0YSA9IHt9O1xyXG4gIH1cclxuICBzZXRJdGVtIChpZCwgdmFsKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIHNldEl0ZW0gZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyByZXR1cm4gdGhpcy5kYXRhW2lkXSA9IFN0cmluZyh2YWwpO1xyXG4gIH1cclxuICBnZXRJdGVtIChpZCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBnZXRJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gcmV0dXJuIHRoaXMuZGF0YS5oYXNPd25Qcm9wZXJ0eShpZCkgPyB0aGlzLl9kYXRhW2lkXSA6IG51bGw7XHJcbiAgfVxyXG4gIHJlbW92ZUl0ZW0gKGlkKSB7XHJcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiRG8gbm90IGNhbGwgYWJzdHJhY3QgbWV0aG9kIHJlbW92ZUl0ZW0gZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyBkZWxldGUgdGhpcy5kYXRhW2lkXTtcclxuICAgIC8vIHJldHVybiBudWxsO1xyXG4gICB9XHJcbiAgY2xlYXIgKCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBjbGVhciBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIHJldHVybiB0aGlzLmRhdGEgPSB7fTtcclxuICAgfVxyXG59XHJcbiIsIi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxyXG4gKiBiYWNrYW5kIEphdmFTY3JpcHQgTGlicmFyeVxyXG4gKiBBdXRob3JzOiBiYWNrYW5kXHJcbiAqIExpY2Vuc2U6IE1JVCAoaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHApXHJcbiAqIENvbXBpbGVkIEF0OiAyNi8xMS8yMDE2XHJcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cclxuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnXHJcbmltcG9ydCAqIGFzIGNvbnN0YW50cyBmcm9tICcuL2NvbnN0YW50cydcclxuaW1wb3J0ICogYXMgaGVscGVycyBmcm9tICcuL2hlbHBlcnMnXHJcbmltcG9ydCBTdG9yYWdlIGZyb20gJy4vdXRpbHMvc3RvcmFnZSdcclxuaW1wb3J0IEh0dHAgZnJvbSAnLi91dGlscy9odHRwJ1xyXG5pbXBvcnQgU29ja2V0IGZyb20gJy4vdXRpbHMvc29ja2V0J1xyXG5pbXBvcnQgKiBhcyBhdXRoIGZyb20gJy4vc2VydmljZXMvYXV0aCdcclxuaW1wb3J0ICogYXMgY3J1ZCBmcm9tICcuL3NlcnZpY2VzL2NydWQnXHJcbmltcG9ydCAqIGFzIGZpbGVzIGZyb20gJy4vc2VydmljZXMvZmlsZXMnXHJcblxyXG5sZXQgYmFja2FuZCA9IHtcclxuICBjb25zdGFudHMsXHJcbiAgaGVscGVycyxcclxufVxyXG5iYWNrYW5kLmluaXRpYXRlID0gKGNvbmZpZyA9IHt9KSA9PiB7XHJcblxyXG4gIC8vIGNvbWJpbmUgZGVmYXVsdHMgd2l0aCB1c2VyIGNvbmZpZ1xyXG4gIE9iamVjdC5hc3NpZ24oZGVmYXVsdHMsIGNvbmZpZyk7XHJcbiAgLy8gY29uc29sZS5sb2coZGVmYXVsdHMpO1xyXG5cclxuICAvLyB2ZXJpZnkgbmV3IGRlZmF1bHRzXHJcbiAgaWYgKCFkZWZhdWx0cy5hcHBOYW1lKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdhcHBOYW1lIGlzIG1pc3NpbmcnKTtcclxuICBpZiAoIWRlZmF1bHRzLmFub255bW91c1Rva2VuKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdhbm9ueW1vdXNUb2tlbiBpcyBtaXNzaW5nJyk7XHJcbiAgaWYgKCFkZWZhdWx0cy5zaWduVXBUb2tlbilcclxuICAgIHRocm93IG5ldyBFcnJvcignc2lnblVwVG9rZW4gaXMgbWlzc2luZycpO1xyXG5cclxuICAvLyBpbml0IGdsb2JhbHNcclxuICBsZXQgc3RvcmFnZSA9IG5ldyBTdG9yYWdlKGRlZmF1bHRzLnN0b3JhZ2UsIGRlZmF1bHRzLnN0b3JhZ2VQcmVmaXgpO1xyXG4gIGxldCBodHRwID0gSHR0cC5jcmVhdGUoe1xyXG4gICAgYmFzZVVSTDogZGVmYXVsdHMuYXBpVXJsXHJcbiAgfSk7XHJcbiAgbGV0IHNjb3BlID0ge1xyXG4gICAgc3RvcmFnZSxcclxuICAgIGh0dHAsXHJcbiAgICBpc0lFOiB3aW5kb3cuZG9jdW1lbnQgJiYgKGZhbHNlIHx8ICEhZG9jdW1lbnQuZG9jdW1lbnRNb2RlKSxcclxuICB9XHJcbiAgbGV0IHNvY2tldCA9IG51bGw7XHJcbiAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgc29ja2V0ID0gbmV3IFNvY2tldChkZWZhdWx0cy5zb2NrZXRVcmwpO1xyXG4gICAgc2NvcGUuc29ja2V0ID0gc29ja2V0O1xyXG4gIH1cclxuXHJcbiAgLy8gYmluZCBnbG9iYWxzIHRvIGFsbCBzZXJ2aWNlIGZ1bmN0aW9uc1xyXG4gIGxldCBzZXJ2aWNlID0gT2JqZWN0LmFzc2lnbih7fSwgYXV0aCwgY3J1ZCwgZmlsZXMpO1xyXG4gIGZvciAobGV0IGZuIGluIHNlcnZpY2UpIHtcclxuICAgIHNlcnZpY2VbZm5dID0gc2VydmljZVtmbl0uYmluZChzY29wZSk7XHJcbiAgfVxyXG5cclxuICAvLyBzZXQgaW50ZXJjZXB0b3IgZm9yIGF1dGhIZWFkZXJzICYgcmVmcmVzaFRva2VuXHJcbiAgaHR0cC5jb25maWcuaW50ZXJjZXB0b3JzID0ge1xyXG4gICAgcmVxdWVzdDogZnVuY3Rpb24oY29uZmlnKSB7XHJcbiAgICAgIGlmIChjb25maWcudXJsLmluZGV4T2YoY29uc3RhbnRzLlVSTFMudG9rZW4pID09PSAgLTEgJiYgc3RvcmFnZS5nZXQoJ3VzZXInKSkge1xyXG4gICAgICAgIGNvbmZpZy5oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnLmhlYWRlcnMsIHN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4pXHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICByZXNwb25zZUVycm9yOiBmdW5jdGlvbiAoZXJyb3IsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYikge1xyXG4gICAgICBpZiAoY29uZmlnLnVybC5pbmRleE9mKGNvbnN0YW50cy5VUkxTLnRva2VuKSA9PT0gIC0xXHJcbiAgICAgICAmJiBkZWZhdWx0cy5tYW5hZ2VSZWZyZXNoVG9rZW5cclxuICAgICAgICYmIGVycm9yLnN0YXR1cyA9PT0gNDAxXHJcbiAgICAgICAmJiBlcnJvci5kYXRhICYmIGVycm9yLmRhdGEuTWVzc2FnZSA9PT0gJ2ludmFsaWQgb3IgZXhwaXJlZCB0b2tlbicpIHtcclxuICAgICAgICAgYXV0aC5fX2hhbmRsZVJlZnJlc2hUb2tlbl9fLmNhbGwoc2NvcGUsIGVycm9yKVxyXG4gICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgICAgdGhpcy5yZXF1ZXN0KGNvbmZpZywgc2NiLCBlY2IpO1xyXG4gICAgICAgICB9KVxyXG4gICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gZ2V0IGRhdGEgZnJvbSB1cmwgaW4gc29jaWFsIHNpZ24taW4gcG9wdXBcclxuICBpZiAoIWRlZmF1bHRzLmlzTW9iaWxlKSB7XHJcbiAgICBsZXQgZGF0YU1hdGNoID0gL1xcPyhkYXRhfGVycm9yKT0oLispLy5leGVjKHdpbmRvdy5sb2NhdGlvbi5ocmVmKTtcclxuICAgIGlmIChkYXRhTWF0Y2ggJiYgZGF0YU1hdGNoWzFdICYmIGRhdGFNYXRjaFsyXSkge1xyXG4gICAgICBsZXQgZGF0YSA9IHtcclxuICAgICAgICBkYXRhOiBKU09OLnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudChkYXRhTWF0Y2hbMl0ucmVwbGFjZSgvIy4qLywgJycpKSlcclxuICAgICAgfVxyXG4gICAgICBkYXRhLnN0YXR1cyA9IChkYXRhTWF0Y2hbMV0gPT09ICdkYXRhJykgPyAyMDAgOiAwO1xyXG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnU09DSUFMX0RBVEEnLCBKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICAgIC8vIHZhciBpc0lFID0gZmFsc2UgfHwgISFkb2N1bWVudC5kb2N1bWVudE1vZGU7XHJcbiAgICAgIC8vIGlmICghaXNJRSkge1xyXG4gICAgICAvLyAgIHdpbmRvdy5vcGVuZXIucG9zdE1lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoZGF0YSksIGxvY2F0aW9uLm9yaWdpbik7XHJcbiAgICAgIC8vIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vIGV4cG9zZSBiYWNrYW5kIG5hbWVzcGFjZSB0byB3aW5kb3dcclxuICBkZWxldGUgYmFja2FuZC5pbml0aWF0ZTtcclxuICBPYmplY3QuYXNzaWduKGJhY2thbmQsIHtzZXJ2aWNlfSk7XHJcbiAgaWYoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICBzdG9yYWdlLmdldCgndXNlcicpICYmIHNvY2tldC5jb25uZWN0KHN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiB8fCBudWxsLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSlcclxuICAgIE9iamVjdC5hc3NpZ24oYmFja2FuZCwge3NvY2tldH0pO1xyXG4gIH1cblxyXG59XHJcblxubW9kdWxlLmV4cG9ydHMgPSBiYWNrYW5kXHJcbiIsImltcG9ydCB7IFByb21pc2UgfSBmcm9tICdlczYtcHJvbWlzZSdcclxuaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuLy4uL2RlZmF1bHRzJ1xuXHJcbmZ1bmN0aW9uIF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXyAoc3RhdHVzID0gMCwgc3RhdHVzVGV4dCA9ICcnLCBoZWFkZXJzID0gW10sIGRhdGEgPSAnJykge1xyXG4gIHJldHVybiB7XHJcbiAgICBzdGF0dXMsXHJcbiAgICBzdGF0dXNUZXh0LFxyXG4gICAgaGVhZGVycyxcclxuICAgIGRhdGFcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gX19kaXNwYXRjaEV2ZW50X18gKG5hbWUpIHtcclxuICBsZXQgZXZlbnQ7XHJcbiAgaWYoZGVmYXVsdHMuaXNNb2JpbGUpXHJcbiAgICByZXR1cm47XHJcbiAgaWYgKGRvY3VtZW50LmNyZWF0ZUV2ZW50KSB7XHJcbiAgICBldmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xyXG4gICAgZXZlbnQuaW5pdEV2ZW50KG5hbWUsIHRydWUsIHRydWUpO1xyXG4gICAgZXZlbnQuZXZlbnROYW1lID0gbmFtZTtcclxuICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudE9iamVjdCgpO1xyXG4gICAgZXZlbnQuZXZlbnRUeXBlID0gbmFtZTtcclxuICAgIGV2ZW50LmV2ZW50TmFtZSA9IG5hbWU7XHJcbiAgICB3aW5kb3cuZmlyZUV2ZW50KCdvbicgKyBldmVudC5ldmVudFR5cGUsIGV2ZW50KTtcclxuICB9XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIF9faGFuZGxlUmVmcmVzaFRva2VuX18gKGVycm9yKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGxldCB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgaWYgKCF1c2VyIHx8ICF1c2VyLmRldGFpbHMucmVmcmVzaF90b2tlbikge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIG9yIHJlZnJlc2hUb2tlbiBmb3VuZC4gYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuJykpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIF9fc2lnbmluV2l0aFRva2VuX18uY2FsbCh0aGlzLCB7XHJcbiAgICAgICAgdXNlcm5hbWU6IHVzZXIuZGV0YWlscy51c2VybmFtZSxcclxuICAgICAgICByZWZyZXNoVG9rZW46IHVzZXIuZGV0YWlscy5yZWZyZXNoX3Rva2VuLFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSlcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHVzZUFub255bW91c0F1dGggKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgZGV0YWlscyA9IHtcclxuICAgICAgXCJhY2Nlc3NfdG9rZW5cIjogZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sXHJcbiAgICAgIFwidG9rZW5fdHlwZVwiOiBcIkFub255bW91c1Rva2VuXCIsXHJcbiAgICAgIFwiZXhwaXJlc19pblwiOiAwLFxyXG4gICAgICBcImFwcE5hbWVcIjogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgXCJ1c2VybmFtZVwiOiBcIkd1ZXN0XCIsXHJcbiAgICAgIFwicm9sZVwiOiBcIlVzZXJcIixcclxuICAgICAgXCJmaXJzdE5hbWVcIjogXCJhbm9ueW1vdXNcIixcclxuICAgICAgXCJsYXN0TmFtZVwiOiBcImFub255bW91c1wiLFxyXG4gICAgICBcImZ1bGxOYW1lXCI6IFwiXCIsXHJcbiAgICAgIFwicmVnSWRcIjogMCAsXHJcbiAgICAgIFwidXNlcklkXCI6IG51bGxcclxuICAgIH1cclxuICAgIHRoaXMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgQW5vbnltb3VzVG9rZW46IGRlZmF1bHRzLmFub255bW91c1Rva2VuXHJcbiAgICAgIH0sXHJcbiAgICAgIGRldGFpbHMsXHJcbiAgICB9KTtcclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICB0aGlzLnNvY2tldC5jb25uZWN0KG51bGwsIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgIH1cclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICAgIHJlc29sdmUoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGRldGFpbHMpKTtcclxuICB9KTtcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gc2lnbmluICh1c2VybmFtZSwgcGFzc3dvcmQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYHVzZXJuYW1lPSR7dXNlcm5hbWV9JnBhc3N3b3JkPSR7cGFzc3dvcmR9JmFwcE5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSZncmFudF90eXBlPXBhc3N3b3JkYFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzaWdudXAgKGVtYWlsLCBwYXNzd29yZCwgY29uZmlybVBhc3N3b3JkLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBwYXJhbWV0ZXJzID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy5zaWdudXAsXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ1NpZ25VcFRva2VuJzogZGVmYXVsdHMuc2lnblVwVG9rZW5cclxuICAgICAgfSxcclxuICAgICAgZGF0YToge1xyXG4gICAgICAgIGZpcnN0TmFtZSxcclxuICAgICAgICBsYXN0TmFtZSxcclxuICAgICAgICBlbWFpbCxcclxuICAgICAgICBwYXNzd29yZCxcclxuICAgICAgICBjb25maXJtUGFzc3dvcmQsXHJcbiAgICAgICAgcGFyYW1ldGVyc1xyXG4gICAgICB9XHJcbiAgICB9LCBzY2IgLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICBpZihkZWZhdWx0cy5ydW5TaWduaW5BZnRlclNpZ251cCkge1xyXG4gICAgICAgIHJldHVybiBzaWduaW4uY2FsbCh0aGlzLCByZXNwb25zZS5kYXRhLnVzZXJuYW1lLCBwYXNzd29yZCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIF9fZ2V0U29jaWFsVXJsX18gKHByb3ZpZGVyTmFtZSwgaXNTaWdudXAsIGlzQXV0b1NpZ25VcCkge1xyXG4gIGxldCBwcm92aWRlciA9IFNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJOYW1lXTtcclxuICBsZXQgYWN0aW9uID0gaXNTaWdudXAgPyAndXAnIDogJ2luJztcclxuICBsZXQgYXV0b1NpZ25VcFBhcmFtID0gYCZzaWdudXBJZk5vdFNpZ25lZEluPSR7KCFpc1NpZ251cCAmJiBpc0F1dG9TaWduVXApID8gJ3RydWUnIDogJ2ZhbHNlJ31gO1xyXG4gIHJldHVybiBgL3VzZXIvc29jaWFsU2lnbiR7YWN0aW9ufT9wcm92aWRlcj0ke3Byb3ZpZGVyLmxhYmVsfSR7YXV0b1NpZ25VcFBhcmFtfSZyZXNwb25zZV90eXBlPXRva2VuJmNsaWVudF9pZD1zZWxmJnJlZGlyZWN0X3VyaT0ke3Byb3ZpZGVyLnVybH0mc3RhdGU9YDtcclxufVxyXG5mdW5jdGlvbiBfX3NvY2lhbEF1dGhfXyAocHJvdmlkZXIsIGlzU2lnblVwLCBzcGVjLCBlbWFpbCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBpZiAoIVNPQ0lBTF9QUk9WSURFUlNbcHJvdmlkZXJdKSB7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBTb2NpYWwgUHJvdmlkZXInKSk7XHJcbiAgICB9XHJcbiAgICBsZXQgdXJsID0gIGAke2RlZmF1bHRzLmFwaVVybH0vMS8ke19fZ2V0U29jaWFsVXJsX18ocHJvdmlkZXIsIGlzU2lnblVwLCB0cnVlKX0mYXBwbmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JHtlbWFpbCA/ICcmZW1haWw9JytlbWFpbCA6ICcnfSZyZXR1cm5BZGRyZXNzPWAgLy8gJHtsb2NhdGlvbi5ocmVmfVxuICAgIGxldCBwb3B1cCA9IG51bGw7XG4gICAgaWYgKCF0aGlzLmlzSUUpIHtcbiAgICAgIHBvcHVwID0gd2luZG93Lm9wZW4odXJsLCAnc29jaWFscG9wdXAnLCBzcGVjKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBwb3B1cCA9IHdpbmRvdy5vcGVuKCcnLCAnJywgc3BlYyk7XG4gICAgICBwb3B1cC5sb2NhdGlvbiA9IHVybDtcbiAgICB9XG4gICAgaWYgKHBvcHVwICYmIHBvcHVwLmZvY3VzKSB7IHBvcHVwLmZvY3VzKCkgfVxyXG5cclxuICAgIGxldCBoYW5kbGVyID0gZnVuY3Rpb24oZSkge1xyXG4gICAgICBsZXQgdXJsID0gZS50eXBlID09PSAnbWVzc2FnZScgPyBlLm9yaWdpbiA6IGUudXJsO1xyXG4gICAgICBpZiAodXJsLmluZGV4T2Yod2luZG93LmxvY2F0aW9uLmhyZWYpID09PSAtMSkge1xyXG4gICAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnVW5rbm93biBPcmlnaW4gTWVzc2FnZScpKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlcyA9IGUudHlwZSA9PT0gJ21lc3NhZ2UnID8gSlNPTi5wYXJzZShlLmRhdGEpIDogSlNPTi5wYXJzZShlLm5ld1ZhbHVlKTtcclxuICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoZS50eXBlLCBoYW5kbGVyLCBmYWxzZSk7XHJcbiAgICAgIGlmIChwb3B1cCAmJiBwb3B1cC5jbG9zZSkgeyBwb3B1cC5jbG9zZSgpIH1cclxuICAgICAgZS50eXBlID09PSAnc3RvcmFnZScgJiYgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oZS5rZXkpO1xyXG5cclxuICAgICAgaWYgKHJlcy5zdGF0dXMgIT0gMjAwKSB7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICB9XHJcblxyXG4gICAgfVxyXG4gICAgaGFuZGxlciA9IGhhbmRsZXIuYmluZChwb3B1cCk7XHJcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdzdG9yYWdlJywgaGFuZGxlciAsIGZhbHNlKTtcclxuICAgIC8vIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgaGFuZGxlciwgZmFsc2UpO1xyXG4gIH0pO1xyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWduaW4gKHByb3ZpZGVyLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fLmNhbGwodGhpcywgcHJvdmlkZXIsIGZhbHNlLCBzcGVjLCAnJylcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIHJldHVybiBfX3NpZ25pbldpdGhUb2tlbl9fLmNhbGwodGhpcywge1xyXG4gICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgICAgfSlcclxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICB9KTtcclxuICB9KTtcclxufTtcclxuZXhwb3J0IGZ1bmN0aW9uIHNvY2lhbFNpZ25pbldpdGhUb2tlbiAocHJvdmlkZXIsIHRva2VuLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMuc29jaWFsU2lnbmluV2l0aFRva2VuLnJlcGxhY2UoJ1BST1ZJREVSJywgcHJvdmlkZXIpLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBwYXJhbXM6IHtcclxuICAgICAgICBhY2Nlc3NUb2tlbjogdG9rZW4sXHJcbiAgICAgICAgYXBwTmFtZTogZGVmYXVsdHMuYXBwTmFtZSxcclxuICAgICAgICBzaWdudXBJZk5vdFNpZ25lZEluOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICB0b2tlbjoge1xyXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Jlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VufWBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGRldGFpbHM6IHJlc3BvbnNlLmRhdGFcclxuICAgICAgfSk7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOSU4pO1xyXG4gICAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdCh0aGlzLnN0b3JhZ2UuZ2V0KCd1c2VyJykudG9rZW4uQXV0aG9yaXphdGlvbiwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgICB9XHJcbiAgICAgIC8vIFRPRE86UEFUQ0hcclxuICAgICAgdGhpcy5odHRwKHtcclxuICAgICAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vdXNlcnNgLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICBmaWx0ZXI6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIFwiZmllbGROYW1lXCI6IFwiZW1haWxcIixcclxuICAgICAgICAgICAgICBcIm9wZXJhdG9yXCI6IFwiZXF1YWxzXCIsXHJcbiAgICAgICAgICAgICAgXCJ2YWx1ZVwiOiByZXNwb25zZS5kYXRhLnVzZXJuYW1lXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIF1cclxuICAgICAgICB9LFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihwYXRjaCA9PiB7XHJcbiAgICAgICAgbGV0IHtpZCwgZmlyc3ROYW1lLCBsYXN0TmFtZX0gPSBwYXRjaC5kYXRhLmRhdGFbMF07XG4gICAgICAgIGxldCB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xuICAgICAgICBsZXQgbmV3RGV0YWlscyA9ICB7dXNlcklkOiBpZC50b1N0cmluZygpLCBmaXJzdE5hbWUsIGxhc3ROYW1lfTtcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcbiAgICAgICAgICB0b2tlbjogdXNlci50b2tlbixcbiAgICAgICAgICBkZXRhaWxzOiBPYmplY3QuYXNzaWduKHt9LCB1c2VyLmRldGFpbHMsIG5ld0RldGFpbHMpXG4gICAgICAgIH0pO1xuICAgICAgICB1c2VyID0gdGhpcy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgICAgIGxldCByZXMgPSBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18ocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCByZXNwb25zZS5oZWFkZXJzLCB1c2VyLmRldGFpbHMpO1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzKTtcclxuICAgICAgICByZXNvbHZlKHJlcyk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICAgIC8vIEVPUFxyXG4gICAgfSlcclxuICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn07XHJcbmV4cG9ydCBmdW5jdGlvbiBzb2NpYWxTaWdudXAgKHByb3ZpZGVyLCBlbWFpbCwgc2NiLCBlY2IsIHNwZWMgPSAnbGVmdD0xLCB0b3A9MSwgd2lkdGg9NTAwLCBoZWlnaHQ9NTYwJykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBfX3NvY2lhbEF1dGhfXy5jYWxsKHRoaXMsIHByb3ZpZGVyLCB0cnVlLCBzcGVjLCBlbWFpbClcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICAgIGlmKGRlZmF1bHRzLnJ1blNpZ25pbkFmdGVyU2lnbnVwKSB7XHJcbiAgICAgICAgICByZXR1cm4gX19zaWduaW5XaXRoVG9rZW5fXy5jYWxsKHRoaXMsIHtcclxuICAgICAgICAgICAgYWNjZXNzVG9rZW46IHJlc3BvbnNlLmRhdGEuYWNjZXNzX3Rva2VuXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gIH0pO1xyXG5cclxufVxyXG5mdW5jdGlvbiBfX3NpZ25pbldpdGhUb2tlbl9fICh0b2tlbkRhdGEpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IGRhdGEgPSBbXTtcclxuICAgIGZvciAobGV0IG9iaiBpbiB0b2tlbkRhdGEpIHtcclxuICAgICAgICBkYXRhLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KG9iaikgKyAnPScgKyBlbmNvZGVVUklDb21wb25lbnQodG9rZW5EYXRhW29ial0pKTtcclxuICAgIH1cclxuICAgIGRhdGEgPSBkYXRhLmpvaW4oXCImXCIpO1xyXG5cclxuICAgIHRoaXMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy50b2tlbixcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIGhlYWRlcnM6IHtcclxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcclxuICAgICAgfSxcclxuICAgICAgZGF0YTogYCR7ZGF0YX0mYXBwTmFtZT0ke2RlZmF1bHRzLmFwcE5hbWV9JmdyYW50X3R5cGU9cGFzc3dvcmRgXHJcbiAgICB9KVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0KCd1c2VyJywge1xyXG4gICAgICAgIHRva2VuOiB7XHJcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW59YFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZGV0YWlsczogcmVzcG9uc2UuZGF0YVxyXG4gICAgICB9KTtcclxuICAgICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05JTik7XHJcbiAgICAgIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgICAgICB0aGlzLnNvY2tldC5jb25uZWN0KHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbi5BdXRob3JpemF0aW9uLCBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbiwgZGVmYXVsdHMuYXBwTmFtZSk7XHJcbiAgICAgIH1cclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xyXG4gICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgfSk7XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHJlcXVlc3RSZXNldFBhc3N3b3JkICh1c2VybmFtZSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5yZXF1ZXN0UmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGFwcE5hbWU6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgICAgdXNlcm5hbWVcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRQYXNzd29yZCAobmV3UGFzc3dvcmQsIHJlc2V0VG9rZW4sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMucmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG5ld1Bhc3N3b3JkLFxyXG4gICAgICAgIHJlc2V0VG9rZW5cclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY2hhbmdlUGFzc3dvcmQgKG9sZFBhc3N3b3JkLCBuZXdQYXNzd29yZCwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogVVJMUy5jaGFuZ2VQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG9sZFBhc3N3b3JkLFxyXG4gICAgICAgIG5ld1Bhc3N3b3JkXHJcbiAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25vdXQgKHNjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICB0aGlzLnN0b3JhZ2UucmVtb3ZlKCd1c2VyJyk7XHJcbiAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmRpc2Nvbm5lY3QoKTtcclxuICAgIH1cclxuICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOT1VUKTtcclxuICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKSkpO1xyXG4gICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdGhpcy5zdG9yYWdlLmdldCgndXNlcicpKSk7XHJcbiAgfSk7XHJcbn1cclxuZnVuY3Rpb24gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18gKCkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlcikge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgdXNlci5kZXRhaWxzKSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFVzZXJEZXRhaWxzKHNjYiwgZWNiLCBmb3JjZSA9IGZhbHNlKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGlmIChmb3JjZSkge1xyXG4gICAgICB0aGlzLmh0dHAoe1xyXG4gICAgICAgIHVybDogVVJMUy5wcm9maWxlLFxyXG4gICAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIH0pXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBsZXQgdXNlciA9IHRoaXMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgICAgICBsZXQgbmV3RGV0YWlscyA9IHJlc3BvbnNlLmRhdGE7XHJcbiAgICAgICAgdGhpcy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgICAgIHRva2VuOiB1c2VyLnRva2VuLFxyXG4gICAgICAgICAgZGV0YWlsczogT2JqZWN0LmFzc2lnbih7fSwgdXNlci5kZXRhaWxzLCBuZXdEZXRhaWxzKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXy5jYWxsKHRoaXMpO1xyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18uY2FsbCh0aGlzKVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgVVJMUywgRVZFTlRTLCBTT0NJQUxfUFJPVklERVJTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5mdW5jdGlvbiBfX2FsbG93ZWRQYXJhbXNfXyAoYWxsb3dlZFBhcmFtcywgcGFyYW1zKSB7XHJcbiAgbGV0IG5ld1BhcmFtcyA9IHt9O1xyXG4gIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xyXG4gICAgaWYgKGFsbG93ZWRQYXJhbXMuaW5kZXhPZihwYXJhbSkgIT0gLTEpIHtcclxuICAgICAgbmV3UGFyYW1zW3BhcmFtXSA9IHBhcmFtc1twYXJhbV07XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBuZXdQYXJhbXM7XHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3QgKG9iamVjdCwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgY29uc3QgYWxsb3dlZFBhcmFtcyA9IFsncGFnZVNpemUnLCdwYWdlTnVtYmVyJywnZmlsdGVyJywnc29ydCcsJ3NlYXJjaCcsJ2V4Y2x1ZGUnLCdkZWVwJywncmVsYXRlZE9iamVjdHMnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlIChvYmplY3QsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRPbmUgKG9iamVjdCwgaWQsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ2RlZXAnLCdleGNsdWRlJywnbGV2ZWwnXTtcclxuICByZXR1cm4gdGhpcy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlIChvYmplY3QsIGlkLCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICBjb25zdCBhbGxvd2VkUGFyYW1zID0gWydyZXR1cm5PYmplY3QnLCdkZWVwJ107XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICBkYXRhLFxyXG4gICAgcGFyYW1zOiBfX2FsbG93ZWRQYXJhbXNfXyhhbGxvd2VkUGFyYW1zLCBwYXJhbXMpLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiByZW1vdmUgKG9iamVjdCwgaWQsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9LyR7aWR9YCxcclxuICAgIG1ldGhvZDogJ0RFTEVURScsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZXhwb3J0IGZ1bmN0aW9uIHRyaWdnZXIgKG9iamVjdCwgZmlsZUFjdGlvbiwgZGF0YSA9IHt9LCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbiIsImltcG9ydCB7IFVSTFMsIEVWRU5UUywgU09DSUFMX1BST1ZJREVSUyB9IGZyb20gJy4vLi4vY29uc3RhbnRzJ1xuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkRmlsZSAob2JqZWN0LCBmaWxlQWN0aW9uLCBmaWxlbmFtZSwgZmlsZWRhdGEsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIHRoaXMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHtmaWxlQWN0aW9ufWAsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgICBmaWxlZGF0YTogZmlsZWRhdGEuc3Vic3RyKGZpbGVkYXRhLmluZGV4T2YoJywnKSArIDEsIGZpbGVkYXRhLmxlbmd0aClcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVGaWxlIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiB0aGlzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG4iLCJpbXBvcnQgeyBQcm9taXNlIH0gZnJvbSAnZXM2LXByb21pc2UnXHJcblxyXG5jbGFzcyBIdHRwIHtcclxuICBjb25zdHJ1Y3RvciAoY29uZmlnID0ge30pIHtcclxuICAgIGlmICghd2luZG93LlhNTEh0dHBSZXF1ZXN0KVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1hNTEh0dHBSZXF1ZXN0IGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG5cclxuICAgIHRoaXMuY29uZmlnID0gT2JqZWN0LmFzc2lnbih7XHJcbiAgICAgIC8vIHVybDogJy8nLFxyXG4gICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICBoZWFkZXJzOiB7fSxcclxuICAgICAgcGFyYW1zOiB7fSxcclxuICAgICAgaW50ZXJjZXB0b3JzOiB7fSxcclxuICAgICAgd2l0aENyZWRlbnRpYWxzOiBmYWxzZSxcclxuICAgICAgcmVzcG9uc2VUeXBlOiAnanNvbicsXHJcbiAgICAgIC8vIHRpbWVvdXQ6IG51bGwsXHJcbiAgICAgIGF1dGg6IHtcclxuICAgICAgIHVzZXJuYW1lOiBudWxsLFxyXG4gICAgICAgcGFzc3dvcmQ6IG51bGxcclxuICAgICAgfVxyXG4gICAgfSwgY29uZmlnKVxyXG4gIH1cclxuICBfZ2V0SGVhZGVycyAoaGVhZGVycykge1xyXG4gICAgcmV0dXJuIGhlYWRlcnMuc3BsaXQoJ1xcclxcbicpLmZpbHRlcihoZWFkZXIgPT4gaGVhZGVyKS5tYXAoaGVhZGVyID0+IHtcclxuICAgICAgbGV0IGpoZWFkZXIgPSB7fVxyXG4gICAgICBsZXQgcGFydHMgPSBoZWFkZXIuc3BsaXQoJzonKTtcclxuICAgICAgamhlYWRlcltwYXJ0c1swXV0gPSBwYXJ0c1sxXVxyXG4gICAgICByZXR1cm4gamhlYWRlcjtcclxuICAgIH0pO1xyXG4gIH1cclxuICBfZ2V0RGF0YSAodHlwZSwgZGF0YSkge1xyXG4gICAgaWYgKCF0eXBlKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodHlwZS5pbmRleE9mKCdqc29uJykgPT09IC0xKSB7XHJcbiAgICAgIHJldHVybiBkYXRhO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xyXG4gICAgfVxyXG4gIH1cclxuICBfY3JlYXRlUmVzcG9uc2UgKHJlcSwgY29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXM6IHJlcS5zdGF0dXMsXHJcbiAgICAgIHN0YXR1c1RleHQ6IHJlcS5zdGF0dXNUZXh0LFxyXG4gICAgICBoZWFkZXJzOiB0aGlzLl9nZXRIZWFkZXJzKHJlcS5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSksXHJcbiAgICAgIGNvbmZpZyxcclxuICAgICAgZGF0YTogdGhpcy5fZ2V0RGF0YShyZXEuZ2V0UmVzcG9uc2VIZWFkZXIoXCJDb250ZW50LVR5cGVcIiksIHJlcS5yZXNwb25zZVRleHQpLFxyXG4gICAgfVxyXG4gIH1cclxuICBfaGFuZGxlRXJyb3IgKGRhdGEsIGNvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3RhdHVzOiAwLFxyXG4gICAgICBzdGF0dXNUZXh0OiAnRVJST1InLFxyXG4gICAgICBoZWFkZXJzOiBbXSxcclxuICAgICAgY29uZmlnLFxyXG4gICAgICBkYXRhLFxyXG4gICAgfVxyXG4gIH1cclxuICBfZW5jb2RlUGFyYW1zIChwYXJhbXMpIHtcclxuICAgIGxldCBwYXJhbXNBcnIgPSBbXTtcclxuICAgIGZvciAobGV0IHBhcmFtIGluIHBhcmFtcykge1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1twYXJhbV07XG4gICAgICBpZiAodHlwZW9mIHZhbCA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICB2YWwgPSBKU09OLnN0cmluZ2lmeSh2YWwpO1xyXG4gICAgICB9XHJcbiAgICAgIHBhcmFtc0Fyci5wdXNoKGAke3BhcmFtfT0ke2VuY29kZVVSSUNvbXBvbmVudCh2YWwpfWApXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcGFyYW1zQXJyLmpvaW4oJyYnKTtcclxuICB9XHJcbiAgX3NldEhlYWRlcnMgKHJlcSwgaGVhZGVycykge1xyXG4gICAgZm9yIChsZXQgaGVhZGVyIGluIGhlYWRlcnMpIHtcclxuICAgICAgcmVxLnNldFJlcXVlc3RIZWFkZXIoaGVhZGVyLCBoZWFkZXJzW2hlYWRlcl0pO1xyXG4gICAgfVxyXG4gIH1cclxuICBfc2V0RGF0YSAocmVxLCBkYXRhKSB7XHJcbiAgICBpZiAoIWRhdGEpIHtcclxuICAgICAgcmVxLnNlbmQoKTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKHR5cGVvZiBkYXRhICE9ICdvYmplY3QnKSB7XHJcbiAgICAgIHJlcS5zZW5kKGRhdGEpO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIHJlcS5zZXRSZXF1ZXN0SGVhZGVyKFwiQ29udGVudC1UeXBlXCIsIFwiYXBwbGljYXRpb24vanNvbjtjaGFyc2V0PVVURi04XCIpO1xyXG4gICAgICByZXEuc2VuZChKU09OLnN0cmluZ2lmeShkYXRhKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJlcXVlc3QgKGNmZywgc2NiICwgZWNiKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG5cclxuICAgICAgbGV0IHJlcSA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG4gICAgICBsZXQgY29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb25maWcsIGNmZyk7XHJcblxyXG4gICAgICBpZiAoIWNvbmZpZy51cmwgfHwgdHlwZW9mIGNvbmZpZy51cmwgIT09ICdzdHJpbmcnIHx8IGNvbmZpZy51cmwubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2hhbmRsZUVycm9yKCd1cmwgcGFyYW1ldGVyIGlzIG1pc3NpbmcnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoY29uZmlnLndpdGhDcmVkZW50aWFscykgeyByZXEud2l0aENyZWRlbnRpYWxzID0gdHJ1ZSB9XHJcbiAgICAgIGlmIChjb25maWcudGltZW91dCkgeyByZXEudGltZW91dCA9IHRydWUgfVxyXG4gICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlcXVlc3QgJiYgY29uZmlnLmludGVyY2VwdG9ycy5yZXF1ZXN0LmNhbGwodGhpcywgY29uZmlnKTtcclxuICAgICAgbGV0IHBhcmFtcyA9IHRoaXMuX2VuY29kZVBhcmFtcyhjb25maWcucGFyYW1zKTtcclxuICAgICAgcmVxLm9wZW4oY29uZmlnLm1ldGhvZCwgYCR7Y29uZmlnLmJhc2VVUkwgPyBjb25maWcuYmFzZVVSTCsnLycgOiAnJ30ke2NvbmZpZy51cmx9JHtwYXJhbXMgPyAnPycrcGFyYW1zIDogJyd9YCwgdHJ1ZSwgY29uZmlnLmF1dGgudXNlcm5hbWUsIGNvbmZpZy5hdXRoLnBhc3N3b3JkKTtcclxuICAgICAgcmVxLm9udGltZW91dCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcigndGltZW91dCcsIGNvbmZpZyk7XHJcbiAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9O1xyXG4gICAgICByZXEub25hYm9ydCA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGxldCByZXMgPSB0aGlzLl9oYW5kbGVFcnJvcignYWJvcnQnLCBjb25maWcpO1xyXG4gICAgICAgIGVjYiAmJiBlY2IocmVzKTtcclxuICAgICAgICByZWplY3QocmVzKTtcclxuICAgICAgfTtcclxuICAgICAgcmVxLm9ucmVhZHlzdGF0ZWNoYW5nZSA9ICgpID0+IHtcclxuICAgICAgICBpZiAocmVxLnJlYWR5U3RhdGUgPT0gWE1MSHR0cFJlcXVlc3QuRE9ORSkge1xyXG4gICAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2NyZWF0ZVJlc3BvbnNlKHJlcSwgY29uZmlnKTtcclxuICAgICAgICAgIGlmIChyZXMuc3RhdHVzID09PSAyMDApe1xyXG4gICAgICAgICAgICBpZiAoY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZSkge1xyXG4gICAgICAgICAgICAgIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2UuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgc2NiICYmIHNjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlc29sdmUocmVzKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIGlmIChjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IpIHtcclxuICAgICAgICAgICAgICBjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlRXJyb3IuY2FsbCh0aGlzLCByZXMsIGNvbmZpZywgcmVzb2x2ZSwgcmVqZWN0LCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHRoaXMuX3NldEhlYWRlcnMocmVxLCBjb25maWcuaGVhZGVycyk7XHJcbiAgICAgIHRoaXMuX3NldERhdGEocmVxLCBjb25maWcuZGF0YSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG59XHJcbmZ1bmN0aW9uIGNyZWF0ZUluc3RhbmNlKGNvbmZpZyA9IHt9KSB7XHJcbiAgdmFyIGNvbnRleHQgPSBuZXcgSHR0cChjb25maWcpO1xyXG4gIHZhciBpbnN0YW5jZSA9ICguLi5hcmdzKSA9PiBIdHRwLnByb3RvdHlwZS5yZXF1ZXN0LmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xyXG4gIGluc3RhbmNlLmNvbmZpZyA9IGNvbnRleHQuY29uZmlnO1xyXG4gIHJldHVybiBpbnN0YW5jZTtcclxufVxyXG5cclxudmFyIGh0dHAgPSBjcmVhdGVJbnN0YW5jZSgpO1xyXG5odHRwLmNyZWF0ZSA9IChjb25maWcpID0+IHtcclxuICByZXR1cm4gY3JlYXRlSW5zdGFuY2UoY29uZmlnKTtcclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGh0dHA7XHJcbndpbmRvdy5odHRwID0gd2luZG93Lmh0dHAgfHwgaHR0cDtcclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU29ja2V0IHtcclxuICBjb25zdHJ1Y3RvciAodXJsKSB7XHJcbiAgICBpZiAoIXdpbmRvdy5pbylcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdydW5Tb2NrZXQgaXMgdHJ1ZSBidXQgc29ja2V0aW8tY2xpZW50IGlzIG5vdCBpbmNsdWRlZCcpO1xyXG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5vbkFyciA9IFtdO1xuICAgIHRoaXMuc29ja2V0ID0gbnVsbDtcbiAgfVxyXG4gIG9uIChldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLm9uQXJyLnB1c2goe2V2ZW50TmFtZSwgY2FsbGJhY2t9KTtcclxuICB9XHJcbiAgY29ubmVjdCAodG9rZW4sIGFub255bW91c1Rva2VuLCBhcHBOYW1lKSB7XHJcbiAgICB0aGlzLmRpc2Nvbm5lY3QoKTtcclxuICAgIHRoaXMuc29ja2V0ID0gaW8uY29ubmVjdCh0aGlzLnVybCwgeydmb3JjZU5ldyc6dHJ1ZSB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignY29ubmVjdCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGB0cnlpbmcgdG8gZXN0YWJsaXNoIGEgc29ja2V0IGNvbm5lY3Rpb24gdG8gJHthcHBOYW1lfSAuLi5gKTtcclxuICAgICAgdGhpcy5zb2NrZXQuZW1pdChcImxvZ2luXCIsIHRva2VuLCBhbm9ueW1vdXNUb2tlbiwgYXBwTmFtZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignYXV0aG9yaXplZCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgY29ubmVjdGVkYCk7XHJcbiAgICAgIHRoaXMub25BcnIuZm9yRWFjaChmbiA9PiB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQub24oZm4uZXZlbnROYW1lLCBkYXRhID0+IHtcclxuICAgICAgICAgIGZuLmNhbGxiYWNrKGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdub3RBdXRob3JpemVkJywgKCkgPT4ge1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZGlzY29ubmVjdCgpLCAxMDAwKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCBkaXNjb25uZWN0YCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbigncmVjb25uZWN0aW5nJywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCByZWNvbm5lY3RpbmdgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLndhcm4oYGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGRpc2Nvbm5lY3QgKCkge1xyXG4gICAgaWYgKHRoaXMuc29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFN0b3JhZ2Uge1xyXG4gIGNvbnN0cnVjdG9yIChzdG9yYWdlLCBwcmVmaXggPSAnJykge1xyXG4gICAgaWYgKCFzdG9yYWdlKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG4gICAgaWYgKCFzdG9yYWdlLnNldEl0ZW0gfHwgIXN0b3JhZ2UuZ2V0SXRlbSB8fCAhc3RvcmFnZS5yZW1vdmVJdGVtIHx8ICFzdG9yYWdlLmNsZWFyKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIG5vdCBpbXBsZW1lbnQgdGhlIG5lY2Vzc2FyeSBmdW5jdGlvbnMnKTtcclxuICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XHJcbiAgICB0aGlzLnByZWZpeCA9IHByZWZpeDtcclxuICAgIHRoaXMuZGVsaW1pdGVyID0gJ19fX19fX19fX18nO1xyXG4gIH1cclxuICBnZXQgKGtleSkge1xyXG4gICAgbGV0IGl0ZW0gPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICAgIGlmICghaXRlbSkge1xyXG4gICAgICByZXR1cm4gaXRlbVxyXG4gICAgfVxyXG4gICAgZWxzZSB7XG4gICAgICBsZXQgW3R5cGUsIHZhbF0gPSBpdGVtLnNwbGl0KHRoaXMuZGVsaW1pdGVyKTtcbiAgICAgIGlmICh0eXBlICE9ICdKU09OJykge1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbCk7XG4gICAgICB9XG4gICAgfVxyXG4gIH1cclxuICBzZXQgKGtleSwgdmFsKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbCAhPSAnb2JqZWN0Jykge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgU1RSSU5HJHt0aGlzLmRlbGltaXRlcn0ke3ZhbH1gKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgSlNPTiR7dGhpcy5kZWxpbWl0ZXJ9JHtKU09OLnN0cmluZ2lmeSh2YWwpfWApO1xyXG4gICAgfVxyXG4gIH1cclxuICByZW1vdmUgKGtleSkge1xyXG4gICAgdGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oYCR7dGhpcy5wcmVmaXh9JHtrZXl9YCk7XHJcbiAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIGZvcih2YXIgaSA9MDsgaSA8IHRoaXMuc3RvcmFnZS5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICBpZih0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2Uua2V5KGkpKS5pbmRleE9mKHRoaXMucHJlZml4KSAhPSAtMSlcclxuICAgICAgICB0aGlzLnJlbW92ZSh0aGlzLnN0b3JhZ2Uua2V5KGkpKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXX0=
