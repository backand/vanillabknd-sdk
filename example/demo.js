/***********************************************
 * backand JavaScript Library
 * Authors: backand
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 * Compiled At: 15/11/2016
 ***********************************************/
(function () {

    // init backand
    var app = backand.service;
    app.storage.setAppName('sdk');
    app.storage.setSignUpToken('851692ae-eb94-4f18-87ee-075255e67748');
    app.storage.setAnonymousToken('82cfcfe8-c718-4621-8bb6-cd600e23487f');

    var outputContainer = document.getElementById('outputContainer');
    var outputElement = document.getElementById('outputElement');
    var objectName = "items";

    var successCallback = function (response) {
        outputElement.innerText = '';
        outputContainer.classList.remove('panel-danger');
        outputContainer.classList.add('panel-success');
        outputElement.innerText = "status: " + response.status + "\n" + JSON.stringify(response.data);
    };
    var errorCallback = function (response) {
      outputElement.innerText = '';
      outputContainer.classList.remove('panel-success');
      outputContainer.classList.add('panel-danger');
      outputElement.innerText = "status: " + response.status + "\n" + JSON.stringify(response.data);
    };

    var lastCreatedId = null;

    // LOGIN
    document.getElementById('sigin_btn').addEventListener('click', function() {
        var username = document.getElementById('sigin_user').value;
        var password = document.getElementById('sigin_pass').value;
        app.signin(username, password, successCallback, errorCallback);
      }, false);

    document.getElementById('anonymous_btn').addEventListener('click', function() {
        app.useAnonymousAuth(successCallback);
      }, false);

    //CRUD
    document.getElementById('getitem_btn').disabled = true;
    document.getElementById('updateitem_btn').disabled = true;
    document.getElementById('deleteitem_btn').disabled = true;

    document.getElementById('postitem_btn').addEventListener('click', function() {
      app.postItem(objectName, {
        name:'test',
        description:'new item'
      }, {returnObject: true}, function (response) {
                lastCreatedId = response.data.__metadata.id;
                document.getElementById('getitem_btn').disabled = false;
                document.getElementById('updateitem_btn').disabled = false;
                document.getElementById('deleteitem_btn').disabled = false;
                successCallback(response);
              }, errorCallback);
    }, false);

    document.getElementById('getitems_btn').addEventListener('click', function() {
      app.getItems(objectName, {}, successCallback, errorCallback);
    }, false);

    document.getElementById('getitem_btn').addEventListener('click', function() {
      app.getItem(objectName, lastCreatedId, {}, successCallback, errorCallback);
    }, false);


    document.getElementById('updateitem_btn').addEventListener('click', function() {
      app.updateItem(objectName, lastCreatedId, {
        name:'test',
        description:'old item'
      }, {returnObject: true}, successCallback, errorCallback);
    }, false);

    document.getElementById('deleteitem_btn').addEventListener('click', function() {
      app.deleteItem(objectName, lastCreatedId, successCallback, errorCallback);
    }, false);


})();
