const debug = require('debug')('crowi:lib:middlewares')
const { parseAccessToken } = require('./accessTokenParser')

exports.loginChecker = function(crowi, app) {
  return function(req, res, next) {
    var User = crowi.model('User')
    var csrfKey = (req.session && req.session.id) || 'anon'

    if (req.csrfToken === null) {
      req.csrfToken = crowi.getTokens().create(csrfKey)
    }

    // session に user object が入ってる
    if (req.session.user && '_id' in req.session.user) {
      User.findById(req.session.user._id, '+password +apiToken', function(err, userData) {
        if (err) {
          next()
        } else {
          req.user = req.session.user = userData
          res.locals.user = req.user
          next()
        }
      })
    } else {
      req.user = req.session.user = false
      res.locals.user = req.user
      next()
    }
  }
}

exports.csrfVerify = function(crowi, app) {
  return function(req, res, next) {
    var token = req.body._csrf || req.query._csrf || null
    var csrfKey = (req.session && req.session.id) || 'anon'

    debug('req.skipCsrfVerify', req.skipCsrfVerify)
    if (req.skipCsrfVerify) {
      debug('csrf verify skipped')
      return next()
    }

    if (crowi.getTokens().verify(csrfKey, token)) {
      return next()
    }

    debug('csrf verification failed. return 403', csrfKey, token)
    return res.sendStatus(403)
  }
}

exports.swigFunctions = function(crowi, app) {
  return function(req, res, next) {
    require('../util/swigFunctions')(crowi, app, req, res.locals)
    next()
  }
}

exports.swigFilters = function(app, swig) {
  return function(req, res, next) {
    swig.setFilter('path2name', function(string) {
      const name = string

      // /.../YYYY/MM/DD 形式のページ
      if (name.match(/^.*?([^/]+\/\d{4}\/\d{2}\/\d{2})\/?$/)) {
        return name.replace(/^.*?([^/]+\/\d{4}\/\d{2}\/\d{2})\/?$/, '$1')
      }

      // /.../YYYY/MM 形式のページ
      if (name.match(/^.*?([^/]+\/\d{4}\/\d{2})\/?$/)) {
        return name.replace(/^.*?([^/]+\/\d{4}\/\d{2})\/?$/, '$1')
      }

      // /.../YYYY 形式のページ
      if (name.match(/^.*?([^/]+\/\d{4})\/?$/)) {
        return name.replace(/^.*?([^/]+\/\d{4})\/?$/, '$1')
      }

      // ページの末尾を拾う
      const suffix = name.replace(/.+\/(.+)?$/, '$1')
      return suffix || name
    })

    swig.setFilter('normalizeDateInPath', function(path) {
      var patterns = [
        [/20(\d{2})(\d{2})(\d{2})(.+)/g, '20$1/$2/$3/$4'],
        [/20(\d{2})(\d{2})(\d{2})/g, '20$1/$2/$3'],
        [/20(\d{2})(\d{2})(.+)/g, '20$1/$2/$3'],
        [/20(\d{2})(\d{2})/g, '20$1/$2'],
        [/20(\d{2})_(\d{1,2})_(\d{1,2})_?(.+)/g, '20$1/$2/$3/$4'],
        [/20(\d{2})_(\d{1,2})_(\d{1,2})/g, '20$1/$2/$3'],
        [/20(\d{2})_(\d{1,2})_?(.+)/g, '20$1/$2/$3'],
        [/20(\d{2})_(\d{1,2})/g, '20$1/$2'],
      ]

      for (var i = 0; i < patterns.length; i++) {
        var mat = patterns[i][0]
        var rep = patterns[i][1]
        if (path.match(mat)) {
          return path.replace(mat, rep)
        }
      }

      return path
    })

    swig.setFilter('datetz', function(input, format) {
      // timezone
      var swigFilters = require('swig/lib/filters')
      return swigFilters.date(input, format, app.get('tzoffset'))
    })

    swig.setFilter('nl2br', function(string) {
      return string.replace(/\n/g, '<br>')
    })

    swig.setFilter('insertSpaceToEachSlashes', function(string) {
      if (string == '/') {
        return string
      }

      return string.replace(/\//g, ' / ')
    })

    swig.setFilter('removeLastSlash', function(string) {
      if (string == '/') {
        return string
      }

      return string.substr(0, string.length - 1)
    })

    swig.setFilter('presentation', function(string) {
      // 手抜き
      return string.replace(/[\n]+#/g, '\n\n\n#').replace(/\s(https?.+(jpe?g|png|gif))\s/, '\n\n\n![]($1)\n\n\n')
    })

    swig.setFilter('picture', function(user) {
      if (!user) {
        return ''
      }

      return `//q.trap.jp/api/1.0/public/icon/${user.username}`
    })

    next()
  }
}

exports.adminRequired = function() {
  return function(req, res, next) {
    if (req.user && '_id' in req.user) {
      if (req.user.admin) {
        next()
        return
      }
      return res.redirect('/')
    }
    return res.redirect('/login')
  }
}

exports.loginRequired = function(crowi, app) {
  return async function(req, res, next) {
    const User = crowi.model('User')
    const config = crowi.getConfig()
    const { path = '', originalUrl } = req
    const auth = require('./auth')
    const query = originalUrl === '/' ? '' : `?continue=${originalUrl}`
    const isAuthPage = path.startsWith('/me/auth/')
    const isAPI = path.startsWith('/_api/')

    if (!isAuthPage && auth.isAccessTokenExpired(req)) {
      const success = await auth.reauth(req, config)
      if (!success) {
        res.redirect('/logout')
      }
    }

    if (req.user && '_id' in req.user) {
      const { 'auth:requireThirdPartyAuth': requireThirdPartyAuth = '' } = config.crowi
      const hasValidThirdPartyId = req.user.hasValidThirdPartyId()
      if (!isAuthPage && !isAPI && requireThirdPartyAuth && !hasValidThirdPartyId) {
        return res.redirect(`/me/auth/third-party${query}`)
      }

      if (req.user.status === User.STATUS_ACTIVE) {
        // Active の人だけ先に進める
        return next()
      } else if (req.user.status === User.STATUS_REGISTERED) {
        return res.redirect('/login/error/registered')
      } else if (req.user.status === User.STATUS_SUSPENDED) {
        return res.redirect('/login/error/suspended')
      } else if (req.user.status === User.STATUS_INVITED) {
        return res.redirect('/login/invited')
      }
    }

    if (isAPI) {
      return res.sendStatus(403)
    }

    return res.redirect(`/login${query}`)
  }
}

exports.fileAccessRightOrLoginRequired = function(crowi, app) {
  return async function(req, res, next) {
    try {
      const Attachment = crowi.model('Attachment')
      const Share = crowi.model('Share')
      const attachment = await Attachment.findById(req.params.id)
      const { uuid, secretKeyword } = await Share.findShareByPageId(attachment.page, { status: Share.STATUS_ACTIVE })
      const { shareIds = [], secretKeywords = {} } = req.session
      const isNoExistKeyword = !secretKeyword
      const hasCorrectKeyword = secretKeywords[uuid] === secretKeyword
      const isAccessedSharedPage = shareIds.includes(uuid)
      const hasAccessRight = (isNoExistKeyword || hasCorrectKeyword) && isAccessedSharedPage
      if (hasAccessRight) {
        return next()
      }
    } catch (err) {
      // share url not found, but its okay
      // debug(err)
    }
    return exports.loginRequired(crowi, app)(req, res, next)
  }
}

exports.accessTokenParser = function(crowi, app) {
  return function(req, res, next) {
    var accessToken = parseAccessToken(req)
    if (!accessToken) {
      return next()
    }

    var User = crowi.model('User')

    debug('accessToken is', accessToken)
    User.findUserByApiToken(accessToken)
      .then(function(userData) {
        req.user = userData
        req.skipCsrfVerify = true
        debug('Access token parsed: skipCsrfVerify')

        next()
      })
      .catch(function(err) {
        next()
      })
  }
}

// this is for Installer
exports.applicationNotInstalled = function() {
  return function(req, res, next) {
    var config = req.config

    if (Object.keys(config.crowi).length !== 1) {
      req.flash('errorMessage', 'Application already installed.')
      return res.redirect('admin') // admin以外はadminRequiredで'/'にリダイレクトされる
    }

    return next()
  }
}

exports.applicationInstalled = function() {
  return function(req, res, next) {
    var config = req.config

    if (Object.keys(config.crowi).length === 1) {
      // app:url is set by process
      return res.redirect('/installer')
    }

    return next()
  }
}

exports.awsEnabled = function() {
  return function(req, res, next) {
    var config = req.config
    if (
      config.crowi['aws:region'] !== '' &&
      config.crowi['aws:bucket'] !== '' &&
      config.crowi['aws:accessKeyId'] !== '' &&
      config.crowi['aws:secretAccessKey'] !== ''
    ) {
      req.flash('globalError', 'AWS settings required to use this function. Please ask the administrator.')
      return res.redirect('/')
    }

    return next()
  }
}
