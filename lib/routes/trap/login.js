'use strict'

const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const JWT_PUBLIC_KEY = `

-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAraewUw7V1hiuSgUvkly9
X+tcIh0e/KKqeFnAo8WR3ez2tA0fGwM+P8sYKHIDQFX7ER0c+ecTiKpo/Zt/a6AO
gB/zHb8L4TWMr2G4q79S1gNw465/SEaGKR8hRkdnxJ6LXdDEhgrH2ZwIPzE0EVO1
eFrDms1jS3/QEyZCJ72oYbAErI85qJDF/y/iRgl04XBK6GLIW11gpf8KRRAh4vuh
g5/YhsWUdcX+uDVthEEEGOikSacKZMFGZNi8X8YVnRyWLf24QTJnTHEv+0EStNrH
HnxCPX0m79p7tBfFC2ha2OYfOtA+94ZfpZXUi2r6gJZ+dq9FWYyA0DkiYPUq9QMb
OQIDAQAB
-----END PUBLIC KEY-----

`.trim()

const randomPassword = _ =>
  crypto
    .createHash('sha512')
    .update('' + Math.random())
    .digest('base64')
const currentUrlEncoded = req => encodeURIComponent(`${req.protocol}://${req.get('host')}${req.originalUrl}`)

const promisify = job =>
  new Promise((resolve, reject) =>
    job((err, data) => {
      if (err) {
        reject(err)
      }
      resolve(data)
    }),
  )

const genLoginHandler = User => (req, res) => {
  if (req.user) {
    return res.redirect('/')
  }

  new Promise(resolve => {
    const rawToken = req.cookies.traP_token
    if (!rawToken) {
      throw new Error('No token')
    }

    // throws Error
    const userData = jwt.verify(rawToken, JWT_PUBLIC_KEY, { algorithms: 'RS256' })
    resolve(Promise.all([userData, User.findUserByUsername(userData.id)]))
  })
    .then(([userData, user]) => {
      const realName = userData.firstName + ' ' + userData.lastName

      if (user) {
        return promisify(callback => user.update(realName, userData.email, user.lang, callback))
      } else {
        return promisify(callback =>
          User.createUserByEmailAndPassword(realName, userData.id, userData.email, randomPassword(), User.getLanguageLabels().LANG_JA, callback),
        )
      }
    })
    .then(user => {
      req.user = req.session.user = user

      const jumpTo = req.session.jumpTo
      if (jumpTo) {
        req.session.jumpTo = null
        return res.redirect(jumpTo)
      } else {
        return res.redirect('/')
      }
    })
    .catch(err => {
      console.error('[traP] Login attempt was rejected:', err)
      res.redirect(`https://q.trap.jp/login?redirect=${currentUrlEncoded(req)}`)
    })
}

module.exports = (crowi, app) => {
  // override default login feature
  app.get('/login', genLoginHandler(crowi.model('User')))
}
