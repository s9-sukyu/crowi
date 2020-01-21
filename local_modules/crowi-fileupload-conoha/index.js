'use strict'

const fs = require('fs')
const pkgcloud = require('pkgcloud')
const awsUploader = require('../crowi-fileupload-aws')

module.exports = crowi => {
  const config = {
    provider: 'openstack',
    username: crowi.env.CONOHA_USER,
    password: crowi.env.CONOHA_PASS,
    authUrl: crowi.env.CONOHA_AUTH_URL,
    region: crowi.env.CONOHA_REGION,
    tenantId: crowi.env.CONOHA_TENANT_ID,
    container: crowi.env.CONOHA_CONTAINER,
  }

  const lib = awsUploader(crowi)
  const swift = pkgcloud.storage.createClient(config)

  return {
    uploadFile: (remote, contentType, fileStream, options) =>
      new Promise((resolve, reject) => {
        const uploadStream = swift.upload({ container: config.container, contentType, remote })
        uploadStream.on('error', reject)
        uploadStream.on('success', resolve)
        fileStream.pipe(uploadStream)
        fileStream.on('error', err => {
          uploadStream.destroy(err)
        })
      }),
    findDeliveryFile: (fileId, remote) =>
      new Promise((resolve, reject) => {
        const local = lib.createCacheFileName(fileId)
        if (!lib.shouldUpdateCacheFile(local)) {
          return resolve(local)
        }

        const downloadStream = swift.download({ container: config.container, remote })
        downloadStream.on('error', reject)
        downloadStream.on('end', _ => resolve(local))
        downloadStream.pipe(fs.createWriteStream(local))
      }),
    deleteFile: (fileId, remote) =>
      new Promise((resolve, reject) => {
        swift.removeFile(config.container, remote, (err, result) => {
          if (err) {
            return reject(err)
          }
          resolve(result)
          lib.clearCache(fileId)
        })
      }),
    generateUrl: remote => `https://object-storage.${config.region}.conoha.io/v1/nc_${config.tenantId}/${config.container}/${remote}`,
  }
}
