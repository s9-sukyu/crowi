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
      console.warn('File Upload:Start Make Stream')
      const uploadStream = swift.upload({ container: config.container, contentType, remote })
      console.warn(`File Upload:End Make Stream`)

      return pipeline(fileStream, uploadStream)
    },
    findDeliveryFile: async (fileId, remote) => {
      console.warn('File Find:Start Make File Name')
      const local = lib.createCacheFileName(fileId)
      if (!lib.shouldUpdateCacheFile(local)) {
        return local
      }
      console.warn('File Find:End Make File Name')

      console.warn('File Find:Start Make Stream')
      const downloadStream = swift.download({ container: config.container, remote })
      console.warn('File Find:End Make Stream')
      await pipeline(downloadStream, fs.createWriteStream(local))
      return local
    },
    deleteFile: (fileId, remote) =>
      new Promise((resolve, reject) => {
        console.warn('File Remove:Start')
        swift.removeFile(config.container, remote, (err, result) => {
          if (err) {
            return reject(err)
          }
          console.warn('File Remove:Start Resolve')
          resolve(result)
          console.warn('File Remove:End Resolve')
          console.warn('File Remove:Start Clear Cache')
          lib.clearCache(fileId)
          console.warn('File Remove:End Clear Cache')
        })
        console.warn('File Remove:End')
      }),
    generateUrl: remote => `https://object-storage.${config.region}.conoha.io/v1/nc_${config.tenantId}/${config.container}/${remote}`,
  }
}
