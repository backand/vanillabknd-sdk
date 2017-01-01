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
    utils: utils
  });
  if (_defaults2.default.runSocket) {
    backand.utils.storage.get('user') && backand.utils.socket.connect(backand.utils.storage.get('user').token.Authorization || null, _defaults2.default.anonymousToken, _defaults2.default.appName);
    _extends(backand, { on: backand.utils.socket.on.bind(backand.utils.socket) });
  }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZXM2LXByb21pc2UvZGlzdC9lczYtcHJvbWlzZS5qcyIsIm5vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJzcmNcXGNvbnN0YW50cy5qcyIsInNyY1xcZGVmYXVsdHMuanMiLCJzcmNcXGhlbHBlcnMuanMiLCJzcmNcXGluZGV4LmpzIiwic3JjXFxzZXJ2aWNlc1xcYXV0aC5qcyIsInNyY1xcc2VydmljZXNcXGZpbGUuanMiLCJzcmNcXHNlcnZpY2VzXFxvYmplY3QuanMiLCJzcmNcXHNlcnZpY2VzXFxxdWVyeS5qcyIsInNyY1xcc2VydmljZXNcXHVzZXIuanMiLCJzcmNcXHV0aWxzXFxodHRwLmpzIiwic3JjXFx1dGlsc1xcc29ja2V0LmpzIiwic3JjXFx1dGlsc1xcc3RvcmFnZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDcG9DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ3BMTyxJQUFNLDBCQUFTO0FBQ3BCLFVBQVEsUUFEWTtBQUVwQixXQUFTLFNBRlc7QUFH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IiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qIVxuICogQG92ZXJ2aWV3IGVzNi1wcm9taXNlIC0gYSB0aW55IGltcGxlbWVudGF0aW9uIG9mIFByb21pc2VzL0ErLlxuICogQGNvcHlyaWdodCBDb3B5cmlnaHQgKGMpIDIwMTQgWWVodWRhIEthdHosIFRvbSBEYWxlLCBTdGVmYW4gUGVubmVyIGFuZCBjb250cmlidXRvcnMgKENvbnZlcnNpb24gdG8gRVM2IEFQSSBieSBKYWtlIEFyY2hpYmFsZClcbiAqIEBsaWNlbnNlICAgTGljZW5zZWQgdW5kZXIgTUlUIGxpY2Vuc2VcbiAqICAgICAgICAgICAgU2VlIGh0dHBzOi8vcmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbS9zdGVmYW5wZW5uZXIvZXM2LXByb21pc2UvbWFzdGVyL0xJQ0VOU0VcbiAqIEB2ZXJzaW9uICAgNC4wLjVcbiAqL1xuXG4oZnVuY3Rpb24gKGdsb2JhbCwgZmFjdG9yeSkge1xuICAgIHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyA/IG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpIDpcbiAgICB0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuICAgIChnbG9iYWwuRVM2UHJvbWlzZSA9IGZhY3RvcnkoKSk7XG59KHRoaXMsIChmdW5jdGlvbiAoKSB7ICd1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gb2JqZWN0T3JGdW5jdGlvbih4KSB7XG4gIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgeCA9PT0gJ29iamVjdCcgJiYgeCAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNGdW5jdGlvbih4KSB7XG4gIHJldHVybiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJztcbn1cblxudmFyIF9pc0FycmF5ID0gdW5kZWZpbmVkO1xuaWYgKCFBcnJheS5pc0FycmF5KSB7XG4gIF9pc0FycmF5ID0gZnVuY3Rpb24gKHgpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHgpID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9O1xufSBlbHNlIHtcbiAgX2lzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xufVxuXG52YXIgaXNBcnJheSA9IF9pc0FycmF5O1xuXG52YXIgbGVuID0gMDtcbnZhciB2ZXJ0eE5leHQgPSB1bmRlZmluZWQ7XG52YXIgY3VzdG9tU2NoZWR1bGVyRm4gPSB1bmRlZmluZWQ7XG5cbnZhciBhc2FwID0gZnVuY3Rpb24gYXNhcChjYWxsYmFjaywgYXJnKSB7XG4gIHF1ZXVlW2xlbl0gPSBjYWxsYmFjaztcbiAgcXVldWVbbGVuICsgMV0gPSBhcmc7XG4gIGxlbiArPSAyO1xuICBpZiAobGVuID09PSAyKSB7XG4gICAgLy8gSWYgbGVuIGlzIDIsIHRoYXQgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHNjaGVkdWxlIGFuIGFzeW5jIGZsdXNoLlxuICAgIC8vIElmIGFkZGl0aW9uYWwgY2FsbGJhY2tzIGFyZSBxdWV1ZWQgYmVmb3JlIHRoZSBxdWV1ZSBpcyBmbHVzaGVkLCB0aGV5XG4gICAgLy8gd2lsbCBiZSBwcm9jZXNzZWQgYnkgdGhpcyBmbHVzaCB0aGF0IHdlIGFyZSBzY2hlZHVsaW5nLlxuICAgIGlmIChjdXN0b21TY2hlZHVsZXJGbikge1xuICAgICAgY3VzdG9tU2NoZWR1bGVyRm4oZmx1c2gpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzY2hlZHVsZUZsdXNoKCk7XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiBzZXRTY2hlZHVsZXIoc2NoZWR1bGVGbikge1xuICBjdXN0b21TY2hlZHVsZXJGbiA9IHNjaGVkdWxlRm47XG59XG5cbmZ1bmN0aW9uIHNldEFzYXAoYXNhcEZuKSB7XG4gIGFzYXAgPSBhc2FwRm47XG59XG5cbnZhciBicm93c2VyV2luZG93ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiB1bmRlZmluZWQ7XG52YXIgYnJvd3Nlckdsb2JhbCA9IGJyb3dzZXJXaW5kb3cgfHwge307XG52YXIgQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIgPSBicm93c2VyR2xvYmFsLk11dGF0aW9uT2JzZXJ2ZXIgfHwgYnJvd3Nlckdsb2JhbC5XZWJLaXRNdXRhdGlvbk9ic2VydmVyO1xudmFyIGlzTm9kZSA9IHR5cGVvZiBzZWxmID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcHJvY2VzcyAhPT0gJ3VuZGVmaW5lZCcgJiYgKHt9KS50b1N0cmluZy5jYWxsKHByb2Nlc3MpID09PSAnW29iamVjdCBwcm9jZXNzXSc7XG5cbi8vIHRlc3QgZm9yIHdlYiB3b3JrZXIgYnV0IG5vdCBpbiBJRTEwXG52YXIgaXNXb3JrZXIgPSB0eXBlb2YgVWludDhDbGFtcGVkQXJyYXkgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBpbXBvcnRTY3JpcHRzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09ICd1bmRlZmluZWQnO1xuXG4vLyBub2RlXG5mdW5jdGlvbiB1c2VOZXh0VGljaygpIHtcbiAgLy8gbm9kZSB2ZXJzaW9uIDAuMTAueCBkaXNwbGF5cyBhIGRlcHJlY2F0aW9uIHdhcm5pbmcgd2hlbiBuZXh0VGljayBpcyB1c2VkIHJlY3Vyc2l2ZWx5XG4gIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vY3Vqb2pzL3doZW4vaXNzdWVzLzQxMCBmb3IgZGV0YWlsc1xuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBwcm9jZXNzLm5leHRUaWNrKGZsdXNoKTtcbiAgfTtcbn1cblxuLy8gdmVydHhcbmZ1bmN0aW9uIHVzZVZlcnR4VGltZXIoKSB7XG4gIGlmICh0eXBlb2YgdmVydHhOZXh0ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2ZXJ0eE5leHQoZmx1c2gpO1xuICAgIH07XG4gIH1cblxuICByZXR1cm4gdXNlU2V0VGltZW91dCgpO1xufVxuXG5mdW5jdGlvbiB1c2VNdXRhdGlvbk9ic2VydmVyKCkge1xuICB2YXIgaXRlcmF0aW9ucyA9IDA7XG4gIHZhciBvYnNlcnZlciA9IG5ldyBCcm93c2VyTXV0YXRpb25PYnNlcnZlcihmbHVzaCk7XG4gIHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJycpO1xuICBvYnNlcnZlci5vYnNlcnZlKG5vZGUsIHsgY2hhcmFjdGVyRGF0YTogdHJ1ZSB9KTtcblxuICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgIG5vZGUuZGF0YSA9IGl0ZXJhdGlvbnMgPSArK2l0ZXJhdGlvbnMgJSAyO1xuICB9O1xufVxuXG4vLyB3ZWIgd29ya2VyXG5mdW5jdGlvbiB1c2VNZXNzYWdlQ2hhbm5lbCgpIHtcbiAgdmFyIGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcbiAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBmbHVzaDtcbiAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gY2hhbm5lbC5wb3J0Mi5wb3N0TWVzc2FnZSgwKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlU2V0VGltZW91dCgpIHtcbiAgLy8gU3RvcmUgc2V0VGltZW91dCByZWZlcmVuY2Ugc28gZXM2LXByb21pc2Ugd2lsbCBiZSB1bmFmZmVjdGVkIGJ5XG4gIC8vIG90aGVyIGNvZGUgbW9kaWZ5aW5nIHNldFRpbWVvdXQgKGxpa2Ugc2lub24udXNlRmFrZVRpbWVycygpKVxuICB2YXIgZ2xvYmFsU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIGdsb2JhbFNldFRpbWVvdXQoZmx1c2gsIDEpO1xuICB9O1xufVxuXG52YXIgcXVldWUgPSBuZXcgQXJyYXkoMTAwMCk7XG5mdW5jdGlvbiBmbHVzaCgpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkgKz0gMikge1xuICAgIHZhciBjYWxsYmFjayA9IHF1ZXVlW2ldO1xuICAgIHZhciBhcmcgPSBxdWV1ZVtpICsgMV07XG5cbiAgICBjYWxsYmFjayhhcmcpO1xuXG4gICAgcXVldWVbaV0gPSB1bmRlZmluZWQ7XG4gICAgcXVldWVbaSArIDFdID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgbGVuID0gMDtcbn1cblxuZnVuY3Rpb24gYXR0ZW1wdFZlcnR4KCkge1xuICB0cnkge1xuICAgIHZhciByID0gcmVxdWlyZTtcbiAgICB2YXIgdmVydHggPSByKCd2ZXJ0eCcpO1xuICAgIHZlcnR4TmV4dCA9IHZlcnR4LnJ1bk9uTG9vcCB8fCB2ZXJ0eC5ydW5PbkNvbnRleHQ7XG4gICAgcmV0dXJuIHVzZVZlcnR4VGltZXIoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiB1c2VTZXRUaW1lb3V0KCk7XG4gIH1cbn1cblxudmFyIHNjaGVkdWxlRmx1c2ggPSB1bmRlZmluZWQ7XG4vLyBEZWNpZGUgd2hhdCBhc3luYyBtZXRob2QgdG8gdXNlIHRvIHRyaWdnZXJpbmcgcHJvY2Vzc2luZyBvZiBxdWV1ZWQgY2FsbGJhY2tzOlxuaWYgKGlzTm9kZSkge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlTmV4dFRpY2soKTtcbn0gZWxzZSBpZiAoQnJvd3Nlck11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU11dGF0aW9uT2JzZXJ2ZXIoKTtcbn0gZWxzZSBpZiAoaXNXb3JrZXIpIHtcbiAgc2NoZWR1bGVGbHVzaCA9IHVzZU1lc3NhZ2VDaGFubmVsKCk7XG59IGVsc2UgaWYgKGJyb3dzZXJXaW5kb3cgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcmVxdWlyZSA9PT0gJ2Z1bmN0aW9uJykge1xuICBzY2hlZHVsZUZsdXNoID0gYXR0ZW1wdFZlcnR4KCk7XG59IGVsc2Uge1xuICBzY2hlZHVsZUZsdXNoID0gdXNlU2V0VGltZW91dCgpO1xufVxuXG5mdW5jdGlvbiB0aGVuKG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gIHZhciBfYXJndW1lbnRzID0gYXJndW1lbnRzO1xuXG4gIHZhciBwYXJlbnQgPSB0aGlzO1xuXG4gIHZhciBjaGlsZCA9IG5ldyB0aGlzLmNvbnN0cnVjdG9yKG5vb3ApO1xuXG4gIGlmIChjaGlsZFtQUk9NSVNFX0lEXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbWFrZVByb21pc2UoY2hpbGQpO1xuICB9XG5cbiAgdmFyIF9zdGF0ZSA9IHBhcmVudC5fc3RhdGU7XG5cbiAgaWYgKF9zdGF0ZSkge1xuICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY2FsbGJhY2sgPSBfYXJndW1lbnRzW19zdGF0ZSAtIDFdO1xuICAgICAgYXNhcChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBpbnZva2VDYWxsYmFjayhfc3RhdGUsIGNoaWxkLCBjYWxsYmFjaywgcGFyZW50Ll9yZXN1bHQpO1xuICAgICAgfSk7XG4gICAgfSkoKTtcbiAgfSBlbHNlIHtcbiAgICBzdWJzY3JpYmUocGFyZW50LCBjaGlsZCwgb25GdWxmaWxsbWVudCwgb25SZWplY3Rpb24pO1xuICB9XG5cbiAgcmV0dXJuIGNoaWxkO1xufVxuXG4vKipcbiAgYFByb21pc2UucmVzb2x2ZWAgcmV0dXJucyBhIHByb21pc2UgdGhhdCB3aWxsIGJlY29tZSByZXNvbHZlZCB3aXRoIHRoZVxuICBwYXNzZWQgYHZhbHVlYC4gSXQgaXMgc2hvcnRoYW5kIGZvciB0aGUgZm9sbG93aW5nOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHJlc29sdmUoMSk7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gdmFsdWUgPT09IDFcbiAgfSk7XG4gIGBgYFxuXG4gIEluc3RlYWQgb2Ygd3JpdGluZyB0aGUgYWJvdmUsIHlvdXIgY29kZSBub3cgc2ltcGx5IGJlY29tZXMgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKDEpO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gdmFsdWUgPT09IDFcbiAgfSk7XG4gIGBgYFxuXG4gIEBtZXRob2QgcmVzb2x2ZVxuICBAc3RhdGljXG4gIEBwYXJhbSB7QW55fSB2YWx1ZSB2YWx1ZSB0aGF0IHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgYmUgcmVzb2x2ZWQgd2l0aFxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHdpbGwgYmVjb21lIGZ1bGZpbGxlZCB3aXRoIHRoZSBnaXZlblxuICBgdmFsdWVgXG4qL1xuZnVuY3Rpb24gcmVzb2x2ZShvYmplY3QpIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuICBpZiAob2JqZWN0ICYmIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnICYmIG9iamVjdC5jb25zdHJ1Y3RvciA9PT0gQ29uc3RydWN0b3IpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG4gIF9yZXNvbHZlKHByb21pc2UsIG9iamVjdCk7XG4gIHJldHVybiBwcm9taXNlO1xufVxuXG52YXIgUFJPTUlTRV9JRCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cmluZygxNik7XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG52YXIgUEVORElORyA9IHZvaWQgMDtcbnZhciBGVUxGSUxMRUQgPSAxO1xudmFyIFJFSkVDVEVEID0gMjtcblxudmFyIEdFVF9USEVOX0VSUk9SID0gbmV3IEVycm9yT2JqZWN0KCk7XG5cbmZ1bmN0aW9uIHNlbGZGdWxmaWxsbWVudCgpIHtcbiAgcmV0dXJuIG5ldyBUeXBlRXJyb3IoXCJZb3UgY2Fubm90IHJlc29sdmUgYSBwcm9taXNlIHdpdGggaXRzZWxmXCIpO1xufVxuXG5mdW5jdGlvbiBjYW5ub3RSZXR1cm5Pd24oKSB7XG4gIHJldHVybiBuZXcgVHlwZUVycm9yKCdBIHByb21pc2VzIGNhbGxiYWNrIGNhbm5vdCByZXR1cm4gdGhhdCBzYW1lIHByb21pc2UuJyk7XG59XG5cbmZ1bmN0aW9uIGdldFRoZW4ocHJvbWlzZSkge1xuICB0cnkge1xuICAgIHJldHVybiBwcm9taXNlLnRoZW47XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgR0VUX1RIRU5fRVJST1IuZXJyb3IgPSBlcnJvcjtcbiAgICByZXR1cm4gR0VUX1RIRU5fRVJST1I7XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJ5VGhlbih0aGVuLCB2YWx1ZSwgZnVsZmlsbG1lbnRIYW5kbGVyLCByZWplY3Rpb25IYW5kbGVyKSB7XG4gIHRyeSB7XG4gICAgdGhlbi5jYWxsKHZhbHVlLCBmdWxmaWxsbWVudEhhbmRsZXIsIHJlamVjdGlvbkhhbmRsZXIpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGU7XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlLCB0aGVuKSB7XG4gIGFzYXAoZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICB2YXIgc2VhbGVkID0gZmFsc2U7XG4gICAgdmFyIGVycm9yID0gdHJ5VGhlbih0aGVuLCB0aGVuYWJsZSwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICBpZiAoc2VhbGVkKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHNlYWxlZCA9IHRydWU7XG4gICAgICBpZiAodGhlbmFibGUgIT09IHZhbHVlKSB7XG4gICAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIGlmIChzZWFsZWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc2VhbGVkID0gdHJ1ZTtcblxuICAgICAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0sICdTZXR0bGU6ICcgKyAocHJvbWlzZS5fbGFiZWwgfHwgJyB1bmtub3duIHByb21pc2UnKSk7XG5cbiAgICBpZiAoIXNlYWxlZCAmJiBlcnJvcikge1xuICAgICAgc2VhbGVkID0gdHJ1ZTtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgIH1cbiAgfSwgcHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU93blRoZW5hYmxlKHByb21pc2UsIHRoZW5hYmxlKSB7XG4gIGlmICh0aGVuYWJsZS5fc3RhdGUgPT09IEZVTEZJTExFRCkge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gIH0gZWxzZSBpZiAodGhlbmFibGUuX3N0YXRlID09PSBSRUpFQ1RFRCkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgdGhlbmFibGUuX3Jlc3VsdCk7XG4gIH0gZWxzZSB7XG4gICAgc3Vic2NyaWJlKHRoZW5hYmxlLCB1bmRlZmluZWQsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgcmV0dXJuIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICByZXR1cm4gX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSwgdGhlbiQkKSB7XG4gIGlmIChtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yID09PSBwcm9taXNlLmNvbnN0cnVjdG9yICYmIHRoZW4kJCA9PT0gdGhlbiAmJiBtYXliZVRoZW5hYmxlLmNvbnN0cnVjdG9yLnJlc29sdmUgPT09IHJlc29sdmUpIHtcbiAgICBoYW5kbGVPd25UaGVuYWJsZShwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgfSBlbHNlIHtcbiAgICBpZiAodGhlbiQkID09PSBHRVRfVEhFTl9FUlJPUikge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBHRVRfVEhFTl9FUlJPUi5lcnJvcik7XG4gICAgfSBlbHNlIGlmICh0aGVuJCQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZnVsZmlsbChwcm9taXNlLCBtYXliZVRoZW5hYmxlKTtcbiAgICB9IGVsc2UgaWYgKGlzRnVuY3Rpb24odGhlbiQkKSkge1xuICAgICAgaGFuZGxlRm9yZWlnblRoZW5hYmxlKHByb21pc2UsIG1heWJlVGhlbmFibGUsIHRoZW4kJCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZ1bGZpbGwocHJvbWlzZSwgbWF5YmVUaGVuYWJsZSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKSB7XG4gIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgIF9yZWplY3QocHJvbWlzZSwgc2VsZkZ1bGZpbGxtZW50KCkpO1xuICB9IGVsc2UgaWYgKG9iamVjdE9yRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgaGFuZGxlTWF5YmVUaGVuYWJsZShwcm9taXNlLCB2YWx1ZSwgZ2V0VGhlbih2YWx1ZSkpO1xuICB9IGVsc2Uge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHB1Ymxpc2hSZWplY3Rpb24ocHJvbWlzZSkge1xuICBpZiAocHJvbWlzZS5fb25lcnJvcikge1xuICAgIHByb21pc2UuX29uZXJyb3IocHJvbWlzZS5fcmVzdWx0KTtcbiAgfVxuXG4gIHB1Ymxpc2gocHJvbWlzZSk7XG59XG5cbmZ1bmN0aW9uIGZ1bGZpbGwocHJvbWlzZSwgdmFsdWUpIHtcbiAgaWYgKHByb21pc2UuX3N0YXRlICE9PSBQRU5ESU5HKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZS5fcmVzdWx0ID0gdmFsdWU7XG4gIHByb21pc2UuX3N0YXRlID0gRlVMRklMTEVEO1xuXG4gIGlmIChwcm9taXNlLl9zdWJzY3JpYmVycy5sZW5ndGggIT09IDApIHtcbiAgICBhc2FwKHB1Ymxpc2gsIHByb21pc2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKSB7XG4gIGlmIChwcm9taXNlLl9zdGF0ZSAhPT0gUEVORElORykge1xuICAgIHJldHVybjtcbiAgfVxuICBwcm9taXNlLl9zdGF0ZSA9IFJFSkVDVEVEO1xuICBwcm9taXNlLl9yZXN1bHQgPSByZWFzb247XG5cbiAgYXNhcChwdWJsaXNoUmVqZWN0aW9uLCBwcm9taXNlKTtcbn1cblxuZnVuY3Rpb24gc3Vic2NyaWJlKHBhcmVudCwgY2hpbGQsIG9uRnVsZmlsbG1lbnQsIG9uUmVqZWN0aW9uKSB7XG4gIHZhciBfc3Vic2NyaWJlcnMgPSBwYXJlbnQuX3N1YnNjcmliZXJzO1xuICB2YXIgbGVuZ3RoID0gX3N1YnNjcmliZXJzLmxlbmd0aDtcblxuICBwYXJlbnQuX29uZXJyb3IgPSBudWxsO1xuXG4gIF9zdWJzY3JpYmVyc1tsZW5ndGhdID0gY2hpbGQ7XG4gIF9zdWJzY3JpYmVyc1tsZW5ndGggKyBGVUxGSUxMRURdID0gb25GdWxmaWxsbWVudDtcbiAgX3N1YnNjcmliZXJzW2xlbmd0aCArIFJFSkVDVEVEXSA9IG9uUmVqZWN0aW9uO1xuXG4gIGlmIChsZW5ndGggPT09IDAgJiYgcGFyZW50Ll9zdGF0ZSkge1xuICAgIGFzYXAocHVibGlzaCwgcGFyZW50KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwdWJsaXNoKHByb21pc2UpIHtcbiAgdmFyIHN1YnNjcmliZXJzID0gcHJvbWlzZS5fc3Vic2NyaWJlcnM7XG4gIHZhciBzZXR0bGVkID0gcHJvbWlzZS5fc3RhdGU7XG5cbiAgaWYgKHN1YnNjcmliZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBjaGlsZCA9IHVuZGVmaW5lZCxcbiAgICAgIGNhbGxiYWNrID0gdW5kZWZpbmVkLFxuICAgICAgZGV0YWlsID0gcHJvbWlzZS5fcmVzdWx0O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3Vic2NyaWJlcnMubGVuZ3RoOyBpICs9IDMpIHtcbiAgICBjaGlsZCA9IHN1YnNjcmliZXJzW2ldO1xuICAgIGNhbGxiYWNrID0gc3Vic2NyaWJlcnNbaSArIHNldHRsZWRdO1xuXG4gICAgaWYgKGNoaWxkKSB7XG4gICAgICBpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBjaGlsZCwgY2FsbGJhY2ssIGRldGFpbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrKGRldGFpbCk7XG4gICAgfVxuICB9XG5cbiAgcHJvbWlzZS5fc3Vic2NyaWJlcnMubGVuZ3RoID0gMDtcbn1cblxuZnVuY3Rpb24gRXJyb3JPYmplY3QoKSB7XG4gIHRoaXMuZXJyb3IgPSBudWxsO1xufVxuXG52YXIgVFJZX0NBVENIX0VSUk9SID0gbmV3IEVycm9yT2JqZWN0KCk7XG5cbmZ1bmN0aW9uIHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gY2FsbGJhY2soZGV0YWlsKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIFRSWV9DQVRDSF9FUlJPUi5lcnJvciA9IGU7XG4gICAgcmV0dXJuIFRSWV9DQVRDSF9FUlJPUjtcbiAgfVxufVxuXG5mdW5jdGlvbiBpbnZva2VDYWxsYmFjayhzZXR0bGVkLCBwcm9taXNlLCBjYWxsYmFjaywgZGV0YWlsKSB7XG4gIHZhciBoYXNDYWxsYmFjayA9IGlzRnVuY3Rpb24oY2FsbGJhY2spLFxuICAgICAgdmFsdWUgPSB1bmRlZmluZWQsXG4gICAgICBlcnJvciA9IHVuZGVmaW5lZCxcbiAgICAgIHN1Y2NlZWRlZCA9IHVuZGVmaW5lZCxcbiAgICAgIGZhaWxlZCA9IHVuZGVmaW5lZDtcblxuICBpZiAoaGFzQ2FsbGJhY2spIHtcbiAgICB2YWx1ZSA9IHRyeUNhdGNoKGNhbGxiYWNrLCBkZXRhaWwpO1xuXG4gICAgaWYgKHZhbHVlID09PSBUUllfQ0FUQ0hfRVJST1IpIHtcbiAgICAgIGZhaWxlZCA9IHRydWU7XG4gICAgICBlcnJvciA9IHZhbHVlLmVycm9yO1xuICAgICAgdmFsdWUgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdWNjZWVkZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChwcm9taXNlID09PSB2YWx1ZSkge1xuICAgICAgX3JlamVjdChwcm9taXNlLCBjYW5ub3RSZXR1cm5Pd24oKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhbHVlID0gZGV0YWlsO1xuICAgIHN1Y2NlZWRlZCA9IHRydWU7XG4gIH1cblxuICBpZiAocHJvbWlzZS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICAvLyBub29wXG4gIH0gZWxzZSBpZiAoaGFzQ2FsbGJhY2sgJiYgc3VjY2VlZGVkKSB7XG4gICAgICBfcmVzb2x2ZShwcm9taXNlLCB2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChmYWlsZWQpIHtcbiAgICAgIF9yZWplY3QocHJvbWlzZSwgZXJyb3IpO1xuICAgIH0gZWxzZSBpZiAoc2V0dGxlZCA9PT0gRlVMRklMTEVEKSB7XG4gICAgICBmdWxmaWxsKHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKHNldHRsZWQgPT09IFJFSkVDVEVEKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGluaXRpYWxpemVQcm9taXNlKHByb21pc2UsIHJlc29sdmVyKSB7XG4gIHRyeSB7XG4gICAgcmVzb2x2ZXIoZnVuY3Rpb24gcmVzb2x2ZVByb21pc2UodmFsdWUpIHtcbiAgICAgIF9yZXNvbHZlKHByb21pc2UsIHZhbHVlKTtcbiAgICB9LCBmdW5jdGlvbiByZWplY3RQcm9taXNlKHJlYXNvbikge1xuICAgICAgX3JlamVjdChwcm9taXNlLCByZWFzb24pO1xuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgX3JlamVjdChwcm9taXNlLCBlKTtcbiAgfVxufVxuXG52YXIgaWQgPSAwO1xuZnVuY3Rpb24gbmV4dElkKCkge1xuICByZXR1cm4gaWQrKztcbn1cblxuZnVuY3Rpb24gbWFrZVByb21pc2UocHJvbWlzZSkge1xuICBwcm9taXNlW1BST01JU0VfSURdID0gaWQrKztcbiAgcHJvbWlzZS5fc3RhdGUgPSB1bmRlZmluZWQ7XG4gIHByb21pc2UuX3Jlc3VsdCA9IHVuZGVmaW5lZDtcbiAgcHJvbWlzZS5fc3Vic2NyaWJlcnMgPSBbXTtcbn1cblxuZnVuY3Rpb24gRW51bWVyYXRvcihDb25zdHJ1Y3RvciwgaW5wdXQpIHtcbiAgdGhpcy5faW5zdGFuY2VDb25zdHJ1Y3RvciA9IENvbnN0cnVjdG9yO1xuICB0aGlzLnByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG5cbiAgaWYgKCF0aGlzLnByb21pc2VbUFJPTUlTRV9JRF0pIHtcbiAgICBtYWtlUHJvbWlzZSh0aGlzLnByb21pc2UpO1xuICB9XG5cbiAgaWYgKGlzQXJyYXkoaW5wdXQpKSB7XG4gICAgdGhpcy5faW5wdXQgPSBpbnB1dDtcbiAgICB0aGlzLmxlbmd0aCA9IGlucHV0Lmxlbmd0aDtcbiAgICB0aGlzLl9yZW1haW5pbmcgPSBpbnB1dC5sZW5ndGg7XG5cbiAgICB0aGlzLl9yZXN1bHQgPSBuZXcgQXJyYXkodGhpcy5sZW5ndGgpO1xuXG4gICAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBmdWxmaWxsKHRoaXMucHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sZW5ndGggPSB0aGlzLmxlbmd0aCB8fCAwO1xuICAgICAgdGhpcy5fZW51bWVyYXRlKCk7XG4gICAgICBpZiAodGhpcy5fcmVtYWluaW5nID09PSAwKSB7XG4gICAgICAgIGZ1bGZpbGwodGhpcy5wcm9taXNlLCB0aGlzLl9yZXN1bHQpO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBfcmVqZWN0KHRoaXMucHJvbWlzZSwgdmFsaWRhdGlvbkVycm9yKCkpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRpb25FcnJvcigpIHtcbiAgcmV0dXJuIG5ldyBFcnJvcignQXJyYXkgTWV0aG9kcyBtdXN0IGJlIHByb3ZpZGVkIGFuIEFycmF5Jyk7XG59O1xuXG5FbnVtZXJhdG9yLnByb3RvdHlwZS5fZW51bWVyYXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gIHZhciBfaW5wdXQgPSB0aGlzLl9pbnB1dDtcblxuICBmb3IgKHZhciBpID0gMDsgdGhpcy5fc3RhdGUgPT09IFBFTkRJTkcgJiYgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdGhpcy5fZWFjaEVudHJ5KF9pbnB1dFtpXSwgaSk7XG4gIH1cbn07XG5cbkVudW1lcmF0b3IucHJvdG90eXBlLl9lYWNoRW50cnkgPSBmdW5jdGlvbiAoZW50cnksIGkpIHtcbiAgdmFyIGMgPSB0aGlzLl9pbnN0YW5jZUNvbnN0cnVjdG9yO1xuICB2YXIgcmVzb2x2ZSQkID0gYy5yZXNvbHZlO1xuXG4gIGlmIChyZXNvbHZlJCQgPT09IHJlc29sdmUpIHtcbiAgICB2YXIgX3RoZW4gPSBnZXRUaGVuKGVudHJ5KTtcblxuICAgIGlmIChfdGhlbiA9PT0gdGhlbiAmJiBlbnRyeS5fc3RhdGUgIT09IFBFTkRJTkcpIHtcbiAgICAgIHRoaXMuX3NldHRsZWRBdChlbnRyeS5fc3RhdGUsIGksIGVudHJ5Ll9yZXN1bHQpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIF90aGVuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aGlzLl9yZW1haW5pbmctLTtcbiAgICAgIHRoaXMuX3Jlc3VsdFtpXSA9IGVudHJ5O1xuICAgIH0gZWxzZSBpZiAoYyA9PT0gUHJvbWlzZSkge1xuICAgICAgdmFyIHByb21pc2UgPSBuZXcgYyhub29wKTtcbiAgICAgIGhhbmRsZU1heWJlVGhlbmFibGUocHJvbWlzZSwgZW50cnksIF90aGVuKTtcbiAgICAgIHRoaXMuX3dpbGxTZXR0bGVBdChwcm9taXNlLCBpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fd2lsbFNldHRsZUF0KG5ldyBjKGZ1bmN0aW9uIChyZXNvbHZlJCQpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUkJChlbnRyeSk7XG4gICAgICB9KSwgaSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuX3dpbGxTZXR0bGVBdChyZXNvbHZlJCQoZW50cnkpLCBpKTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX3NldHRsZWRBdCA9IGZ1bmN0aW9uIChzdGF0ZSwgaSwgdmFsdWUpIHtcbiAgdmFyIHByb21pc2UgPSB0aGlzLnByb21pc2U7XG5cbiAgaWYgKHByb21pc2UuX3N0YXRlID09PSBQRU5ESU5HKSB7XG4gICAgdGhpcy5fcmVtYWluaW5nLS07XG5cbiAgICBpZiAoc3RhdGUgPT09IFJFSkVDVEVEKSB7XG4gICAgICBfcmVqZWN0KHByb21pc2UsIHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fcmVzdWx0W2ldID0gdmFsdWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuX3JlbWFpbmluZyA9PT0gMCkge1xuICAgIGZ1bGZpbGwocHJvbWlzZSwgdGhpcy5fcmVzdWx0KTtcbiAgfVxufTtcblxuRW51bWVyYXRvci5wcm90b3R5cGUuX3dpbGxTZXR0bGVBdCA9IGZ1bmN0aW9uIChwcm9taXNlLCBpKSB7XG4gIHZhciBlbnVtZXJhdG9yID0gdGhpcztcblxuICBzdWJzY3JpYmUocHJvbWlzZSwgdW5kZWZpbmVkLCBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gZW51bWVyYXRvci5fc2V0dGxlZEF0KEZVTEZJTExFRCwgaSwgdmFsdWUpO1xuICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgcmV0dXJuIGVudW1lcmF0b3IuX3NldHRsZWRBdChSRUpFQ1RFRCwgaSwgcmVhc29uKTtcbiAgfSk7XG59O1xuXG4vKipcbiAgYFByb21pc2UuYWxsYCBhY2NlcHRzIGFuIGFycmF5IG9mIHByb21pc2VzLCBhbmQgcmV0dXJucyBhIG5ldyBwcm9taXNlIHdoaWNoXG4gIGlzIGZ1bGZpbGxlZCB3aXRoIGFuIGFycmF5IG9mIGZ1bGZpbGxtZW50IHZhbHVlcyBmb3IgdGhlIHBhc3NlZCBwcm9taXNlcywgb3JcbiAgcmVqZWN0ZWQgd2l0aCB0aGUgcmVhc29uIG9mIHRoZSBmaXJzdCBwYXNzZWQgcHJvbWlzZSB0byBiZSByZWplY3RlZC4gSXQgY2FzdHMgYWxsXG4gIGVsZW1lbnRzIG9mIHRoZSBwYXNzZWQgaXRlcmFibGUgdG8gcHJvbWlzZXMgYXMgaXQgcnVucyB0aGlzIGFsZ29yaXRobS5cblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gcmVzb2x2ZSgxKTtcbiAgbGV0IHByb21pc2UyID0gcmVzb2x2ZSgyKTtcbiAgbGV0IHByb21pc2UzID0gcmVzb2x2ZSgzKTtcbiAgbGV0IHByb21pc2VzID0gWyBwcm9taXNlMSwgcHJvbWlzZTIsIHByb21pc2UzIF07XG5cbiAgUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oZnVuY3Rpb24oYXJyYXkpe1xuICAgIC8vIFRoZSBhcnJheSBoZXJlIHdvdWxkIGJlIFsgMSwgMiwgMyBdO1xuICB9KTtcbiAgYGBgXG5cbiAgSWYgYW55IG9mIHRoZSBgcHJvbWlzZXNgIGdpdmVuIHRvIGBhbGxgIGFyZSByZWplY3RlZCwgdGhlIGZpcnN0IHByb21pc2VcbiAgdGhhdCBpcyByZWplY3RlZCB3aWxsIGJlIGdpdmVuIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSByZXR1cm5lZCBwcm9taXNlcydzXG4gIHJlamVjdGlvbiBoYW5kbGVyLiBGb3IgZXhhbXBsZTpcblxuICBFeGFtcGxlOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgbGV0IHByb21pc2UxID0gcmVzb2x2ZSgxKTtcbiAgbGV0IHByb21pc2UyID0gcmVqZWN0KG5ldyBFcnJvcihcIjJcIikpO1xuICBsZXQgcHJvbWlzZTMgPSByZWplY3QobmV3IEVycm9yKFwiM1wiKSk7XG4gIGxldCBwcm9taXNlcyA9IFsgcHJvbWlzZTEsIHByb21pc2UyLCBwcm9taXNlMyBdO1xuXG4gIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKGZ1bmN0aW9uKGFycmF5KXtcbiAgICAvLyBDb2RlIGhlcmUgbmV2ZXIgcnVucyBiZWNhdXNlIHRoZXJlIGFyZSByZWplY3RlZCBwcm9taXNlcyFcbiAgfSwgZnVuY3Rpb24oZXJyb3IpIHtcbiAgICAvLyBlcnJvci5tZXNzYWdlID09PSBcIjJcIlxuICB9KTtcbiAgYGBgXG5cbiAgQG1ldGhvZCBhbGxcbiAgQHN0YXRpY1xuICBAcGFyYW0ge0FycmF5fSBlbnRyaWVzIGFycmF5IG9mIHByb21pc2VzXG4gIEBwYXJhbSB7U3RyaW5nfSBsYWJlbCBvcHRpb25hbCBzdHJpbmcgZm9yIGxhYmVsaW5nIHRoZSBwcm9taXNlLlxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IHByb21pc2UgdGhhdCBpcyBmdWxmaWxsZWQgd2hlbiBhbGwgYHByb21pc2VzYCBoYXZlIGJlZW5cbiAgZnVsZmlsbGVkLCBvciByZWplY3RlZCBpZiBhbnkgb2YgdGhlbSBiZWNvbWUgcmVqZWN0ZWQuXG4gIEBzdGF0aWNcbiovXG5mdW5jdGlvbiBhbGwoZW50cmllcykge1xuICByZXR1cm4gbmV3IEVudW1lcmF0b3IodGhpcywgZW50cmllcykucHJvbWlzZTtcbn1cblxuLyoqXG4gIGBQcm9taXNlLnJhY2VgIHJldHVybnMgYSBuZXcgcHJvbWlzZSB3aGljaCBpcyBzZXR0bGVkIGluIHRoZSBzYW1lIHdheSBhcyB0aGVcbiAgZmlyc3QgcGFzc2VkIHByb21pc2UgdG8gc2V0dGxlLlxuXG4gIEV4YW1wbGU6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZTEgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJlc29sdmUoJ3Byb21pc2UgMScpO1xuICAgIH0sIDIwMCk7XG4gIH0pO1xuXG4gIGxldCBwcm9taXNlMiA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAyJyk7XG4gICAgfSwgMTAwKTtcbiAgfSk7XG5cbiAgUHJvbWlzZS5yYWNlKFtwcm9taXNlMSwgcHJvbWlzZTJdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgLy8gcmVzdWx0ID09PSAncHJvbWlzZSAyJyBiZWNhdXNlIGl0IHdhcyByZXNvbHZlZCBiZWZvcmUgcHJvbWlzZTFcbiAgICAvLyB3YXMgcmVzb2x2ZWQuXG4gIH0pO1xuICBgYGBcblxuICBgUHJvbWlzZS5yYWNlYCBpcyBkZXRlcm1pbmlzdGljIGluIHRoYXQgb25seSB0aGUgc3RhdGUgb2YgdGhlIGZpcnN0XG4gIHNldHRsZWQgcHJvbWlzZSBtYXR0ZXJzLiBGb3IgZXhhbXBsZSwgZXZlbiBpZiBvdGhlciBwcm9taXNlcyBnaXZlbiB0byB0aGVcbiAgYHByb21pc2VzYCBhcnJheSBhcmd1bWVudCBhcmUgcmVzb2x2ZWQsIGJ1dCB0aGUgZmlyc3Qgc2V0dGxlZCBwcm9taXNlIGhhc1xuICBiZWNvbWUgcmVqZWN0ZWQgYmVmb3JlIHRoZSBvdGhlciBwcm9taXNlcyBiZWNhbWUgZnVsZmlsbGVkLCB0aGUgcmV0dXJuZWRcbiAgcHJvbWlzZSB3aWxsIGJlY29tZSByZWplY3RlZDpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlMSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCl7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmVzb2x2ZSgncHJvbWlzZSAxJyk7XG4gICAgfSwgMjAwKTtcbiAgfSk7XG5cbiAgbGV0IHByb21pc2UyID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdwcm9taXNlIDInKSk7XG4gICAgfSwgMTAwKTtcbiAgfSk7XG5cbiAgUHJvbWlzZS5yYWNlKFtwcm9taXNlMSwgcHJvbWlzZTJdKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCl7XG4gICAgLy8gQ29kZSBoZXJlIG5ldmVyIHJ1bnNcbiAgfSwgZnVuY3Rpb24ocmVhc29uKXtcbiAgICAvLyByZWFzb24ubWVzc2FnZSA9PT0gJ3Byb21pc2UgMicgYmVjYXVzZSBwcm9taXNlIDIgYmVjYW1lIHJlamVjdGVkIGJlZm9yZVxuICAgIC8vIHByb21pc2UgMSBiZWNhbWUgZnVsZmlsbGVkXG4gIH0pO1xuICBgYGBcblxuICBBbiBleGFtcGxlIHJlYWwtd29ybGQgdXNlIGNhc2UgaXMgaW1wbGVtZW50aW5nIHRpbWVvdXRzOlxuXG4gIGBgYGphdmFzY3JpcHRcbiAgUHJvbWlzZS5yYWNlKFthamF4KCdmb28uanNvbicpLCB0aW1lb3V0KDUwMDApXSlcbiAgYGBgXG5cbiAgQG1ldGhvZCByYWNlXG4gIEBzdGF0aWNcbiAgQHBhcmFtIHtBcnJheX0gcHJvbWlzZXMgYXJyYXkgb2YgcHJvbWlzZXMgdG8gb2JzZXJ2ZVxuICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB3aGljaCBzZXR0bGVzIGluIHRoZSBzYW1lIHdheSBhcyB0aGUgZmlyc3QgcGFzc2VkXG4gIHByb21pc2UgdG8gc2V0dGxlLlxuKi9cbmZ1bmN0aW9uIHJhY2UoZW50cmllcykge1xuICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICB2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG4gIGlmICghaXNBcnJheShlbnRyaWVzKSkge1xuICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gKF8sIHJlamVjdCkge1xuICAgICAgcmV0dXJuIHJlamVjdChuZXcgVHlwZUVycm9yKCdZb3UgbXVzdCBwYXNzIGFuIGFycmF5IHRvIHJhY2UuJykpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgdmFyIGxlbmd0aCA9IGVudHJpZXMubGVuZ3RoO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBDb25zdHJ1Y3Rvci5yZXNvbHZlKGVudHJpZXNbaV0pLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG4vKipcbiAgYFByb21pc2UucmVqZWN0YCByZXR1cm5zIGEgcHJvbWlzZSByZWplY3RlZCB3aXRoIHRoZSBwYXNzZWQgYHJlYXNvbmAuXG4gIEl0IGlzIHNob3J0aGFuZCBmb3IgdGhlIGZvbGxvd2luZzpcblxuICBgYGBqYXZhc2NyaXB0XG4gIGxldCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICByZWplY3QobmV3IEVycm9yKCdXSE9PUFMnKSk7XG4gIH0pO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gQ29kZSBoZXJlIGRvZXNuJ3QgcnVuIGJlY2F1c2UgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQhXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdXSE9PUFMnXG4gIH0pO1xuICBgYGBcblxuICBJbnN0ZWFkIG9mIHdyaXRpbmcgdGhlIGFib3ZlLCB5b3VyIGNvZGUgbm93IHNpbXBseSBiZWNvbWVzIHRoZSBmb2xsb3dpbmc6XG5cbiAgYGBgamF2YXNjcmlwdFxuICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignV0hPT1BTJykpO1xuXG4gIHByb21pc2UudGhlbihmdW5jdGlvbih2YWx1ZSl7XG4gICAgLy8gQ29kZSBoZXJlIGRvZXNuJ3QgcnVuIGJlY2F1c2UgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQhXG4gIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgLy8gcmVhc29uLm1lc3NhZ2UgPT09ICdXSE9PUFMnXG4gIH0pO1xuICBgYGBcblxuICBAbWV0aG9kIHJlamVjdFxuICBAc3RhdGljXG4gIEBwYXJhbSB7QW55fSByZWFzb24gdmFsdWUgdGhhdCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkIHdpdGguXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHJlamVjdGVkIHdpdGggdGhlIGdpdmVuIGByZWFzb25gLlxuKi9cbmZ1bmN0aW9uIHJlamVjdChyZWFzb24pIHtcbiAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgdmFyIENvbnN0cnVjdG9yID0gdGhpcztcbiAgdmFyIHByb21pc2UgPSBuZXcgQ29uc3RydWN0b3Iobm9vcCk7XG4gIF9yZWplY3QocHJvbWlzZSwgcmVhc29uKTtcbiAgcmV0dXJuIHByb21pc2U7XG59XG5cbmZ1bmN0aW9uIG5lZWRzUmVzb2x2ZXIoKSB7XG4gIHRocm93IG5ldyBUeXBlRXJyb3IoJ1lvdSBtdXN0IHBhc3MgYSByZXNvbHZlciBmdW5jdGlvbiBhcyB0aGUgZmlyc3QgYXJndW1lbnQgdG8gdGhlIHByb21pc2UgY29uc3RydWN0b3InKTtcbn1cblxuZnVuY3Rpb24gbmVlZHNOZXcoKSB7XG4gIHRocm93IG5ldyBUeXBlRXJyb3IoXCJGYWlsZWQgdG8gY29uc3RydWN0ICdQcm9taXNlJzogUGxlYXNlIHVzZSB0aGUgJ25ldycgb3BlcmF0b3IsIHRoaXMgb2JqZWN0IGNvbnN0cnVjdG9yIGNhbm5vdCBiZSBjYWxsZWQgYXMgYSBmdW5jdGlvbi5cIik7XG59XG5cbi8qKlxuICBQcm9taXNlIG9iamVjdHMgcmVwcmVzZW50IHRoZSBldmVudHVhbCByZXN1bHQgb2YgYW4gYXN5bmNocm9ub3VzIG9wZXJhdGlvbi4gVGhlXG4gIHByaW1hcnkgd2F5IG9mIGludGVyYWN0aW5nIHdpdGggYSBwcm9taXNlIGlzIHRocm91Z2ggaXRzIGB0aGVuYCBtZXRob2QsIHdoaWNoXG4gIHJlZ2lzdGVycyBjYWxsYmFja3MgdG8gcmVjZWl2ZSBlaXRoZXIgYSBwcm9taXNlJ3MgZXZlbnR1YWwgdmFsdWUgb3IgdGhlIHJlYXNvblxuICB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cblxuICBUZXJtaW5vbG9neVxuICAtLS0tLS0tLS0tLVxuXG4gIC0gYHByb21pc2VgIGlzIGFuIG9iamVjdCBvciBmdW5jdGlvbiB3aXRoIGEgYHRoZW5gIG1ldGhvZCB3aG9zZSBiZWhhdmlvciBjb25mb3JtcyB0byB0aGlzIHNwZWNpZmljYXRpb24uXG4gIC0gYHRoZW5hYmxlYCBpcyBhbiBvYmplY3Qgb3IgZnVuY3Rpb24gdGhhdCBkZWZpbmVzIGEgYHRoZW5gIG1ldGhvZC5cbiAgLSBgdmFsdWVgIGlzIGFueSBsZWdhbCBKYXZhU2NyaXB0IHZhbHVlIChpbmNsdWRpbmcgdW5kZWZpbmVkLCBhIHRoZW5hYmxlLCBvciBhIHByb21pc2UpLlxuICAtIGBleGNlcHRpb25gIGlzIGEgdmFsdWUgdGhhdCBpcyB0aHJvd24gdXNpbmcgdGhlIHRocm93IHN0YXRlbWVudC5cbiAgLSBgcmVhc29uYCBpcyBhIHZhbHVlIHRoYXQgaW5kaWNhdGVzIHdoeSBhIHByb21pc2Ugd2FzIHJlamVjdGVkLlxuICAtIGBzZXR0bGVkYCB0aGUgZmluYWwgcmVzdGluZyBzdGF0ZSBvZiBhIHByb21pc2UsIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cblxuICBBIHByb21pc2UgY2FuIGJlIGluIG9uZSBvZiB0aHJlZSBzdGF0ZXM6IHBlbmRpbmcsIGZ1bGZpbGxlZCwgb3IgcmVqZWN0ZWQuXG5cbiAgUHJvbWlzZXMgdGhhdCBhcmUgZnVsZmlsbGVkIGhhdmUgYSBmdWxmaWxsbWVudCB2YWx1ZSBhbmQgYXJlIGluIHRoZSBmdWxmaWxsZWRcbiAgc3RhdGUuICBQcm9taXNlcyB0aGF0IGFyZSByZWplY3RlZCBoYXZlIGEgcmVqZWN0aW9uIHJlYXNvbiBhbmQgYXJlIGluIHRoZVxuICByZWplY3RlZCBzdGF0ZS4gIEEgZnVsZmlsbG1lbnQgdmFsdWUgaXMgbmV2ZXIgYSB0aGVuYWJsZS5cblxuICBQcm9taXNlcyBjYW4gYWxzbyBiZSBzYWlkIHRvICpyZXNvbHZlKiBhIHZhbHVlLiAgSWYgdGhpcyB2YWx1ZSBpcyBhbHNvIGFcbiAgcHJvbWlzZSwgdGhlbiB0aGUgb3JpZ2luYWwgcHJvbWlzZSdzIHNldHRsZWQgc3RhdGUgd2lsbCBtYXRjaCB0aGUgdmFsdWUnc1xuICBzZXR0bGVkIHN0YXRlLiAgU28gYSBwcm9taXNlIHRoYXQgKnJlc29sdmVzKiBhIHByb21pc2UgdGhhdCByZWplY3RzIHdpbGxcbiAgaXRzZWxmIHJlamVjdCwgYW5kIGEgcHJvbWlzZSB0aGF0ICpyZXNvbHZlcyogYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgd2lsbFxuICBpdHNlbGYgZnVsZmlsbC5cblxuXG4gIEJhc2ljIFVzYWdlOlxuICAtLS0tLS0tLS0tLS1cblxuICBgYGBqc1xuICBsZXQgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgIC8vIG9uIHN1Y2Nlc3NcbiAgICByZXNvbHZlKHZhbHVlKTtcblxuICAgIC8vIG9uIGZhaWx1cmVcbiAgICByZWplY3QocmVhc29uKTtcbiAgfSk7XG5cbiAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgLy8gb24gZnVsZmlsbG1lbnRcbiAgfSwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgLy8gb24gcmVqZWN0aW9uXG4gIH0pO1xuICBgYGBcblxuICBBZHZhbmNlZCBVc2FnZTpcbiAgLS0tLS0tLS0tLS0tLS0tXG5cbiAgUHJvbWlzZXMgc2hpbmUgd2hlbiBhYnN0cmFjdGluZyBhd2F5IGFzeW5jaHJvbm91cyBpbnRlcmFjdGlvbnMgc3VjaCBhc1xuICBgWE1MSHR0cFJlcXVlc3Rgcy5cblxuICBgYGBqc1xuICBmdW5jdGlvbiBnZXRKU09OKHVybCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xuICAgICAgbGV0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG4gICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAgICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBoYW5kbGVyO1xuICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpO1xuICAgICAgeGhyLnNlbmQoKTtcblxuICAgICAgZnVuY3Rpb24gaGFuZGxlcigpIHtcbiAgICAgICAgaWYgKHRoaXMucmVhZHlTdGF0ZSA9PT0gdGhpcy5ET05FKSB7XG4gICAgICAgICAgaWYgKHRoaXMuc3RhdHVzID09PSAyMDApIHtcbiAgICAgICAgICAgIHJlc29sdmUodGhpcy5yZXNwb25zZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ2dldEpTT046IGAnICsgdXJsICsgJ2AgZmFpbGVkIHdpdGggc3RhdHVzOiBbJyArIHRoaXMuc3RhdHVzICsgJ10nKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0SlNPTignL3Bvc3RzLmpzb24nKS50aGVuKGZ1bmN0aW9uKGpzb24pIHtcbiAgICAvLyBvbiBmdWxmaWxsbWVudFxuICB9LCBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAvLyBvbiByZWplY3Rpb25cbiAgfSk7XG4gIGBgYFxuXG4gIFVubGlrZSBjYWxsYmFja3MsIHByb21pc2VzIGFyZSBncmVhdCBjb21wb3NhYmxlIHByaW1pdGl2ZXMuXG5cbiAgYGBganNcbiAgUHJvbWlzZS5hbGwoW1xuICAgIGdldEpTT04oJy9wb3N0cycpLFxuICAgIGdldEpTT04oJy9jb21tZW50cycpXG4gIF0pLnRoZW4oZnVuY3Rpb24odmFsdWVzKXtcbiAgICB2YWx1ZXNbMF0gLy8gPT4gcG9zdHNKU09OXG4gICAgdmFsdWVzWzFdIC8vID0+IGNvbW1lbnRzSlNPTlxuXG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfSk7XG4gIGBgYFxuXG4gIEBjbGFzcyBQcm9taXNlXG4gIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVyXG4gIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgQGNvbnN0cnVjdG9yXG4qL1xuZnVuY3Rpb24gUHJvbWlzZShyZXNvbHZlcikge1xuICB0aGlzW1BST01JU0VfSURdID0gbmV4dElkKCk7XG4gIHRoaXMuX3Jlc3VsdCA9IHRoaXMuX3N0YXRlID0gdW5kZWZpbmVkO1xuICB0aGlzLl9zdWJzY3JpYmVycyA9IFtdO1xuXG4gIGlmIChub29wICE9PSByZXNvbHZlcikge1xuICAgIHR5cGVvZiByZXNvbHZlciAhPT0gJ2Z1bmN0aW9uJyAmJiBuZWVkc1Jlc29sdmVyKCk7XG4gICAgdGhpcyBpbnN0YW5jZW9mIFByb21pc2UgPyBpbml0aWFsaXplUHJvbWlzZSh0aGlzLCByZXNvbHZlcikgOiBuZWVkc05ldygpO1xuICB9XG59XG5cblByb21pc2UuYWxsID0gYWxsO1xuUHJvbWlzZS5yYWNlID0gcmFjZTtcblByb21pc2UucmVzb2x2ZSA9IHJlc29sdmU7XG5Qcm9taXNlLnJlamVjdCA9IHJlamVjdDtcblByb21pc2UuX3NldFNjaGVkdWxlciA9IHNldFNjaGVkdWxlcjtcblByb21pc2UuX3NldEFzYXAgPSBzZXRBc2FwO1xuUHJvbWlzZS5fYXNhcCA9IGFzYXA7XG5cblByb21pc2UucHJvdG90eXBlID0ge1xuICBjb25zdHJ1Y3RvcjogUHJvbWlzZSxcblxuICAvKipcbiAgICBUaGUgcHJpbWFyeSB3YXkgb2YgaW50ZXJhY3Rpbmcgd2l0aCBhIHByb21pc2UgaXMgdGhyb3VnaCBpdHMgYHRoZW5gIG1ldGhvZCxcbiAgICB3aGljaCByZWdpc3RlcnMgY2FsbGJhY2tzIHRvIHJlY2VpdmUgZWl0aGVyIGEgcHJvbWlzZSdzIGV2ZW50dWFsIHZhbHVlIG9yIHRoZVxuICAgIHJlYXNvbiB3aHkgdGhlIHByb21pc2UgY2Fubm90IGJlIGZ1bGZpbGxlZC5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24odXNlcil7XG4gICAgICAvLyB1c2VyIGlzIGF2YWlsYWJsZVxuICAgIH0sIGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyB1c2VyIGlzIHVuYXZhaWxhYmxlLCBhbmQgeW91IGFyZSBnaXZlbiB0aGUgcmVhc29uIHdoeVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBDaGFpbmluZ1xuICAgIC0tLS0tLS0tXG4gIFxuICAgIFRoZSByZXR1cm4gdmFsdWUgb2YgYHRoZW5gIGlzIGl0c2VsZiBhIHByb21pc2UuICBUaGlzIHNlY29uZCwgJ2Rvd25zdHJlYW0nXG4gICAgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZpcnN0IHByb21pc2UncyBmdWxmaWxsbWVudFxuICAgIG9yIHJlamVjdGlvbiBoYW5kbGVyLCBvciByZWplY3RlZCBpZiB0aGUgaGFuZGxlciB0aHJvd3MgYW4gZXhjZXB0aW9uLlxuICBcbiAgICBgYGBqc1xuICAgIGZpbmRVc2VyKCkudGhlbihmdW5jdGlvbiAodXNlcikge1xuICAgICAgcmV0dXJuIHVzZXIubmFtZTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICByZXR1cm4gJ2RlZmF1bHQgbmFtZSc7XG4gICAgfSkudGhlbihmdW5jdGlvbiAodXNlck5hbWUpIHtcbiAgICAgIC8vIElmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgdXNlck5hbWVgIHdpbGwgYmUgdGhlIHVzZXIncyBuYW1lLCBvdGhlcndpc2UgaXRcbiAgICAgIC8vIHdpbGwgYmUgYCdkZWZhdWx0IG5hbWUnYFxuICAgIH0pO1xuICBcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRm91bmQgdXNlciwgYnV0IHN0aWxsIHVuaGFwcHknKTtcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2BmaW5kVXNlcmAgcmVqZWN0ZWQgYW5kIHdlJ3JlIHVuaGFwcHknKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0sIGZ1bmN0aW9uIChyZWFzb24pIHtcbiAgICAgIC8vIGlmIGBmaW5kVXNlcmAgZnVsZmlsbGVkLCBgcmVhc29uYCB3aWxsIGJlICdGb3VuZCB1c2VyLCBidXQgc3RpbGwgdW5oYXBweScuXG4gICAgICAvLyBJZiBgZmluZFVzZXJgIHJlamVjdGVkLCBgcmVhc29uYCB3aWxsIGJlICdgZmluZFVzZXJgIHJlamVjdGVkIGFuZCB3ZSdyZSB1bmhhcHB5Jy5cbiAgICB9KTtcbiAgICBgYGBcbiAgICBJZiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIGRvZXMgbm90IHNwZWNpZnkgYSByZWplY3Rpb24gaGFuZGxlciwgcmVqZWN0aW9uIHJlYXNvbnMgd2lsbCBiZSBwcm9wYWdhdGVkIGZ1cnRoZXIgZG93bnN0cmVhbS5cbiAgXG4gICAgYGBganNcbiAgICBmaW5kVXNlcigpLnRoZW4oZnVuY3Rpb24gKHVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBQZWRhZ29naWNhbEV4Y2VwdGlvbignVXBzdHJlYW0gZXJyb3InKTtcbiAgICB9KS50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgLy8gbmV2ZXIgcmVhY2hlZFxuICAgIH0pLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAvLyBuZXZlciByZWFjaGVkXG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgLy8gVGhlIGBQZWRnYWdvY2lhbEV4Y2VwdGlvbmAgaXMgcHJvcGFnYXRlZCBhbGwgdGhlIHdheSBkb3duIHRvIGhlcmVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgQXNzaW1pbGF0aW9uXG4gICAgLS0tLS0tLS0tLS0tXG4gIFxuICAgIFNvbWV0aW1lcyB0aGUgdmFsdWUgeW91IHdhbnQgdG8gcHJvcGFnYXRlIHRvIGEgZG93bnN0cmVhbSBwcm9taXNlIGNhbiBvbmx5IGJlXG4gICAgcmV0cmlldmVkIGFzeW5jaHJvbm91c2x5LiBUaGlzIGNhbiBiZSBhY2hpZXZlZCBieSByZXR1cm5pbmcgYSBwcm9taXNlIGluIHRoZVxuICAgIGZ1bGZpbGxtZW50IG9yIHJlamVjdGlvbiBoYW5kbGVyLiBUaGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgdGhlbiBiZSBwZW5kaW5nXG4gICAgdW50aWwgdGhlIHJldHVybmVkIHByb21pc2UgaXMgc2V0dGxlZC4gVGhpcyBpcyBjYWxsZWQgKmFzc2ltaWxhdGlvbiouXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgIC8vIFRoZSB1c2VyJ3MgY29tbWVudHMgYXJlIG5vdyBhdmFpbGFibGVcbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgSWYgdGhlIGFzc2ltbGlhdGVkIHByb21pc2UgcmVqZWN0cywgdGhlbiB0aGUgZG93bnN0cmVhbSBwcm9taXNlIHdpbGwgYWxzbyByZWplY3QuXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFVzZXIoKS50aGVuKGZ1bmN0aW9uICh1c2VyKSB7XG4gICAgICByZXR1cm4gZmluZENvbW1lbnRzQnlBdXRob3IodXNlcik7XG4gICAgfSkudGhlbihmdW5jdGlvbiAoY29tbWVudHMpIHtcbiAgICAgIC8vIElmIGBmaW5kQ29tbWVudHNCeUF1dGhvcmAgZnVsZmlsbHMsIHdlJ2xsIGhhdmUgdGhlIHZhbHVlIGhlcmVcbiAgICB9LCBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAvLyBJZiBgZmluZENvbW1lbnRzQnlBdXRob3JgIHJlamVjdHMsIHdlJ2xsIGhhdmUgdGhlIHJlYXNvbiBoZXJlXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIFNpbXBsZSBFeGFtcGxlXG4gICAgLS0tLS0tLS0tLS0tLS1cbiAgXG4gICAgU3luY2hyb25vdXMgRXhhbXBsZVxuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgbGV0IHJlc3VsdDtcbiAgXG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IGZpbmRSZXN1bHQoKTtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH1cbiAgICBgYGBcbiAgXG4gICAgRXJyYmFjayBFeGFtcGxlXG4gIFxuICAgIGBgYGpzXG4gICAgZmluZFJlc3VsdChmdW5jdGlvbihyZXN1bHQsIGVycil7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIC8vIGZhaWx1cmVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1Y2Nlc3NcbiAgICAgIH1cbiAgICB9KTtcbiAgICBgYGBcbiAgXG4gICAgUHJvbWlzZSBFeGFtcGxlO1xuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgZmluZFJlc3VsdCgpLnRoZW4oZnVuY3Rpb24ocmVzdWx0KXtcbiAgICAgIC8vIHN1Y2Nlc3NcbiAgICB9LCBmdW5jdGlvbihyZWFzb24pe1xuICAgICAgLy8gZmFpbHVyZVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBBZHZhbmNlZCBFeGFtcGxlXG4gICAgLS0tLS0tLS0tLS0tLS1cbiAgXG4gICAgU3luY2hyb25vdXMgRXhhbXBsZVxuICBcbiAgICBgYGBqYXZhc2NyaXB0XG4gICAgbGV0IGF1dGhvciwgYm9va3M7XG4gIFxuICAgIHRyeSB7XG4gICAgICBhdXRob3IgPSBmaW5kQXV0aG9yKCk7XG4gICAgICBib29rcyAgPSBmaW5kQm9va3NCeUF1dGhvcihhdXRob3IpO1xuICAgICAgLy8gc3VjY2Vzc1xuICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAvLyBmYWlsdXJlXG4gICAgfVxuICAgIGBgYFxuICBcbiAgICBFcnJiYWNrIEV4YW1wbGVcbiAgXG4gICAgYGBganNcbiAgXG4gICAgZnVuY3Rpb24gZm91bmRCb29rcyhib29rcykge1xuICBcbiAgICB9XG4gIFxuICAgIGZ1bmN0aW9uIGZhaWx1cmUocmVhc29uKSB7XG4gIFxuICAgIH1cbiAgXG4gICAgZmluZEF1dGhvcihmdW5jdGlvbihhdXRob3IsIGVycil7XG4gICAgICBpZiAoZXJyKSB7XG4gICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgLy8gZmFpbHVyZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBmaW5kQm9vb2tzQnlBdXRob3IoYXV0aG9yLCBmdW5jdGlvbihib29rcywgZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGZhaWx1cmUoZXJyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZm91bmRCb29rcyhib29rcyk7XG4gICAgICAgICAgICAgIH0gY2F0Y2gocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgZmFpbHVyZShyZWFzb24pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2goZXJyb3IpIHtcbiAgICAgICAgICBmYWlsdXJlKGVycik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gc3VjY2Vzc1xuICAgICAgfVxuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBQcm9taXNlIEV4YW1wbGU7XG4gIFxuICAgIGBgYGphdmFzY3JpcHRcbiAgICBmaW5kQXV0aG9yKCkuXG4gICAgICB0aGVuKGZpbmRCb29rc0J5QXV0aG9yKS5cbiAgICAgIHRoZW4oZnVuY3Rpb24oYm9va3Mpe1xuICAgICAgICAvLyBmb3VuZCBib29rc1xuICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbil7XG4gICAgICAvLyBzb21ldGhpbmcgd2VudCB3cm9uZ1xuICAgIH0pO1xuICAgIGBgYFxuICBcbiAgICBAbWV0aG9kIHRoZW5cbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvbkZ1bGZpbGxlZFxuICAgIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWRcbiAgICBVc2VmdWwgZm9yIHRvb2xpbmcuXG4gICAgQHJldHVybiB7UHJvbWlzZX1cbiAgKi9cbiAgdGhlbjogdGhlbixcblxuICAvKipcbiAgICBgY2F0Y2hgIGlzIHNpbXBseSBzdWdhciBmb3IgYHRoZW4odW5kZWZpbmVkLCBvblJlamVjdGlvbilgIHdoaWNoIG1ha2VzIGl0IHRoZSBzYW1lXG4gICAgYXMgdGhlIGNhdGNoIGJsb2NrIG9mIGEgdHJ5L2NhdGNoIHN0YXRlbWVudC5cbiAgXG4gICAgYGBganNcbiAgICBmdW5jdGlvbiBmaW5kQXV0aG9yKCl7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvdWxkbid0IGZpbmQgdGhhdCBhdXRob3InKTtcbiAgICB9XG4gIFxuICAgIC8vIHN5bmNocm9ub3VzXG4gICAgdHJ5IHtcbiAgICAgIGZpbmRBdXRob3IoKTtcbiAgICB9IGNhdGNoKHJlYXNvbikge1xuICAgICAgLy8gc29tZXRoaW5nIHdlbnQgd3JvbmdcbiAgICB9XG4gIFxuICAgIC8vIGFzeW5jIHdpdGggcHJvbWlzZXNcbiAgICBmaW5kQXV0aG9yKCkuY2F0Y2goZnVuY3Rpb24ocmVhc29uKXtcbiAgICAgIC8vIHNvbWV0aGluZyB3ZW50IHdyb25nXG4gICAgfSk7XG4gICAgYGBgXG4gIFxuICAgIEBtZXRob2QgY2F0Y2hcbiAgICBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlamVjdGlvblxuICAgIFVzZWZ1bCBmb3IgdG9vbGluZy5cbiAgICBAcmV0dXJuIHtQcm9taXNlfVxuICAqL1xuICAnY2F0Y2gnOiBmdW5jdGlvbiBfY2F0Y2gob25SZWplY3Rpb24pIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKG51bGwsIG9uUmVqZWN0aW9uKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gcG9seWZpbGwoKSB7XG4gICAgdmFyIGxvY2FsID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxvY2FsID0gZ2xvYmFsO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGxvY2FsID0gc2VsZjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbG9jYWwgPSBGdW5jdGlvbigncmV0dXJuIHRoaXMnKSgpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3BvbHlmaWxsIGZhaWxlZCBiZWNhdXNlIGdsb2JhbCBvYmplY3QgaXMgdW5hdmFpbGFibGUgaW4gdGhpcyBlbnZpcm9ubWVudCcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIFAgPSBsb2NhbC5Qcm9taXNlO1xuXG4gICAgaWYgKFApIHtcbiAgICAgICAgdmFyIHByb21pc2VUb1N0cmluZyA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcm9taXNlVG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoUC5yZXNvbHZlKCkpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAvLyBzaWxlbnRseSBpZ25vcmVkXG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvbWlzZVRvU3RyaW5nID09PSAnW29iamVjdCBQcm9taXNlXScgJiYgIVAuY2FzdCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbG9jYWwuUHJvbWlzZSA9IFByb21pc2U7XG59XG5cbi8vIFN0cmFuZ2UgY29tcGF0Li5cblByb21pc2UucG9seWZpbGwgPSBwb2x5ZmlsbDtcblByb21pc2UuUHJvbWlzZSA9IFByb21pc2U7XG5cbnJldHVybiBQcm9taXNlO1xuXG59KSkpO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZXM2LXByb21pc2UubWFwIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGNhY2hlZCBmcm9tIHdoYXRldmVyIGdsb2JhbCBpcyBwcmVzZW50IHNvIHRoYXQgdGVzdCBydW5uZXJzIHRoYXQgc3R1YiBpdFxuLy8gZG9uJ3QgYnJlYWsgdGhpbmdzLiAgQnV0IHdlIG5lZWQgdG8gd3JhcCBpdCBpbiBhIHRyeSBjYXRjaCBpbiBjYXNlIGl0IGlzXG4vLyB3cmFwcGVkIGluIHN0cmljdCBtb2RlIGNvZGUgd2hpY2ggZG9lc24ndCBkZWZpbmUgYW55IGdsb2JhbHMuICBJdCdzIGluc2lkZSBhXG4vLyBmdW5jdGlvbiBiZWNhdXNlIHRyeS9jYXRjaGVzIGRlb3B0aW1pemUgaW4gY2VydGFpbiBlbmdpbmVzLlxuXG52YXIgY2FjaGVkU2V0VGltZW91dDtcbnZhciBjYWNoZWRDbGVhclRpbWVvdXQ7XG5cbmZ1bmN0aW9uIGRlZmF1bHRTZXRUaW1vdXQoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdzZXRUaW1lb3V0IGhhcyBub3QgYmVlbiBkZWZpbmVkJyk7XG59XG5mdW5jdGlvbiBkZWZhdWx0Q2xlYXJUaW1lb3V0ICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NsZWFyVGltZW91dCBoYXMgbm90IGJlZW4gZGVmaW5lZCcpO1xufVxuKGZ1bmN0aW9uICgpIHtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIHNldFRpbWVvdXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBzZXRUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IGRlZmF1bHRTZXRUaW1vdXQ7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNhY2hlZFNldFRpbWVvdXQgPSBkZWZhdWx0U2V0VGltb3V0O1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIGNsZWFyVGltZW91dCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gY2xlYXJUaW1lb3V0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY2FjaGVkQ2xlYXJUaW1lb3V0ID0gZGVmYXVsdENsZWFyVGltZW91dDtcbiAgICB9XG59ICgpKVxuZnVuY3Rpb24gcnVuVGltZW91dChmdW4pIHtcbiAgICBpZiAoY2FjaGVkU2V0VGltZW91dCA9PT0gc2V0VGltZW91dCkge1xuICAgICAgICAvL25vcm1hbCBlbnZpcm9tZW50cyBpbiBzYW5lIHNpdHVhdGlvbnNcbiAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9XG4gICAgLy8gaWYgc2V0VGltZW91dCB3YXNuJ3QgYXZhaWxhYmxlIGJ1dCB3YXMgbGF0dGVyIGRlZmluZWRcbiAgICBpZiAoKGNhY2hlZFNldFRpbWVvdXQgPT09IGRlZmF1bHRTZXRUaW1vdXQgfHwgIWNhY2hlZFNldFRpbWVvdXQpICYmIHNldFRpbWVvdXQpIHtcbiAgICAgICAgY2FjaGVkU2V0VGltZW91dCA9IHNldFRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1biwgMCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIC8vIHdoZW4gd2hlbiBzb21lYm9keSBoYXMgc2NyZXdlZCB3aXRoIHNldFRpbWVvdXQgYnV0IG5vIEkuRS4gbWFkZG5lc3NcbiAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQoZnVuLCAwKTtcbiAgICB9IGNhdGNoKGUpe1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gSS5FLiBidXQgdGhlIHNjcmlwdCBoYXMgYmVlbiBldmFsZWQgc28gSS5FLiBkb2Vzbid0IHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkU2V0VGltZW91dC5jYWxsKG51bGwsIGZ1biwgMCk7XG4gICAgICAgIH0gY2F0Y2goZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvclxuICAgICAgICAgICAgcmV0dXJuIGNhY2hlZFNldFRpbWVvdXQuY2FsbCh0aGlzLCBmdW4sIDApO1xuICAgICAgICB9XG4gICAgfVxuXG5cbn1cbmZ1bmN0aW9uIHJ1bkNsZWFyVGltZW91dChtYXJrZXIpIHtcbiAgICBpZiAoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBjbGVhclRpbWVvdXQpIHtcbiAgICAgICAgLy9ub3JtYWwgZW52aXJvbWVudHMgaW4gc2FuZSBzaXR1YXRpb25zXG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgLy8gaWYgY2xlYXJUaW1lb3V0IHdhc24ndCBhdmFpbGFibGUgYnV0IHdhcyBsYXR0ZXIgZGVmaW5lZFxuICAgIGlmICgoY2FjaGVkQ2xlYXJUaW1lb3V0ID09PSBkZWZhdWx0Q2xlYXJUaW1lb3V0IHx8ICFjYWNoZWRDbGVhclRpbWVvdXQpICYmIGNsZWFyVGltZW91dCkge1xuICAgICAgICBjYWNoZWRDbGVhclRpbWVvdXQgPSBjbGVhclRpbWVvdXQ7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQobWFya2VyKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gd2hlbiB3aGVuIHNvbWVib2R5IGhhcyBzY3Jld2VkIHdpdGggc2V0VGltZW91dCBidXQgbm8gSS5FLiBtYWRkbmVzc1xuICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0KG1hcmtlcik7XG4gICAgfSBjYXRjaCAoZSl7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBJLkUuIGJ1dCB0aGUgc2NyaXB0IGhhcyBiZWVuIGV2YWxlZCBzbyBJLkUuIGRvZXNuJ3QgIHRydXN0IHRoZSBnbG9iYWwgb2JqZWN0IHdoZW4gY2FsbGVkIG5vcm1hbGx5XG4gICAgICAgICAgICByZXR1cm4gY2FjaGVkQ2xlYXJUaW1lb3V0LmNhbGwobnVsbCwgbWFya2VyKTtcbiAgICAgICAgfSBjYXRjaCAoZSl7XG4gICAgICAgICAgICAvLyBzYW1lIGFzIGFib3ZlIGJ1dCB3aGVuIGl0J3MgYSB2ZXJzaW9uIG9mIEkuRS4gdGhhdCBtdXN0IGhhdmUgdGhlIGdsb2JhbCBvYmplY3QgZm9yICd0aGlzJywgaG9wZnVsbHkgb3VyIGNvbnRleHQgY29ycmVjdCBvdGhlcndpc2UgaXQgd2lsbCB0aHJvdyBhIGdsb2JhbCBlcnJvci5cbiAgICAgICAgICAgIC8vIFNvbWUgdmVyc2lvbnMgb2YgSS5FLiBoYXZlIGRpZmZlcmVudCBydWxlcyBmb3IgY2xlYXJUaW1lb3V0IHZzIHNldFRpbWVvdXRcbiAgICAgICAgICAgIHJldHVybiBjYWNoZWRDbGVhclRpbWVvdXQuY2FsbCh0aGlzLCBtYXJrZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cblxufVxudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgaWYgKCFkcmFpbmluZyB8fCAhY3VycmVudFF1ZXVlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gcnVuVGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgcnVuQ2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgcnVuVGltZW91dChkcmFpblF1ZXVlKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsImV4cG9ydCBjb25zdCBFVkVOVFMgPSB7XHJcbiAgU0lHTklOOiAnU0lHTklOJyxcclxuICBTSUdOT1VUOiAnU0lHTk9VVCcsXHJcbiAgU0lHTlVQOiAnU0lHTlVQJ1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IFVSTFMgPSB7XHJcbiAgdG9rZW46ICd0b2tlbicsXHJcbiAgc2lnbnVwOiAnMS91c2VyL3NpZ251cCcsXHJcbiAgcmVxdWVzdFJlc2V0UGFzc3dvcmQ6ICcxL3VzZXIvcmVxdWVzdFJlc2V0UGFzc3dvcmQnLFxyXG4gIHJlc2V0UGFzc3dvcmQ6ICcxL3VzZXIvcmVzZXRQYXNzd29yZCcsXHJcbiAgY2hhbmdlUGFzc3dvcmQ6ICcxL3VzZXIvY2hhbmdlUGFzc3dvcmQnLFxyXG4gIC8vIHNvY2lhbExvZ2luV2l0aENvZGU6ICcxL3VzZXIvUFJPVklERVIvY29kZScsXHJcbiAgc29jaWFsU2lnbmluV2l0aFRva2VuOiAnMS91c2VyL1BST1ZJREVSL3Rva2VuJyxcclxuICAvLyBzb2NpYWxTaW5ndXBXaXRoQ29kZTogJzEvdXNlci9QUk9WSURFUi9zaWdudXBDb2RlJyxcclxuICBzaWdub3V0OiAnMS91c2VyL3NpZ25vdXQnLFxyXG4gIHByb2ZpbGU6ICdhcGkvYWNjb3VudC9wcm9maWxlJyxcclxuICBvYmplY3RzOiAnMS9vYmplY3RzJyxcclxuICBvYmplY3RzQWN0aW9uOiAnMS9vYmplY3RzL2FjdGlvbicsXHJcbiAgcXVlcnk6ICcxL3F1ZXJ5L2RhdGEnLFxyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IFNPQ0lBTF9QUk9WSURFUlMgPSB7XHJcbiAgZ2l0aHViOiB7bmFtZTogJ2dpdGh1YicsIGxhYmVsOiAnR2l0aHViJywgdXJsOiAnd3d3LmdpdGh1Yi5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjNDQ0J30sIGlkOiAxfSxcclxuICBnb29nbGU6IHtuYW1lOiAnZ29vZ2xlJywgbGFiZWw6ICdHb29nbGUnLCB1cmw6ICd3d3cuZ29vZ2xlLmNvbScsIGNzczoge2JhY2tncm91bmRDb2xvcjogJyNkZDRiMzknfSwgaWQ6IDJ9LFxyXG4gIGZhY2Vib29rOiB7bmFtZTogJ2ZhY2Vib29rJywgbGFiZWw6ICdGYWNlYm9vaycsIHVybDogJ3d3dy5mYWNlYm9vay5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjM2I1OTk4J30sIGlkOiAzfSxcclxuICB0d2l0dGVyOiB7bmFtZTogJ3R3aXR0ZXInLCBsYWJlbDogJ1R3aXR0ZXInLCB1cmw6ICd3d3cudHdpdHRlci5jb20nLCBjc3M6IHtiYWNrZ3JvdW5kQ29sb3I6ICcjNTVhY2VlJ30sIGlkOiA0fVxyXG59O1xyXG4iLCJleHBvcnQgZGVmYXVsdCB7XHJcbiAgYXBwTmFtZTogbnVsbCxcclxuICBhbm9ueW1vdXNUb2tlbjogbnVsbCxcclxuICBzaWduVXBUb2tlbjogbnVsbCxcclxuICBhcGlVcmw6ICdodHRwczovL2FwaS5iYWNrYW5kLmNvbScsXHJcbiAgc3RvcmFnZTogd2luZG93LmxvY2FsU3RvcmFnZSxcclxuICBzdG9yYWdlUHJlZml4OiAnQkFDS0FORF8nLFxyXG4gIG1hbmFnZVJlZnJlc2hUb2tlbjogdHJ1ZSxcclxuICBydW5TaWduaW5BZnRlclNpZ251cDogdHJ1ZSxcclxuICBydW5Tb2NrZXQ6IGZhbHNlLFxyXG4gIHNvY2tldFVybDogJ2h0dHBzOi8vc29ja2V0LmJhY2thbmQuY29tJyxcclxuICBpc01vYmlsZTogZmFsc2UsXHJcbn07XHJcbiIsImV4cG9ydCBjb25zdCBmaWx0ZXIgPSB7XHJcbiAgY3JlYXRlOiAoZmllbGROYW1lLCBvcGVyYXRvciwgdmFsdWUpID0+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGZpZWxkTmFtZSxcclxuICAgICAgb3BlcmF0b3IsXHJcbiAgICAgIHZhbHVlXHJcbiAgICB9XHJcbiAgfSxcclxuICBvcGVyYXRvcnM6IHtcclxuICAgIG51bWVyaWM6IHsgZXF1YWxzOiBcImVxdWFsc1wiLCBub3RFcXVhbHM6IFwibm90RXF1YWxzXCIsIGdyZWF0ZXJUaGFuOiBcImdyZWF0ZXJUaGFuXCIsIGdyZWF0ZXJUaGFuT3JFcXVhbHNUbzogXCJncmVhdGVyVGhhbk9yRXF1YWxzVG9cIiwgbGVzc1RoYW46IFwibGVzc1RoYW5cIiwgbGVzc1RoYW5PckVxdWFsc1RvOiBcImxlc3NUaGFuT3JFcXVhbHNUb1wiLCBlbXB0eTogXCJlbXB0eVwiLCBub3RFbXB0eTogXCJub3RFbXB0eVwiIH0sXHJcbiAgICBkYXRlOiB7IGVxdWFsczogXCJlcXVhbHNcIiwgbm90RXF1YWxzOiBcIm5vdEVxdWFsc1wiLCBncmVhdGVyVGhhbjogXCJncmVhdGVyVGhhblwiLCBncmVhdGVyVGhhbk9yRXF1YWxzVG86IFwiZ3JlYXRlclRoYW5PckVxdWFsc1RvXCIsIGxlc3NUaGFuOiBcImxlc3NUaGFuXCIsIGxlc3NUaGFuT3JFcXVhbHNUbzogXCJsZXNzVGhhbk9yRXF1YWxzVG9cIiwgZW1wdHk6IFwiZW1wdHlcIiwgbm90RW1wdHk6IFwibm90RW1wdHlcIiB9LFxyXG4gICAgdGV4dDogeyBlcXVhbHM6IFwiZXF1YWxzXCIsIG5vdEVxdWFsczogXCJub3RFcXVhbHNcIiwgc3RhcnRzV2l0aDogXCJzdGFydHNXaXRoXCIsIGVuZHNXaXRoOiBcImVuZHNXaXRoXCIsIGNvbnRhaW5zOiBcImNvbnRhaW5zXCIsIG5vdENvbnRhaW5zOiBcIm5vdENvbnRhaW5zXCIsIGVtcHR5OiBcImVtcHR5XCIsIG5vdEVtcHR5OiBcIm5vdEVtcHR5XCIgfSxcclxuICAgIGJvb2xlYW46IHsgZXF1YWxzOiBcImVxdWFsc1wiIH0sXHJcbiAgICByZWxhdGlvbjogeyBpbjogXCJpblwiIH1cclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBzb3J0ID0ge1xyXG4gIGNyZWF0ZTogKGZpZWxkTmFtZSwgb3JkZXIpID0+IHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIGZpZWxkTmFtZSxcclxuICAgICAgb3JkZXJcclxuICAgIH1cclxuICB9LFxyXG4gIG9yZGVyczogeyBhc2M6IFwiYXNjXCIsIGRlc2M6IFwiZGVzY1wiIH1cclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IGV4Y2x1ZGUgPSB7XHJcbiAgb3B0aW9uczogeyBtZXRhZGF0YTogXCJtZXRhZGF0YVwiLCB0b3RhbFJvd3M6IFwidG90YWxSb3dzXCIsIGFsbDogXCJtZXRhZGF0YSx0b3RhbFJvd3NcIiB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBTdG9yYWdlQWJzdHJhY3Qge1xyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgaWYgKHRoaXMuY29uc3RydWN0b3IgPT09IFN0b3JhZ2VBYnN0cmFjdCkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2FuIG5vdCBjb25zdHJ1Y3QgYWJzdHJhY3QgY2xhc3MuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuc2V0SXRlbSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuc2V0SXRlbSA9PT0gU3RvcmFnZUFic3RyYWN0LnByb3RvdHlwZS5zZXRJdGVtKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIHNldEl0ZW0gbWV0aG9kLlwiKTtcclxuICAgIH1cclxuICAgIGlmICh0aGlzLmdldEl0ZW0gPT09IHVuZGVmaW5lZCB8fCB0aGlzLmdldEl0ZW0gPT09IFN0b3JhZ2VBYnN0cmFjdC5wcm90b3R5cGUuZ2V0SXRlbSkge1xyXG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiTXVzdCBvdmVycmlkZSBnZXRJdGVtIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5yZW1vdmVJdGVtID09PSB1bmRlZmluZWQgfHwgdGhpcy5yZW1vdmVJdGVtID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLnJlbW92ZUl0ZW0pIHtcclxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIk11c3Qgb3ZlcnJpZGUgcmVtb3ZlSXRlbSBtZXRob2QuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuY2xlYXIgPT09IHVuZGVmaW5lZCB8fCB0aGlzLmNsZWFyID09PSBTdG9yYWdlQWJzdHJhY3QucHJvdG90eXBlLmNsZWFyKSB7XHJcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJNdXN0IG92ZXJyaWRlIGNsZWFyIG1ldGhvZC5cIik7XHJcbiAgICB9XHJcbiAgICAvLyB0aGlzLmRhdGEgPSB7fTtcclxuICB9XHJcbiAgc2V0SXRlbSAoaWQsIHZhbCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCBzZXRJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gcmV0dXJuIHRoaXMuZGF0YVtpZF0gPSBTdHJpbmcodmFsKTtcclxuICB9XHJcbiAgZ2V0SXRlbSAoaWQpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2QgZ2V0SXRlbSBmcm9tIGNoaWxkLlwiKTtcclxuICAgIC8vIHJldHVybiB0aGlzLmRhdGEuaGFzT3duUHJvcGVydHkoaWQpID8gdGhpcy5fZGF0YVtpZF0gOiBudWxsO1xyXG4gIH1cclxuICByZW1vdmVJdGVtIChpZCkge1xyXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkRvIG5vdCBjYWxsIGFic3RyYWN0IG1ldGhvZCByZW1vdmVJdGVtIGZyb20gY2hpbGQuXCIpO1xyXG4gICAgLy8gZGVsZXRlIHRoaXMuZGF0YVtpZF07XHJcbiAgICAvLyByZXR1cm4gbnVsbDtcclxuICAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJEbyBub3QgY2FsbCBhYnN0cmFjdCBtZXRob2QgY2xlYXIgZnJvbSBjaGlsZC5cIik7XHJcbiAgICAvLyByZXR1cm4gdGhpcy5kYXRhID0ge307XHJcbiAgIH1cclxufVxyXG4iLCIvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcclxuICogYmFja2FuZCBKYXZhU2NyaXB0IExpYnJhcnlcclxuICogQXV0aG9yczogYmFja2FuZFxyXG4gKiBMaWNlbnNlOiBNSVQgKGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwKVxyXG4gKiBDb21waWxlZCBBdDogMjYvMTEvMjAxNlxyXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXHJcbmltcG9ydCBkZWZhdWx0cyBmcm9tICcuL2RlZmF1bHRzJ1xyXG5pbXBvcnQgKiBhcyBjb25zdGFudHMgZnJvbSAnLi9jb25zdGFudHMnXHJcbmltcG9ydCAqIGFzIGhlbHBlcnMgZnJvbSAnLi9oZWxwZXJzJ1xyXG5pbXBvcnQgU3RvcmFnZSBmcm9tICcuL3V0aWxzL3N0b3JhZ2UnXHJcbmltcG9ydCBIdHRwIGZyb20gJy4vdXRpbHMvaHR0cCdcclxuaW1wb3J0IFNvY2tldCBmcm9tICcuL3V0aWxzL3NvY2tldCdcclxuaW1wb3J0IGF1dGggZnJvbSAnLi9zZXJ2aWNlcy9hdXRoJ1xyXG5pbXBvcnQgb2JqZWN0IGZyb20gJy4vc2VydmljZXMvb2JqZWN0J1xyXG5pbXBvcnQgZmlsZSBmcm9tICcuL3NlcnZpY2VzL2ZpbGUnXHJcbmltcG9ydCBxdWVyeSBmcm9tICcuL3NlcnZpY2VzL3F1ZXJ5J1xyXG5pbXBvcnQgdXNlciBmcm9tICcuL3NlcnZpY2VzL3VzZXInXHJcblxyXG5sZXQgYmFja2FuZCA9IHtcclxuICBjb25zdGFudHMsXHJcbiAgaGVscGVycyxcclxufVxyXG5iYWNrYW5kLmluaXQgPSAoY29uZmlnID0ge30pID0+IHtcclxuXHJcbiAgLy8gY29tYmluZSBkZWZhdWx0cyB3aXRoIHVzZXIgY29uZmlnXHJcbiAgT2JqZWN0LmFzc2lnbihkZWZhdWx0cywgY29uZmlnKTtcclxuICAvLyBjb25zb2xlLmxvZyhkZWZhdWx0cyk7XHJcblxyXG4gIC8vIHZlcmlmeSBuZXcgZGVmYXVsdHNcclxuICBpZiAoIWRlZmF1bHRzLmFwcE5hbWUpXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwcE5hbWUgaXMgbWlzc2luZycpO1xyXG4gIGlmICghZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4pXHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2Fub255bW91c1Rva2VuIGlzIG1pc3NpbmcnKTtcclxuICBpZiAoIWRlZmF1bHRzLnNpZ25VcFRva2VuKVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdzaWduVXBUb2tlbiBpcyBtaXNzaW5nJyk7XHJcblxyXG4gIC8vIGluaXQgdXRpbHNcclxuICBsZXQgdXRpbHMgPSB7XHJcbiAgICBzdG9yYWdlOiBuZXcgU3RvcmFnZShkZWZhdWx0cy5zdG9yYWdlLCBkZWZhdWx0cy5zdG9yYWdlUHJlZml4KSxcclxuICAgIGh0dHA6IEh0dHAuY3JlYXRlKHtcclxuICAgICAgYmFzZVVSTDogZGVmYXVsdHMuYXBpVXJsXHJcbiAgICB9KSxcclxuICAgIGlzSUU6IHdpbmRvdy5kb2N1bWVudCAmJiAoZmFsc2UgfHwgISFkb2N1bWVudC5kb2N1bWVudE1vZGUpLFxyXG4gICAgRU5WOiAnYnJvd3NlcicsXHJcbiAgfVxyXG4gIGlmIChkZWZhdWx0cy5ydW5Tb2NrZXQpIHtcclxuICAgIHV0aWxzWydzb2NrZXQnXSA9IG5ldyBTb2NrZXQoZGVmYXVsdHMuc29ja2V0VXJsKTtcclxuICB9XHJcblxyXG4gIHV0aWxzLmh0dHAuY29uZmlnLmludGVyY2VwdG9ycyA9IHtcclxuICAgIHJlcXVlc3Q6IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gICAgICBpZiAoY29uZmlnLnVybC5pbmRleE9mKGNvbnN0YW50cy5VUkxTLnRva2VuKSA9PT0gIC0xICYmIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKSkge1xyXG4gICAgICAgIGNvbmZpZy5oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnLmhlYWRlcnMsIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbilcclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIHJlc3BvbnNlRXJyb3I6IGZ1bmN0aW9uIChlcnJvciwgY29uZmlnLCByZXNvbHZlLCByZWplY3QsIHNjYiwgZWNiKSB7XHJcbiAgICAgIGlmIChjb25maWcudXJsLmluZGV4T2YoY29uc3RhbnRzLlVSTFMudG9rZW4pID09PSAgLTFcclxuICAgICAgICYmIGRlZmF1bHRzLm1hbmFnZVJlZnJlc2hUb2tlblxyXG4gICAgICAgJiYgZXJyb3Iuc3RhdHVzID09PSA0MDFcclxuICAgICAgICYmIGVycm9yLmRhdGEgJiYgZXJyb3IuZGF0YS5NZXNzYWdlID09PSAnaW52YWxpZCBvciBleHBpcmVkIHRva2VuJykge1xyXG4gICAgICAgICBhdXRoLl9faGFuZGxlUmVmcmVzaFRva2VuX18uY2FsbCh1dGlscywgZXJyb3IpXHJcbiAgICAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgICAgYmFja2FuZC51dGlscy5odHRwLnJlcXVlc3QoY29uZmlnLCBzY2IsIGVjYik7XHJcbiAgICAgICAgICAgfSlcclxuICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgIH0pXHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8gZXhwb3NlIGJhY2thbmQgbmFtZXNwYWNlIHRvIHdpbmRvd1xyXG4gIGRlbGV0ZSBiYWNrYW5kLmluaXQ7XHJcbiAgT2JqZWN0LmFzc2lnbihcclxuICAgIGJhY2thbmQsXHJcbiAgICBhdXRoLFxyXG4gICAge1xyXG4gICAgICBvYmplY3QsXHJcbiAgICAgIGZpbGUsXHJcbiAgICAgIHF1ZXJ5LFxyXG4gICAgICB1c2VyLFxyXG4gICAgICB1dGlscyxcclxuICAgIH1cclxuICApO1xyXG4gIGlmKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpICYmIGJhY2thbmQudXRpbHMuc29ja2V0LmNvbm5lY3QoXHJcbiAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKS50b2tlbi5BdXRob3JpemF0aW9uIHx8IG51bGwsXHJcbiAgICAgIGRlZmF1bHRzLmFub255bW91c1Rva2VuLFxyXG4gICAgICBkZWZhdWx0cy5hcHBOYW1lXHJcbiAgICApO1xyXG4gICAgT2JqZWN0LmFzc2lnbihiYWNrYW5kLCB7b246IGJhY2thbmQudXRpbHMuc29ja2V0Lm9uLmJpbmQoYmFja2FuZC51dGlscy5zb2NrZXQpfSk7XHJcbiAgfVxyXG5cclxuICAvLyBnZXQgZGF0YSBmcm9tIHVybCBpbiBzb2NpYWwgc2lnbi1pbiBwb3B1cFxyXG4gIGlmICghZGVmYXVsdHMuaXNNb2JpbGUpIHtcclxuICAgIGxldCBkYXRhTWF0Y2ggPSAvXFw/KGRhdGF8ZXJyb3IpPSguKykvLmV4ZWMod2luZG93LmxvY2F0aW9uLmhyZWYpO1xyXG4gICAgaWYgKGRhdGFNYXRjaCAmJiBkYXRhTWF0Y2hbMV0gJiYgZGF0YU1hdGNoWzJdKSB7XHJcbiAgICAgIGxldCBkYXRhID0ge1xyXG4gICAgICAgIGRhdGE6IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KGRhdGFNYXRjaFsyXS5yZXBsYWNlKC8jLiovLCAnJykpKVxyXG4gICAgICB9XHJcbiAgICAgIGRhdGEuc3RhdHVzID0gKGRhdGFNYXRjaFsxXSA9PT0gJ2RhdGEnKSA/IDIwMCA6IDA7XHJcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdTT0NJQUxfREFUQScsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcclxuICAgICAgLy8gdmFyIGlzSUUgPSBmYWxzZSB8fCAhIWRvY3VtZW50LmRvY3VtZW50TW9kZTtcclxuICAgICAgLy8gaWYgKCFpc0lFKSB7XHJcbiAgICAgIC8vICAgd2luZG93Lm9wZW5lci5wb3N0TWVzc2FnZShKU09OLnN0cmluZ2lmeShkYXRhKSwgbG9jYXRpb24ub3JpZ2luKTtcclxuICAgICAgLy8gfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbn1cclxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhY2thbmRcclxuIiwiaW1wb3J0IHsgUHJvbWlzZSB9IGZyb20gJ2VzNi1wcm9taXNlJ1xyXG5pbXBvcnQgeyBVUkxTLCBFVkVOVFMsIFNPQ0lBTF9QUk9WSURFUlMgfSBmcm9tICcuLy4uL2NvbnN0YW50cydcclxuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vLi4vZGVmYXVsdHMnXG5cclxuZXhwb3J0IGRlZmF1bHQge1xyXG4gIF9faGFuZGxlUmVmcmVzaFRva2VuX18sXHJcbiAgdXNlQW5vbnltb3VzQXV0aCxcclxuICBzaWduaW4sXHJcbiAgc2lnbnVwLFxyXG4gIHNvY2lhbFNpZ25pbixcclxuICBzb2NpYWxTaWduaW5XaXRoVG9rZW4sXHJcbiAgc29jaWFsU2lnbnVwLFxyXG4gIHJlcXVlc3RSZXNldFBhc3N3b3JkLFxyXG4gIHJlc2V0UGFzc3dvcmQsXHJcbiAgY2hhbmdlUGFzc3dvcmQsXHJcbiAgc2lnbm91dCxcclxuICAvLyBnZXRVc2VyRGV0YWlscyxcclxuICBnZXRTb2NpYWxQcm92aWRlcnMsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXyAoc3RhdHVzID0gMCwgc3RhdHVzVGV4dCA9ICcnLCBoZWFkZXJzID0gW10sIGRhdGEgPSAnJykge1xyXG4gIHJldHVybiB7XHJcbiAgICBzdGF0dXMsXHJcbiAgICBzdGF0dXNUZXh0LFxyXG4gICAgaGVhZGVycyxcclxuICAgIGRhdGFcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gX19kaXNwYXRjaEV2ZW50X18gKG5hbWUpIHtcclxuICBsZXQgZXZlbnQ7XHJcbiAgaWYoZGVmYXVsdHMuaXNNb2JpbGUpXHJcbiAgICByZXR1cm47XHJcbiAgaWYgKGRvY3VtZW50LmNyZWF0ZUV2ZW50KSB7XHJcbiAgICBldmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xyXG4gICAgZXZlbnQuaW5pdEV2ZW50KG5hbWUsIHRydWUsIHRydWUpO1xyXG4gICAgZXZlbnQuZXZlbnROYW1lID0gbmFtZTtcclxuICAgIHdpbmRvdy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcclxuICB9IGVsc2Uge1xyXG4gICAgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudE9iamVjdCgpO1xyXG4gICAgZXZlbnQuZXZlbnRUeXBlID0gbmFtZTtcclxuICAgIGV2ZW50LmV2ZW50TmFtZSA9IG5hbWU7XHJcbiAgICB3aW5kb3cuZmlyZUV2ZW50KCdvbicgKyBldmVudC5ldmVudFR5cGUsIGV2ZW50KTtcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gX19oYW5kbGVSZWZyZXNoVG9rZW5fXyAoZXJyb3IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgbGV0IHVzZXIgPSBiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJyk7XHJcbiAgICBpZiAoIXVzZXIgfHwgIXVzZXIuZGV0YWlscy5yZWZyZXNoX3Rva2VuKSB7XHJcbiAgICAgIHJlamVjdChfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMCwgJycsIFtdLCAnTm8gY2FjaGVkIHVzZXIgb3IgcmVmcmVzaFRva2VuIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgX19zaWduaW5XaXRoVG9rZW5fXyh7XHJcbiAgICAgICAgdXNlcm5hbWU6IHVzZXIuZGV0YWlscy51c2VybmFtZSxcclxuICAgICAgICByZWZyZXNoVG9rZW46IHVzZXIuZGV0YWlscy5yZWZyZXNoX3Rva2VuLFxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfSlcclxufTtcclxuZnVuY3Rpb24gdXNlQW5vbnltb3VzQXV0aCAoc2NiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGxldCBkZXRhaWxzID0ge1xyXG4gICAgICBcImFjY2Vzc190b2tlblwiOiBkZWZhdWx0cy5hbm9ueW1vdXNUb2tlbixcclxuICAgICAgXCJ0b2tlbl90eXBlXCI6IFwiQW5vbnltb3VzVG9rZW5cIixcclxuICAgICAgXCJleHBpcmVzX2luXCI6IDAsXHJcbiAgICAgIFwiYXBwTmFtZVwiOiBkZWZhdWx0cy5hcHBOYW1lLFxyXG4gICAgICBcInVzZXJuYW1lXCI6IFwiR3Vlc3RcIixcclxuICAgICAgXCJyb2xlXCI6IFwiVXNlclwiLFxyXG4gICAgICBcImZpcnN0TmFtZVwiOiBcImFub255bW91c1wiLFxyXG4gICAgICBcImxhc3ROYW1lXCI6IFwiYW5vbnltb3VzXCIsXHJcbiAgICAgIFwiZnVsbE5hbWVcIjogXCJcIixcclxuICAgICAgXCJyZWdJZFwiOiAwICxcclxuICAgICAgXCJ1c2VySWRcIjogbnVsbFxyXG4gICAgfVxyXG4gICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnNldCgndXNlcicsIHtcclxuICAgICAgdG9rZW46IHtcclxuICAgICAgICBBbm9ueW1vdXNUb2tlbjogZGVmYXVsdHMuYW5vbnltb3VzVG9rZW5cclxuICAgICAgfSxcclxuICAgICAgZGV0YWlscyxcclxuICAgIH0pO1xyXG4gICAgX19kaXNwYXRjaEV2ZW50X18oRVZFTlRTLlNJR05JTik7XHJcbiAgICBpZiAoZGVmYXVsdHMucnVuU29ja2V0KSB7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc29ja2V0LmNvbm5lY3QobnVsbCwgZGVmYXVsdHMuYW5vbnltb3VzVG9rZW4sIGRlZmF1bHRzLmFwcE5hbWUpO1xyXG4gICAgfVxyXG4gICAgc2NiICYmIHNjYihfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgZGV0YWlscykpO1xyXG4gICAgcmVzb2x2ZShfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18oMjAwLCAnT0snLCBbXSwgZGV0YWlscykpO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIHNpZ25pbiAodXNlcm5hbWUsIHBhc3N3b3JkLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMudG9rZW4sXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnXHJcbiAgICAgIH0sXHJcbiAgICAgIGRhdGE6IGB1c2VybmFtZT0ke3VzZXJuYW1lfSZwYXNzd29yZD0ke3Bhc3N3b3JkfSZhcHBOYW1lPSR7ZGVmYXVsdHMuYXBwTmFtZX0mZ3JhbnRfdHlwZT1wYXNzd29yZGBcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlbn1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWxzOiByZXNwb25zZS5kYXRhXHJcbiAgICAgIH0pO1xyXG4gICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICAgIGJhY2thbmQudXRpbHMuc29ja2V0LmNvbm5lY3QoYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24sIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgICAgfVxyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufVxyXG5mdW5jdGlvbiBzaWdudXAgKGVtYWlsLCBwYXNzd29yZCwgY29uZmlybVBhc3N3b3JkLCBmaXJzdE5hbWUsIGxhc3ROYW1lLCBwYXJhbWV0ZXJzID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICAgIHVybDogVVJMUy5zaWdudXAsXHJcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgJ1NpZ25VcFRva2VuJzogZGVmYXVsdHMuc2lnblVwVG9rZW5cclxuICAgICAgfSxcclxuICAgICAgZGF0YToge1xyXG4gICAgICAgIGZpcnN0TmFtZSxcclxuICAgICAgICBsYXN0TmFtZSxcclxuICAgICAgICBlbWFpbCxcclxuICAgICAgICBwYXNzd29yZCxcclxuICAgICAgICBjb25maXJtUGFzc3dvcmQsXHJcbiAgICAgICAgcGFyYW1ldGVyc1xyXG4gICAgICB9XHJcbiAgICB9LCBzY2IgLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIF9fZGlzcGF0Y2hFdmVudF9fKEVWRU5UUy5TSUdOVVApO1xyXG4gICAgICBpZihkZWZhdWx0cy5ydW5TaWduaW5BZnRlclNpZ251cCkge1xyXG4gICAgICAgIHJldHVybiBzaWduaW4ocmVzcG9uc2UuZGF0YS51c2VybmFtZSwgcGFzc3dvcmQpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICB9KVxyXG4gICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufVxyXG5mdW5jdGlvbiBfX2dldFNvY2lhbFVybF9fIChwcm92aWRlck5hbWUsIGlzU2lnbnVwLCBpc0F1dG9TaWduVXApIHtcclxuICBsZXQgcHJvdmlkZXIgPSBTT0NJQUxfUFJPVklERVJTW3Byb3ZpZGVyTmFtZV07XHJcbiAgbGV0IGFjdGlvbiA9IGlzU2lnbnVwID8gJ3VwJyA6ICdpbic7XHJcbiAgbGV0IGF1dG9TaWduVXBQYXJhbSA9IGAmc2lnbnVwSWZOb3RTaWduZWRJbj0keyghaXNTaWdudXAgJiYgaXNBdXRvU2lnblVwKSA/ICd0cnVlJyA6ICdmYWxzZSd9YDtcclxuICByZXR1cm4gYC91c2VyL3NvY2lhbFNpZ24ke2FjdGlvbn0/cHJvdmlkZXI9JHtwcm92aWRlci5sYWJlbH0ke2F1dG9TaWduVXBQYXJhbX0mcmVzcG9uc2VfdHlwZT10b2tlbiZjbGllbnRfaWQ9c2VsZiZyZWRpcmVjdF91cmk9JHtwcm92aWRlci51cmx9JnN0YXRlPWA7XHJcbn1cclxuZnVuY3Rpb24gX19zb2NpYWxBdXRoX18gKHByb3ZpZGVyLCBpc1NpZ25VcCwgc3BlYywgZW1haWwpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgaWYgKCFTT0NJQUxfUFJPVklERVJTW3Byb3ZpZGVyXSkge1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ1Vua25vd24gU29jaWFsIFByb3ZpZGVyJykpO1xyXG4gICAgfVxyXG4gICAgbGV0IHVybCA9ICBgJHtkZWZhdWx0cy5hcGlVcmx9LzEvJHtfX2dldFNvY2lhbFVybF9fKHByb3ZpZGVyLCBpc1NpZ25VcCwgdHJ1ZSl9JmFwcG5hbWU9JHtkZWZhdWx0cy5hcHBOYW1lfSR7ZW1haWwgPyAnJmVtYWlsPScrZW1haWwgOiAnJ30mcmV0dXJuQWRkcmVzcz1gIC8vICR7bG9jYXRpb24uaHJlZn1cbiAgICBsZXQgcG9wdXAgPSBudWxsO1xuICAgIGlmICghYmFja2FuZC51dGlscy5pc0lFKSB7XG4gICAgICBwb3B1cCA9IHdpbmRvdy5vcGVuKHVybCwgJ3NvY2lhbHBvcHVwJywgc3BlYyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcG9wdXAgPSB3aW5kb3cub3BlbignJywgJycsIHNwZWMpO1xuICAgICAgcG9wdXAubG9jYXRpb24gPSB1cmw7XG4gICAgfVxuICAgIGlmIChwb3B1cCAmJiBwb3B1cC5mb2N1cykgeyBwb3B1cC5mb2N1cygpIH1cclxuXHJcbiAgICBsZXQgaGFuZGxlciA9IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgbGV0IHVybCA9IGUudHlwZSA9PT0gJ21lc3NhZ2UnID8gZS5vcmlnaW4gOiBlLnVybDtcclxuICAgICAgaWYgKHVybC5pbmRleE9mKHdpbmRvdy5sb2NhdGlvbi5ocmVmKSA9PT0gLTEpIHtcclxuICAgICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ1Vua25vd24gT3JpZ2luIE1lc3NhZ2UnKSk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGxldCByZXMgPSBlLnR5cGUgPT09ICdtZXNzYWdlJyA/IEpTT04ucGFyc2UoZS5kYXRhKSA6IEpTT04ucGFyc2UoZS5uZXdWYWx1ZSk7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKGUudHlwZSwgaGFuZGxlciwgZmFsc2UpO1xyXG4gICAgICBpZiAocG9wdXAgJiYgcG9wdXAuY2xvc2UpIHsgcG9wdXAuY2xvc2UoKSB9XHJcbiAgICAgIGUudHlwZSA9PT0gJ3N0b3JhZ2UnICYmIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKGUua2V5KTtcclxuXHJcbiAgICAgIGlmIChyZXMuc3RhdHVzICE9IDIwMCkge1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHJlc29sdmUocmVzKTtcclxuICAgICAgfVxyXG5cclxuICAgIH1cclxuICAgIGhhbmRsZXIgPSBoYW5kbGVyLmJpbmQocG9wdXApO1xyXG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignc3RvcmFnZScsIGhhbmRsZXIgLCBmYWxzZSk7XHJcbiAgICAvLyB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGhhbmRsZXIsIGZhbHNlKTtcclxuICB9KTtcclxufVxyXG5mdW5jdGlvbiBzb2NpYWxTaWduaW4gKHByb3ZpZGVyLCBzY2IsIGVjYiwgc3BlYyA9ICdsZWZ0PTEsIHRvcD0xLCB3aWR0aD01MDAsIGhlaWdodD01NjAnKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIF9fc29jaWFsQXV0aF9fKHByb3ZpZGVyLCBmYWxzZSwgc3BlYywgJycpXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTlVQKTtcclxuICAgICAgICByZXR1cm4gX19zaWduaW5XaXRoVG9rZW5fXyh7XHJcbiAgICAgICAgICBhY2Nlc3NUb2tlbjogcmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW5cclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gIH0pO1xyXG59O1xyXG5mdW5jdGlvbiBzb2NpYWxTaWduaW5XaXRoVG9rZW4gKHByb3ZpZGVyLCB0b2tlbiwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnNvY2lhbFNpZ25pbldpdGhUb2tlbi5yZXBsYWNlKCdQUk9WSURFUicsIHByb3ZpZGVyKSxcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgYWNjZXNzVG9rZW46IHRva2VuLFxyXG4gICAgICAgIGFwcE5hbWU6IGRlZmF1bHRzLmFwcE5hbWUsXHJcbiAgICAgICAgc2lnbnVwSWZOb3RTaWduZWRJbjogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlbn1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWxzOiByZXNwb25zZS5kYXRhXHJcbiAgICAgIH0pO1xyXG4gICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICAgIGJhY2thbmQudXRpbHMuc29ja2V0LmNvbm5lY3QoYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24sIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgICAgfVxyXG4gICAgICAvLyBUT0RPOlBBVENIXHJcbiAgICAgIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICAgICAgdXJsOiBgJHtVUkxTLm9iamVjdHN9L3VzZXJzYCxcclxuICAgICAgICBtZXRob2Q6ICdHRVQnLFxyXG4gICAgICAgIHBhcmFtczoge1xyXG4gICAgICAgICAgZmlsdGVyOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBcImZpZWxkTmFtZVwiOiBcImVtYWlsXCIsXHJcbiAgICAgICAgICAgICAgXCJvcGVyYXRvclwiOiBcImVxdWFsc1wiLFxyXG4gICAgICAgICAgICAgIFwidmFsdWVcIjogcmVzcG9uc2UuZGF0YS51c2VybmFtZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgfSlcclxuICAgICAgLnRoZW4ocGF0Y2ggPT4ge1xyXG4gICAgICAgIGxldCB7aWQsIGZpcnN0TmFtZSwgbGFzdE5hbWV9ID0gcGF0Y2guZGF0YS5kYXRhWzBdO1xuICAgICAgICBsZXQgdXNlciA9IGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcbiAgICAgICAgbGV0IG5ld0RldGFpbHMgPSAge3VzZXJJZDogaWQudG9TdHJpbmcoKSwgZmlyc3ROYW1lLCBsYXN0TmFtZX07XG4gICAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XG4gICAgICAgICAgdG9rZW46IHVzZXIudG9rZW4sXG4gICAgICAgICAgZGV0YWlsczogT2JqZWN0LmFzc2lnbih7fSwgdXNlci5kZXRhaWxzLCBuZXdEZXRhaWxzKVxuICAgICAgICB9KTtcbiAgICAgICAgdXNlciA9IGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgICAgICBsZXQgcmVzID0gX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKHJlc3BvbnNlLnN0YXR1cywgcmVzcG9uc2Uuc3RhdHVzVGV4dCwgcmVzcG9uc2UuaGVhZGVycywgdXNlci5kZXRhaWxzKTtcclxuICAgICAgICBzY2IgJiYgc2NiKHJlcyk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICB9KVxyXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgIGVjYiAmJiBlY2IoZXJyb3IpO1xyXG4gICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgIH0pO1xyXG4gICAgICAvLyBFT1BcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBlY2IgJiYgZWNiKGVycm9yKTtcclxuICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59O1xyXG5mdW5jdGlvbiBzb2NpYWxTaWdudXAgKHByb3ZpZGVyLCBlbWFpbCwgc2NiLCBlY2IsIHNwZWMgPSAnbGVmdD0xLCB0b3A9MSwgd2lkdGg9NTAwLCBoZWlnaHQ9NTYwJykge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBfX3NvY2lhbEF1dGhfXyhwcm92aWRlciwgdHJ1ZSwgc3BlYywgZW1haWwpXHJcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTlVQKTtcclxuICAgICAgICBpZihkZWZhdWx0cy5ydW5TaWduaW5BZnRlclNpZ251cCkge1xyXG4gICAgICAgICAgcmV0dXJuIF9fc2lnbmluV2l0aFRva2VuX18oe1xyXG4gICAgICAgICAgICBhY2Nlc3NUb2tlbjogcmVzcG9uc2UuZGF0YS5hY2Nlc3NfdG9rZW5cclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UpO1xyXG4gICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgZWNiICYmIGVjYihlcnJvcik7XHJcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgfSk7XHJcbiAgfSk7XHJcblxyXG59XHJcbmZ1bmN0aW9uIF9fc2lnbmluV2l0aFRva2VuX18gKHRva2VuRGF0YSkge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgZGF0YSA9IFtdO1xyXG4gICAgZm9yIChsZXQgb2JqIGluIHRva2VuRGF0YSkge1xyXG4gICAgICAgIGRhdGEucHVzaChlbmNvZGVVUklDb21wb25lbnQob2JqKSArICc9JyArIGVuY29kZVVSSUNvbXBvbmVudCh0b2tlbkRhdGFbb2JqXSkpO1xyXG4gICAgfVxyXG4gICAgZGF0YSA9IGRhdGEuam9pbihcIiZcIik7XHJcblxyXG4gICAgYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnRva2VuLFxyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJ1xyXG4gICAgICB9LFxyXG4gICAgICBkYXRhOiBgJHtkYXRhfSZhcHBOYW1lPSR7ZGVmYXVsdHMuYXBwTmFtZX0mZ3JhbnRfdHlwZT1wYXNzd29yZGBcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHtcclxuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZXNwb25zZS5kYXRhLmFjY2Vzc190b2tlbn1gXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRhaWxzOiByZXNwb25zZS5kYXRhXHJcbiAgICAgIH0pO1xyXG4gICAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTklOKTtcclxuICAgICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICAgIGJhY2thbmQudXRpbHMuc29ja2V0LmNvbm5lY3QoYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpLnRva2VuLkF1dGhvcml6YXRpb24sIGRlZmF1bHRzLmFub255bW91c1Rva2VuLCBkZWZhdWx0cy5hcHBOYW1lKTtcclxuICAgICAgfVxyXG4gICAgICByZXNvbHZlKHJlc3BvbnNlKTtcclxuICAgIH0pXHJcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICB9KTtcclxuICB9KTtcclxufVxyXG5mdW5jdGlvbiByZXF1ZXN0UmVzZXRQYXNzd29yZCAodXNlcm5hbWUsIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMucmVxdWVzdFJlc2V0UGFzc3dvcmQsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBhcHBOYW1lOiBkZWZhdWx0cy5hcHBOYW1lLFxyXG4gICAgICAgIHVzZXJuYW1lXHJcbiAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZnVuY3Rpb24gcmVzZXRQYXNzd29yZCAobmV3UGFzc3dvcmQsIHJlc2V0VG9rZW4sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IFVSTFMucmVzZXRQYXNzd29yZCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIG5ld1Bhc3N3b3JkLFxyXG4gICAgICAgIHJlc2V0VG9rZW5cclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiBjaGFuZ2VQYXNzd29yZCAob2xkUGFzc3dvcmQsIG5ld1Bhc3N3b3JkLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBVUkxTLmNoYW5nZVBhc3N3b3JkLFxyXG4gICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICBkYXRhOiB7XHJcbiAgICAgICAgb2xkUGFzc3dvcmQsXHJcbiAgICAgICAgbmV3UGFzc3dvcmRcclxuICAgIH1cclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiBzaWdub3V0IChzY2IpIHtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgICAgdXJsOiBVUkxTLnNpZ25vdXQsXHJcbiAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICB9KVxyXG4gICAgYmFja2FuZC51dGlscy5zdG9yYWdlLnJlbW92ZSgndXNlcicpO1xyXG4gICAgaWYgKGRlZmF1bHRzLnJ1blNvY2tldCkge1xyXG4gICAgICBiYWNrYW5kLnV0aWxzLnNvY2tldC5kaXNjb25uZWN0KCk7XHJcbiAgICB9XHJcbiAgICBfX2Rpc3BhdGNoRXZlbnRfXyhFVkVOVFMuU0lHTk9VVCk7XHJcbiAgICBzY2IgJiYgc2NiKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCBiYWNrYW5kLnV0aWxzLnN0b3JhZ2UuZ2V0KCd1c2VyJykpKTtcclxuICAgIHJlc29sdmUoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKSkpO1xyXG4gIH0pO1xyXG59XHJcbmZ1bmN0aW9uIGdldFNvY2lhbFByb3ZpZGVycyAoc2NiKSB7XHJcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgIHNjYiAmJiBzY2IoU09DSUFMX1BST1ZJREVSUyk7XHJcbiAgICByZXNvbHZlKFNPQ0lBTF9QUk9WSURFUlMpO1xyXG4gIH0pO1xyXG59XHJcbiIsImltcG9ydCB7IFVSTFMgfSBmcm9tICcuLy4uL2NvbnN0YW50cydcblxuZXhwb3J0IGRlZmF1bHQge1xuICB1cGxvYWQsXG4gIHJlbW92ZSxcbn1cblxuZnVuY3Rpb24gdXBsb2FkIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBmaWxlZGF0YSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzQWN0aW9ufS8ke29iamVjdH0/bmFtZT0ke2ZpbGVBY3Rpb259YCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YToge1xyXG4gICAgICAgIGZpbGVuYW1lLFxyXG4gICAgICAgIGZpbGVkYXRhOiBmaWxlZGF0YS5zdWJzdHIoZmlsZWRhdGEuaW5kZXhPZignLCcpICsgMSwgZmlsZWRhdGEubGVuZ3RoKVxyXG4gICAgICB9XHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZnVuY3Rpb24gcmVtb3ZlIChvYmplY3QsIGZpbGVBY3Rpb24sIGZpbGVuYW1lLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHNBY3Rpb259LyR7b2JqZWN0fT9uYW1lPSR7ZmlsZUFjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgfVxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XG4iLCJpbXBvcnQgeyBVUkxTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgZ2V0TGlzdCxcclxuICBjcmVhdGUsXHJcbiAgZ2V0T25lLFxyXG4gIHVwZGF0ZSxcclxuICByZW1vdmUsXHJcbiAgYWN0aW9uOiB7XHJcbiAgICBnZXQsXHJcbiAgICBwb3N0LFxyXG4gIH0sXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9fYWxsb3dlZFBhcmFtc19fIChhbGxvd2VkUGFyYW1zLCBwYXJhbXMpIHtcclxuICBsZXQgbmV3UGFyYW1zID0ge307XHJcbiAgZm9yIChsZXQgcGFyYW0gaW4gcGFyYW1zKSB7XHJcbiAgICBpZiAoYWxsb3dlZFBhcmFtcy5pbmRleE9mKHBhcmFtKSAhPSAtMSkge1xyXG4gICAgICBuZXdQYXJhbXNbcGFyYW1dID0gcGFyYW1zW3BhcmFtXTtcclxuICAgIH1cclxuICB9XHJcbiAgcmV0dXJuIG5ld1BhcmFtcztcclxufVxyXG5mdW5jdGlvbiBnZXRMaXN0IChvYmplY3QsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3BhZ2VTaXplJywncGFnZU51bWJlcicsJ2ZpbHRlcicsJ3NvcnQnLCdzZWFyY2gnLCdleGNsdWRlJywnZGVlcCcsJ3JlbGF0ZWRPYmplY3RzJ107XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9YCxcclxuICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICBwYXJhbXM6IF9fYWxsb3dlZFBhcmFtc19fKGFsbG93ZWRQYXJhbXMsIHBhcmFtcyksXHJcbiAgfSwgbnVsbCwgZWNiKVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICBsZXQgdG90YWxSb3dzID0gcmVzcG9uc2UuZGF0YVsndG90YWxSb3dzJ107XHJcbiAgICAgIHJlc3BvbnNlLmRhdGEgPSByZXNwb25zZS5kYXRhWydkYXRhJ107XHJcbiAgICAgIHNjYiAmJiBzY2IocmVzcG9uc2UsIHRvdGFsUm93cyk7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIGNyZWF0ZSAob2JqZWN0LCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICBjb25zdCBhbGxvd2VkUGFyYW1zID0gWydyZXR1cm5PYmplY3QnLCdkZWVwJ107XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c30vJHtvYmplY3R9YCxcclxuICAgIG1ldGhvZDogJ1BPU1QnLFxyXG4gICAgZGF0YSxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiBnZXRPbmUgKG9iamVjdCwgaWQsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ2RlZXAnLCdleGNsdWRlJywnbGV2ZWwnXTtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtczogX19hbGxvd2VkUGFyYW1zX18oYWxsb3dlZFBhcmFtcywgcGFyYW1zKSxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiB1cGRhdGUgKG9iamVjdCwgaWQsIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xyXG4gIGNvbnN0IGFsbG93ZWRQYXJhbXMgPSBbJ3JldHVybk9iamVjdCcsJ2RlZXAnXTtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzfS8ke29iamVjdH0vJHtpZH1gLFxyXG4gICAgbWV0aG9kOiAnUFVUJyxcclxuICAgIGRhdGEsXHJcbiAgICBwYXJhbXM6IF9fYWxsb3dlZFBhcmFtc19fKGFsbG93ZWRQYXJhbXMsIHBhcmFtcyksXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuZnVuY3Rpb24gcmVtb3ZlIChvYmplY3QsIGlkLCBzY2IsIGVjYikge1xyXG4gIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgdXJsOiBgJHtVUkxTLm9iamVjdHN9LyR7b2JqZWN0fS8ke2lkfWAsXHJcbiAgICBtZXRob2Q6ICdERUxFVEUnLFxyXG4gIH0sIHNjYiwgZWNiKVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXQgKG9iamVjdCwgYWN0aW9uLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5vYmplY3RzQWN0aW9ufS8ke29iamVjdH0/bmFtZT0ke2FjdGlvbn1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtcyxcclxuICB9LCBzY2IsIGVjYilcclxufVxuZnVuY3Rpb24gcG9zdCAob2JqZWN0LCBhY3Rpb24sIGRhdGEsIHBhcmFtcyA9IHt9LCBzY2IsIGVjYikge1xuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcbiAgICB1cmw6IGAke1VSTFMub2JqZWN0c0FjdGlvbn0vJHtvYmplY3R9P25hbWU9JHthY3Rpb259YCxcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBkYXRhLFxuICAgIHBhcmFtcyxcbiAgfSwgc2NiLCBlY2IpXG59XG4iLCJpbXBvcnQgeyBVUkxTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgZ2V0LFxyXG4gIHBvc3QsXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldCAobmFtZSwgcGFyYW1zID0ge30sIHNjYiwgZWNiKSB7XHJcbiAgcmV0dXJuIGJhY2thbmQudXRpbHMuaHR0cCh7XHJcbiAgICB1cmw6IGAke1VSTFMucXVlcnl9LyR7bmFtZX1gLFxyXG4gICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIHBhcmFtcyxcclxuICB9LCBzY2IsIGVjYilcclxufVxyXG5mdW5jdGlvbiBwb3N0IChuYW1lLCBkYXRhLCBwYXJhbXMgPSB7fSwgc2NiLCBlY2IpIHtcclxuICByZXR1cm4gYmFja2FuZC51dGlscy5odHRwKHtcclxuICAgIHVybDogYCR7VVJMUy5xdWVyeX0vJHtuYW1lfWAsXHJcbiAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgIGRhdGEsXHJcbiAgICBwYXJhbXMsXHJcbiAgfSwgc2NiLCBlY2IpXHJcbn1cclxuIiwiaW1wb3J0IHsgUHJvbWlzZSB9IGZyb20gJ2VzNi1wcm9taXNlJ1xyXG5pbXBvcnQgeyBVUkxTIH0gZnJvbSAnLi8uLi9jb25zdGFudHMnXHJcblxyXG5leHBvcnQgZGVmYXVsdCB7XHJcbiAgZ2V0VXNlckRldGFpbHMsXHJcbiAgZ2V0VXNlcm5hbWUsXHJcbiAgZ2V0VXNlclJvbGUsXHJcbiAgZ2V0VG9rZW4sXHJcbiAgZ2V0UmVmcmVzaFRva2VuLFxyXG59XHJcblxyXG5mdW5jdGlvbiBfX2dlbmVyYXRlRmFrZVJlc3BvbnNlX18gKHN0YXR1cyA9IDAsIHN0YXR1c1RleHQgPSAnJywgaGVhZGVycyA9IFtdLCBkYXRhID0gJycpIHtcclxuICByZXR1cm4ge1xyXG4gICAgc3RhdHVzLFxyXG4gICAgc3RhdHVzVGV4dCxcclxuICAgIGhlYWRlcnMsXHJcbiAgICBkYXRhXHJcbiAgfVxyXG59XHJcbmZ1bmN0aW9uIF9fZ2V0VXNlckRldGFpbHNGcm9tU3RvcmFnZV9fIChzY2IsIGVjYikge1xyXG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICBsZXQgdXNlciA9IGJhY2thbmQudXRpbHMuc3RvcmFnZS5nZXQoJ3VzZXInKTtcclxuICAgIGlmICghdXNlcikge1xyXG4gICAgICBlY2IgJiYgZWNiKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygwLCAnJywgW10sICdObyBjYWNoZWQgdXNlciBmb3VuZC4gYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuJykpO1xyXG4gICAgICByZWplY3QoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDAsICcnLCBbXSwgJ05vIGNhY2hlZCB1c2VyIGZvdW5kLiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZC4nKSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcbiAgICAgIHNjYiAmJiBzY2IoX19nZW5lcmF0ZUZha2VSZXNwb25zZV9fKDIwMCwgJ09LJywgW10sIHVzZXIuZGV0YWlscykpO1xyXG4gICAgICByZXNvbHZlKF9fZ2VuZXJhdGVGYWtlUmVzcG9uc2VfXygyMDAsICdPSycsIFtdLCB1c2VyLmRldGFpbHMpKTtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5mdW5jdGlvbiBnZXRVc2VyRGV0YWlscyAoc2NiLCBlY2IsIGZvcmNlID0gZmFsc2UpIHtcclxuICBpZiAoIWZvcmNlKSB7XHJcbiAgICByZXR1cm4gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18oc2NiLCBlY2IpO1xyXG4gIH1cclxuICBlbHNlIHtcclxuICAgIHJldHVybiBiYWNrYW5kLnV0aWxzLmh0dHAoe1xyXG4gICAgICB1cmw6IFVSTFMucHJvZmlsZSxcclxuICAgICAgbWV0aG9kOiAnR0VUJyxcclxuICAgIH0pXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIGxldCB1c2VyID0gYmFja2FuZC51dGlscy5zdG9yYWdlLmdldCgndXNlcicpO1xyXG4gICAgICBsZXQgbmV3RGV0YWlscyA9IHJlc3BvbnNlLmRhdGE7XHJcbiAgICAgIGJhY2thbmQudXRpbHMuc3RvcmFnZS5zZXQoJ3VzZXInLCB7XHJcbiAgICAgICAgdG9rZW46IHVzZXIudG9rZW4sXHJcbiAgICAgICAgZGV0YWlsczogT2JqZWN0LmFzc2lnbih7fSwgdXNlci5kZXRhaWxzLCBuZXdEZXRhaWxzKVxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuIF9fZ2V0VXNlckRldGFpbHNGcm9tU3RvcmFnZV9fKHNjYiwgZWNiKTtcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5mdW5jdGlvbiBnZXRVc2VybmFtZSAoc2NiLCBlY2IpIHtcclxuICByZXR1cm4gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18obnVsbCwgZWNiKVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICByZXNwb25zZS5kYXRhID0gcmVzcG9uc2UuZGF0YVsndXNlcm5hbWUnXTtcclxuICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIGdldFVzZXJSb2xlICgpIHtcclxuICByZXR1cm4gX19nZXRVc2VyRGV0YWlsc0Zyb21TdG9yYWdlX18obnVsbCwgZWNiKVxyXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICByZXNwb25zZS5kYXRhID0gcmVzcG9uc2UuZGF0YVsncm9sZSddO1xyXG4gICAgICBzY2IgJiYgc2NiKHJlc3BvbnNlKTtcclxuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xyXG4gICAgfSk7XHJcbn1cclxuZnVuY3Rpb24gZ2V0VG9rZW4gKCkge1xyXG4gIHJldHVybiBfX2dldFVzZXJEZXRhaWxzRnJvbVN0b3JhZ2VfXyhudWxsLCBlY2IpXHJcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XHJcbiAgICAgIHJlc3BvbnNlLmRhdGEgPSByZXNwb25zZS5kYXRhWydhY2Nlc3NfdG9rZW4nXTtcclxuICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pO1xyXG59XHJcbmZ1bmN0aW9uIGdldFJlZnJlc2hUb2tlbiAoKSB7XHJcbiAgcmV0dXJuIF9fZ2V0VXNlckRldGFpbHNGcm9tU3RvcmFnZV9fKG51bGwsIGVjYilcclxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgcmVzcG9uc2UuZGF0YSA9IHJlc3BvbnNlLmRhdGFbJ3JlZnJlc2hfdG9rZW4nXTtcclxuICAgICAgc2NiICYmIHNjYihyZXNwb25zZSk7XHJcbiAgICAgIHJldHVybiByZXNwb25zZTtcclxuICAgIH0pO1xyXG59XHJcbiIsImltcG9ydCB7IFByb21pc2UgfSBmcm9tICdlczYtcHJvbWlzZSdcclxuXHJcbmNsYXNzIEh0dHAge1xyXG4gIGNvbnN0cnVjdG9yIChjb25maWcgPSB7fSkge1xyXG4gICAgaWYgKCF3aW5kb3cuWE1MSHR0cFJlcXVlc3QpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignWE1MSHR0cFJlcXVlc3QgaXMgbm90IHN1cHBvcnRlZCBieSB0aGlzIHBsYXRmb3JtJyk7XHJcblxyXG4gICAgdGhpcy5jb25maWcgPSBPYmplY3QuYXNzaWduKHtcclxuICAgICAgLy8gdXJsOiAnLycsXHJcbiAgICAgIG1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIGhlYWRlcnM6IHt9LFxyXG4gICAgICBwYXJhbXM6IHt9LFxyXG4gICAgICBpbnRlcmNlcHRvcnM6IHt9LFxyXG4gICAgICB3aXRoQ3JlZGVudGlhbHM6IGZhbHNlLFxyXG4gICAgICByZXNwb25zZVR5cGU6ICdqc29uJyxcclxuICAgICAgLy8gdGltZW91dDogbnVsbCxcclxuICAgICAgYXV0aDoge1xyXG4gICAgICAgdXNlcm5hbWU6IG51bGwsXHJcbiAgICAgICBwYXNzd29yZDogbnVsbFxyXG4gICAgICB9XHJcbiAgICB9LCBjb25maWcpXHJcbiAgfVxyXG4gIF9nZXRIZWFkZXJzIChoZWFkZXJzKSB7XHJcbiAgICByZXR1cm4gaGVhZGVycy5zcGxpdCgnXFxyXFxuJykuZmlsdGVyKGhlYWRlciA9PiBoZWFkZXIpLm1hcChoZWFkZXIgPT4ge1xyXG4gICAgICBsZXQgamhlYWRlciA9IHt9XHJcbiAgICAgIGxldCBwYXJ0cyA9IGhlYWRlci5zcGxpdCgnOicpO1xyXG4gICAgICBqaGVhZGVyW3BhcnRzWzBdXSA9IHBhcnRzWzFdXHJcbiAgICAgIHJldHVybiBqaGVhZGVyO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIF9nZXREYXRhICh0eXBlLCBkYXRhKSB7XHJcbiAgICBpZiAoIXR5cGUpIHtcclxuICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICh0eXBlLmluZGV4T2YoJ2pzb24nKSA9PT0gLTEpIHtcclxuICAgICAgcmV0dXJuIGRhdGE7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIF9jcmVhdGVSZXNwb25zZSAocmVxLCBjb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN0YXR1czogcmVxLnN0YXR1cyxcclxuICAgICAgc3RhdHVzVGV4dDogcmVxLnN0YXR1c1RleHQsXHJcbiAgICAgIGhlYWRlcnM6IHRoaXMuX2dldEhlYWRlcnMocmVxLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKSxcclxuICAgICAgY29uZmlnLFxyXG4gICAgICBkYXRhOiB0aGlzLl9nZXREYXRhKHJlcS5nZXRSZXNwb25zZUhlYWRlcihcIkNvbnRlbnQtVHlwZVwiKSwgcmVxLnJlc3BvbnNlVGV4dCksXHJcbiAgICB9XHJcbiAgfVxyXG4gIF9oYW5kbGVFcnJvciAoZGF0YSwgY29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzdGF0dXM6IDAsXHJcbiAgICAgIHN0YXR1c1RleHQ6ICdFUlJPUicsXHJcbiAgICAgIGhlYWRlcnM6IFtdLFxyXG4gICAgICBjb25maWcsXHJcbiAgICAgIGRhdGEsXHJcbiAgICB9XHJcbiAgfVxyXG4gIF9lbmNvZGVQYXJhbXMgKHBhcmFtcykge1xyXG4gICAgbGV0IHBhcmFtc0FyciA9IFtdO1xyXG4gICAgZm9yIChsZXQgcGFyYW0gaW4gcGFyYW1zKSB7XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW3BhcmFtXTtcbiAgICAgIGlmICh0eXBlb2YgdmFsID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIHZhbCA9IEpTT04uc3RyaW5naWZ5KHZhbCk7XHJcbiAgICAgIH1cclxuICAgICAgcGFyYW1zQXJyLnB1c2goYCR7cGFyYW19PSR7ZW5jb2RlVVJJQ29tcG9uZW50KHZhbCl9YClcclxuICAgIH1cclxuICAgIHJldHVybiBwYXJhbXNBcnIuam9pbignJicpO1xyXG4gIH1cclxuICBfc2V0SGVhZGVycyAocmVxLCBoZWFkZXJzKSB7XHJcbiAgICBmb3IgKGxldCBoZWFkZXIgaW4gaGVhZGVycykge1xyXG4gICAgICByZXEuc2V0UmVxdWVzdEhlYWRlcihoZWFkZXIsIGhlYWRlcnNbaGVhZGVyXSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIF9zZXREYXRhIChyZXEsIGRhdGEpIHtcclxuICAgIGlmICghZGF0YSkge1xyXG4gICAgICByZXEuc2VuZCgpO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAodHlwZW9mIGRhdGEgIT0gJ29iamVjdCcpIHtcclxuICAgICAgcmVxLnNlbmQoZGF0YSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgcmVxLnNldFJlcXVlc3RIZWFkZXIoXCJDb250ZW50LVR5cGVcIiwgXCJhcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ9VVRGLThcIik7XHJcbiAgICAgIHJlcS5zZW5kKEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcclxuICAgIH1cclxuICB9XHJcbiAgcmVxdWVzdCAoY2ZnLCBzY2IgLCBlY2IpIHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcblxyXG4gICAgICBsZXQgcmVxID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XHJcbiAgICAgIGxldCBjb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmNvbmZpZywgY2ZnKTtcclxuXHJcbiAgICAgIGlmICghY29uZmlnLnVybCB8fCB0eXBlb2YgY29uZmlnLnVybCAhPT0gJ3N0cmluZycgfHwgY29uZmlnLnVybC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICBsZXQgcmVzID0gdGhpcy5faGFuZGxlRXJyb3IoJ3VybCBwYXJhbWV0ZXIgaXMgbWlzc2luZycsIGNvbmZpZyk7XHJcbiAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmIChjb25maWcud2l0aENyZWRlbnRpYWxzKSB7IHJlcS53aXRoQ3JlZGVudGlhbHMgPSB0cnVlIH1cclxuICAgICAgaWYgKGNvbmZpZy50aW1lb3V0KSB7IHJlcS50aW1lb3V0ID0gdHJ1ZSB9XHJcbiAgICAgIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVxdWVzdCAmJiBjb25maWcuaW50ZXJjZXB0b3JzLnJlcXVlc3QuY2FsbCh0aGlzLCBjb25maWcpO1xyXG4gICAgICBsZXQgcGFyYW1zID0gdGhpcy5fZW5jb2RlUGFyYW1zKGNvbmZpZy5wYXJhbXMpO1xyXG4gICAgICByZXEub3Blbihjb25maWcubWV0aG9kLCBgJHtjb25maWcuYmFzZVVSTCA/IGNvbmZpZy5iYXNlVVJMKycvJyA6ICcnfSR7Y29uZmlnLnVybH0ke3BhcmFtcyA/ICc/JytwYXJhbXMgOiAnJ31gLCB0cnVlLCBjb25maWcuYXV0aC51c2VybmFtZSwgY29uZmlnLmF1dGgucGFzc3dvcmQpO1xyXG4gICAgICByZXEub250aW1lb3V0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2hhbmRsZUVycm9yKCd0aW1lb3V0JywgY29uZmlnKTtcclxuICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgIH07XHJcbiAgICAgIHJlcS5vbmFib3J0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgbGV0IHJlcyA9IHRoaXMuX2hhbmRsZUVycm9yKCdhYm9ydCcsIGNvbmZpZyk7XHJcbiAgICAgICAgZWNiICYmIGVjYihyZXMpO1xyXG4gICAgICAgIHJlamVjdChyZXMpO1xyXG4gICAgICB9O1xyXG4gICAgICByZXEub25yZWFkeXN0YXRlY2hhbmdlID0gKCkgPT4ge1xyXG4gICAgICAgIGlmIChyZXEucmVhZHlTdGF0ZSA9PSBYTUxIdHRwUmVxdWVzdC5ET05FKSB7XHJcbiAgICAgICAgICBsZXQgcmVzID0gdGhpcy5fY3JlYXRlUmVzcG9uc2UocmVxLCBjb25maWcpO1xyXG4gICAgICAgICAgaWYgKHJlcy5zdGF0dXMgPT09IDIwMCl7XHJcbiAgICAgICAgICAgIGlmIChjb25maWcuaW50ZXJjZXB0b3JzLnJlc3BvbnNlKSB7XHJcbiAgICAgICAgICAgICAgY29uZmlnLmludGVyY2VwdG9ycy5yZXNwb25zZS5jYWxsKHRoaXMsIHJlcywgY29uZmlnLCByZXNvbHZlLCByZWplY3QsIHNjYiwgZWNiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICBzY2IgJiYgc2NiKHJlcyk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZShyZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2VFcnJvcikge1xyXG4gICAgICAgICAgICAgIGNvbmZpZy5pbnRlcmNlcHRvcnMucmVzcG9uc2VFcnJvci5jYWxsKHRoaXMsIHJlcywgY29uZmlnLCByZXNvbHZlLCByZWplY3QsIHNjYiwgZWNiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICBlY2IgJiYgZWNiKHJlcyk7XHJcbiAgICAgICAgICAgICAgcmVqZWN0KHJlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5fc2V0SGVhZGVycyhyZXEsIGNvbmZpZy5oZWFkZXJzKTtcclxuICAgICAgdGhpcy5fc2V0RGF0YShyZXEsIGNvbmZpZy5kYXRhKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbn1cclxuZnVuY3Rpb24gY3JlYXRlSW5zdGFuY2UoY29uZmlnID0ge30pIHtcclxuICB2YXIgY29udGV4dCA9IG5ldyBIdHRwKGNvbmZpZyk7XHJcbiAgdmFyIGluc3RhbmNlID0gKC4uLmFyZ3MpID0+IEh0dHAucHJvdG90eXBlLnJlcXVlc3QuYXBwbHkoY29udGV4dCwgYXJncyk7XHJcbiAgaW5zdGFuY2UuY29uZmlnID0gY29udGV4dC5jb25maWc7XHJcbiAgcmV0dXJuIGluc3RhbmNlO1xyXG59XHJcblxyXG52YXIgaHR0cCA9IGNyZWF0ZUluc3RhbmNlKCk7XHJcbmh0dHAuY3JlYXRlID0gKGNvbmZpZykgPT4ge1xyXG4gIHJldHVybiBjcmVhdGVJbnN0YW5jZShjb25maWcpO1xyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgaHR0cDtcclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU29ja2V0IHtcclxuICBjb25zdHJ1Y3RvciAodXJsKSB7XHJcbiAgICBpZiAoIXdpbmRvdy5pbylcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdydW5Tb2NrZXQgaXMgdHJ1ZSBidXQgc29ja2V0aW8tY2xpZW50IGlzIG5vdCBpbmNsdWRlZCcpO1xyXG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5vbkFyciA9IFtdO1xuICAgIHRoaXMuc29ja2V0ID0gbnVsbDtcbiAgfVxyXG4gIG9uIChldmVudE5hbWUsIGNhbGxiYWNrKSB7XHJcbiAgICB0aGlzLm9uQXJyLnB1c2goe2V2ZW50TmFtZSwgY2FsbGJhY2t9KTtcclxuICB9XHJcbiAgY29ubmVjdCAodG9rZW4sIGFub255bW91c1Rva2VuLCBhcHBOYW1lKSB7XHJcbiAgICB0aGlzLmRpc2Nvbm5lY3QoKTtcclxuICAgIHRoaXMuc29ja2V0ID0gaW8uY29ubmVjdCh0aGlzLnVybCwgeydmb3JjZU5ldyc6dHJ1ZSB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignY29ubmVjdCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGB0cnlpbmcgdG8gZXN0YWJsaXNoIGEgc29ja2V0IGNvbm5lY3Rpb24gdG8gJHthcHBOYW1lfSAuLi5gKTtcclxuICAgICAgdGhpcy5zb2NrZXQuZW1pdChcImxvZ2luXCIsIHRva2VuLCBhbm9ueW1vdXNUb2tlbiwgYXBwTmFtZSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbignYXV0aG9yaXplZCcsICgpID0+IHtcclxuICAgICAgY29uc29sZS5pbmZvKGBzb2NrZXQgY29ubmVjdGVkYCk7XHJcbiAgICAgIHRoaXMub25BcnIuZm9yRWFjaChmbiA9PiB7XHJcbiAgICAgICAgdGhpcy5zb2NrZXQub24oZm4uZXZlbnROYW1lLCBkYXRhID0+IHtcclxuICAgICAgICAgIGZuLmNhbGxiYWNrKGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdub3RBdXRob3JpemVkJywgKCkgPT4ge1xyXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZGlzY29ubmVjdCgpLCAxMDAwKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdkaXNjb25uZWN0JywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCBkaXNjb25uZWN0YCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnNvY2tldC5vbigncmVjb25uZWN0aW5nJywgKCkgPT4ge1xyXG4gICAgICBjb25zb2xlLmluZm8oYHNvY2tldCByZWNvbm5lY3RpbmdgKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xyXG4gICAgICBjb25zb2xlLndhcm4oYGVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGRpc2Nvbm5lY3QgKCkge1xyXG4gICAgaWYgKHRoaXMuc29ja2V0KSB7XHJcbiAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFN0b3JhZ2Uge1xyXG4gIGNvbnN0cnVjdG9yIChzdG9yYWdlLCBwcmVmaXggPSAnJykge1xyXG4gICAgaWYgKCFzdG9yYWdlKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQgYnkgdGhpcyBwbGF0Zm9ybScpO1xyXG4gICAgaWYgKCFzdG9yYWdlLnNldEl0ZW0gfHwgIXN0b3JhZ2UuZ2V0SXRlbSB8fCAhc3RvcmFnZS5yZW1vdmVJdGVtIHx8ICFzdG9yYWdlLmNsZWFyKVxyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBwcm92aWRlZCBTdG9yYWdlIG5vdCBpbXBsZW1lbnQgdGhlIG5lY2Vzc2FyeSBmdW5jdGlvbnMnKTtcclxuICAgIHRoaXMuc3RvcmFnZSA9IHN0b3JhZ2U7XHJcbiAgICB0aGlzLnByZWZpeCA9IHByZWZpeDtcclxuICAgIHRoaXMuZGVsaW1pdGVyID0gJ19fX19fX19fX18nO1xyXG4gIH1cclxuICBnZXQgKGtleSkge1xyXG4gICAgbGV0IGl0ZW0gPSB0aGlzLnN0b3JhZ2UuZ2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gKTtcclxuICAgIGlmICghaXRlbSkge1xyXG4gICAgICByZXR1cm4gaXRlbVxyXG4gICAgfVxyXG4gICAgZWxzZSB7XG4gICAgICBsZXQgW3R5cGUsIHZhbF0gPSBpdGVtLnNwbGl0KHRoaXMuZGVsaW1pdGVyKTtcbiAgICAgIGlmICh0eXBlICE9ICdKU09OJykge1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKHZhbCk7XG4gICAgICB9XG4gICAgfVxyXG4gIH1cclxuICBzZXQgKGtleSwgdmFsKSB7XHJcbiAgICBpZiAodHlwZW9mIHZhbCAhPSAnb2JqZWN0Jykge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgU1RSSU5HJHt0aGlzLmRlbGltaXRlcn0ke3ZhbH1gKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICB0aGlzLnN0b3JhZ2Uuc2V0SXRlbShgJHt0aGlzLnByZWZpeH0ke2tleX1gLCBgSlNPTiR7dGhpcy5kZWxpbWl0ZXJ9JHtKU09OLnN0cmluZ2lmeSh2YWwpfWApO1xyXG4gICAgfVxyXG4gIH1cclxuICByZW1vdmUgKGtleSkge1xyXG4gICAgdGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oYCR7dGhpcy5wcmVmaXh9JHtrZXl9YCk7XHJcbiAgfVxyXG4gIGNsZWFyICgpIHtcclxuICAgIGZvcih2YXIgaSA9MDsgaSA8IHRoaXMuc3RvcmFnZS5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICBpZih0aGlzLnN0b3JhZ2UuZ2V0SXRlbSh0aGlzLnN0b3JhZ2Uua2V5KGkpKS5pbmRleE9mKHRoaXMucHJlZml4KSAhPSAtMSlcclxuICAgICAgICB0aGlzLnJlbW92ZSh0aGlzLnN0b3JhZ2Uua2V5KGkpKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXX0=
