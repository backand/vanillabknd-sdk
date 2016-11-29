import { Promise } from 'es6-promise'
import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'

function __encodeParameters__ (allowedParams, params) {
  let uri = '?';
  for (let param in params) {
    if (allowedParams.indexOf(param) != -1) {
      uri = uri.concat(`${param}=${encodeURI(JSON.stringify(params[param]))}`)
    }
  }
  return uri;
}
export function getList (object, params, scb, ecb) {
  const allowedParams = ['pageSize','pageNumber','filter','sort','search','exclude','deep','relatedObjects'];
  return this.http({
    url: `${URLS.objects}/${object}${__encodeParameters__(allowedParams, params)}`,
    method: 'GET',
  }, scb, ecb)
}
export function create (object, data, params, scb, ecb) {
  const allowedParams = ['returnObject','deep'];
  return this.http({
    url: `${URLS.objects}/${object}${__encodeParameters__(allowedParams, params)}`,
    method: 'POST',
    data,
  }, scb, ecb)
}
export function getOne (object, id, params, scb, ecb) {
  const allowedParams = ['deep','exclude','level'];
  return this.http({
    url: `${URLS.objects}/${object}/${id}${__encodeParameters__(allowedParams, params)}`,
    method: 'GET',
  }, scb, ecb)
}
export function update (object, id, data, params, scb, ecb) {
  const allowedParams = ['returnObject','deep'];
  return this.http({
    url: `${URLS.objects}/${object}/${id}${__encodeParameters__(allowedParams, params)}`,
    method: 'PUT',
    data,
  }, scb, ecb)
}
export function remove (object, id, scb, ecb) {
  return this.http({
    url: `${URLS.objects}/${object}/${id}`,
    method: 'DELETE',
  }, scb, ecb)
}
