import { URLS } from './../constants'

export default {
  get,
  post,
}

function get (name, params = {}, scb, ecb) {
  return backand.utils.http({
    url: `${URLS.query}/${name}`,
    method: 'GET',
    params,
  }, scb, ecb)
}
function post (name, data, params = {}, scb, ecb) {
  return backand.utils.http({
    url: `${URLS.query}/${name}`,
    method: 'POST',
    data,
    params,
  }, scb, ecb)
}