import { URLS, EVENTS, SOCIAL_PROVIDERS } from './../constants'

export function uploadFile (object, fileAction, filename, filedata, scb, ecb) {
  return this.http({
    url: `${URLS.objectsAction}/${object}?name=${fileAction}`,
    method: 'POST',
    data: {
        filename,
        filedata: filedata.substr(filedata.indexOf(',') + 1, filedata.length)
      }
  }, scb, ecb)
}
export function deleteFile (object, fileAction, filename, scb, ecb) {
  return this.http({
    url: `${URLS.objectsAction}/${object}?name=${fileAction}`,
    method: 'DELETE',
    data: {
        filename,
      }
  }, scb, ecb)
}
