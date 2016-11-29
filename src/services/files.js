import { Promise } from 'es6-promise'
import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'

export function uploadFile(objectName, fileActionName, filename, filedata, scb, ecb) {
  return this.http({
    url: `${URLS.objectsAction}/${objectName}?name=${fileActionName}`,
    method: 'POST',
    data: {
        filename,
        filedata: filedata.substr(filedata.indexOf(',') + 1, filedata.length)
      }
  }, scb, ecb)
}
export function deleteFile(objectName, fileActionName, filename, scb, ecb) {
  return this.http({
    url: `${URLS.objectsAction}/${objectName}?name=${fileActionName}`,
    method: 'DELETE',
    data: {
        filename,
      }
  }, scb, ecb)
}
