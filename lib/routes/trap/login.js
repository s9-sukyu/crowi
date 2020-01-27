'use strict'

const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const ADMINS = ['to-hutohu', 'takashi_trap', 'temma', 'sappi_red']

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

const genLoginHandler = User => async (req, res) => {
  if (req.user) {
    return res.redirect('/')
  }

  try {
    const rawToken = req.cookies.traP_token
    if (!rawToken) {
      throw new Error('No token')
    }

    // throws Error
    const userData = jwt.verify(rawToken, JWT_PUBLIC_KEY, { algorithms: 'RS256' })
    let user = await User.findUserByUsername(userData.id)

    const realName = userData.firstName + ' ' + userData.lastName

    if (user && (realName !== user.name || userData.email !== user.email)) {
      user = await promisify(callback => user.update(realName, userData.email, user.lang, callback))
    } else {
      user = await promisify(callback =>
        User.createUserByEmailAndPassword(realName, userData.id, userData.email, randomPassword(), User.getLanguageLabels().LANG_JA, callback),
      )
    }

    const shouldBeAdmin = ADMINS.includes(userData.id)
    const isAdmin = user.admin
    if (shouldBeAdmin !== isAdmin) {
      if (shouldBeAdmin) {
        user = await promisify(callback => user.makeAdmin(callback))
      } else {
        user = await promisify(callback => user.removeFromAdmin(callback))
      }
    }

    req.user = req.session.user = user

    const jumpTo = req.session.jumpTo
    if (jumpTo) {
      req.session.jumpTo = null
      return res.redirect(jumpTo)
    } else {
      return res.redirect('/')
    }
  } catch (err) {
    if (err.message !== 'No token') {
      console.error('[traP] Login attempt was rejected:', err)
    } else {
      console.error('[traP] Login attempt was rejected: No token')
    }
    res.redirect(`https://q.trap.jp/login?redirect=${currentUrlEncoded(req)}`)
  }
}

module.exports = (crowi, app) => {
  // override default login feature
  app.get('/login', genLoginHandler(crowi.model('User')))
}
