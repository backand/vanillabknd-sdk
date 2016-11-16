/***********************************************
 * backand JavaScript Library
 * Authors: backand
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 * Compiled At: 15/11/2016
 ***********************************************/
import BackandService from './BackandService'
import * as constants from './BackandConstants'
import * as utils from './BackandUtils';

(() => {
    'use strict';
    window['backand'] = {
      service: new BackandService(),
      constants,
      utils
    };
})();
