import { Promise } from 'es6-promise'
import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'

function __allowedParams__ (allowedParams, params) {
  let newParams = {};
  for (let param in params) {
    if (allowedParams.indexOf(param) != -1) {
      newParams[param] = params[param];
    }
  }
  return newParams;
}
export function getList (object, params = {}, scb, ecb) {
  const allowedParams = ['pageSize','pageNumber','filter','sort','search','exclude','deep','relatedObjects'];
  return this.http({
    url: `${URLS.objects}/${object}`,
    method: 'GET',
    params: __allowedParams__(allowedParams, params),
  }, scb, ecb)
}
export function create (object, data, params = {}, scb, ecb) {
  const allowedParams = ['returnObject','deep'];
  return this.http({
    url: `${URLS.objects}/${object}`,
    method: 'POST',
    data,
    params: __allowedParams__(allowedParams, params),
  }, scb, ecb)
}
export function getOne (object, id, params = {}, scb, ecb) {
  const allowedParams = ['deep','exclude','level'];
  return this.http({
    url: `${URLS.objects}/${object}/${id}`,
    method: 'GET',
    params: __allowedParams__(allowedParams, params),
  }, scb, ecb)
}
export function update (object, id, data, params = {}, scb, ecb) {
  const allowedParams = ['returnObject','deep'];
  return this.http({
    url: `${URLS.objects}/${object}/${id}`,
    method: 'PUT',
    data,
    params: __allowedParams__(allowedParams, params),
  }, scb, ecb)
}
export function remove (object, id, scb, ecb) {
  return this.http({
    url: `${URLS.objects}/${object}/${id}`,
    method: 'DELETE',
  }, scb, ecb)
}
