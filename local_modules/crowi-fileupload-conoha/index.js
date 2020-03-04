'use strict'

const fs = require('fs')
const pkgcloud = require('pkgcloud')
const stream = require('stream')
const { promisify } = require('util')
const awsUploader = require('../crowi-fileupload-aws')

const pipeline = promisify(stream.pipeline)

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
    uploadFile: async (remote, contentType, fileStream, options) => {
      const uploadStream = swift.upload({ container: config.container, contentType, remote })

      return pipeline(fileStream, uploadStream)
    },
    findDeliveryFile: async (fileId, remote) => {
      const local = lib.createCacheFileName(fileId)
      if (!lib.shouldUpdateCacheFile(local)) {
        return local
      }

      const downloadStream = swift.download({ container: config.container, remote })
      await pipeline(downloadStream, fs.createWriteStream(local))
      return local
    },
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
