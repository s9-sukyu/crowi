module.exports = function(crowi) {
  var debug = require('debug')('crowi:models:user')
  var mongoose = require('mongoose')
  var mongoosePaginate = require('mongoose-paginate')
  var crypto = require('crypto')
  var async = require('async')
  var STATUS_REGISTERED = 1
  var STATUS_ACTIVE = 2
  var STATUS_SUSPENDED = 3
  var STATUS_DELETED = 4
  var STATUS_INVITED = 5
  var LANG_EN = 'en'
  var LANG_EN_US = 'en-US'
  var LANG_EN_GB = 'en-GB'
  var LANG_JA = 'ja'
  var PAGE_ITEMS = 50
  var userEvent = crowi.event('user')
  var userSchema

  userSchema = new mongoose.Schema({
    userId: String,
    image: String,
    googleId: String,
    githubId: String,
    name: { type: String, index: true },
    username: { type: String, index: true },
    email: { type: String, required: true, index: true, select: false },
    introduction: { type: String },
    password: { type: String, select: false },
    apiToken: { type: String, select: false },
    lang: {
      type: String,
      enum: Object.values(getLanguageLabels()),
      default: LANG_EN_US,
    },
    status: { type: Number, required: true, default: STATUS_ACTIVE, index: true },
    createdAt: { type: Date, default: Date.now },
    admin: { type: Boolean, default: 0, index: true },
  })
  userSchema.plugin(mongoosePaginate)

  userEvent.on('activated', userEvent.onActivated)

  function decideUserStatusOnRegistration() {
    var Config = crowi.model('Config')
    var config = crowi.getConfig()

    if (!config.crowi) {
      return STATUS_ACTIVE // is this ok?
    }

    // status decided depends on registrationMode
    switch (config.crowi['security:registrationMode']) {
      case Config.SECURITY_REGISTRATION_MODE_OPEN:
        return STATUS_ACTIVE
      case Config.SECURITY_REGISTRATION_MODE_RESTRICTED:
      case Config.SECURITY_REGISTRATION_MODE_CLOSED: // 一応
        return STATUS_REGISTERED
      default:
        return STATUS_ACTIVE // どっちにすんのがいいんだろうな
    }
  }

  function generateRandomTempPassword() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!=-_'
    var password = ''
    var len = 12

    for (var i = 0; i < len; i++) {
      var randomPoz = Math.floor(Math.random() * chars.length)
      password += chars.substring(randomPoz, randomPoz + 1)
    }

    return password
  }

  function generatePassword(password) {
    var hasher = crypto.createHash('sha256')
    hasher.update(crowi.env.PASSWORD_SEED + password)

    return hasher.digest('hex')
  }

  function generateApiToken(user) {
    var hasher = crypto.createHash('sha256')
    hasher.update(new Date().getTime() + user._id)

    return hasher.digest('base64')
  }

  function getLanguageLabels() {
    var lang = {}
    lang.LANG_EN = LANG_EN
    lang.LANG_EN_US = LANG_EN_US
    lang.LANG_EN_GB = LANG_EN_GB
    lang.LANG_JA = LANG_JA

    return lang
  }

  userSchema.methods.isPasswordSet = function() {
    if (this.password) {
      return true
    }
    return false
  }

  userSchema.methods.isPasswordValid = function(password) {
    return this.password == generatePassword(password)
  }

  userSchema.methods.setPassword = function(password) {
    this.password = generatePassword(password)
    return this
  }

  userSchema.methods.isEmailSet = function() {
    if (this.email) {
      return true
    }
    return false
  }

  userSchema.methods.update = function(name, email, lang, callback) {
    this.name = name
    this.email = email
    this.lang = lang

    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.updatePassword = function(password, callback) {
    this.setPassword(password)
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.updateApiToken = function(callback) {
    var self = this

    self.apiToken = generateApiToken(this)
    return new Promise(function(resolve, reject) {
      self.save(function(err, userData) {
        if (err) {
          return reject(err)
        } else {
          return resolve(userData)
        }
      })
    })
  }

  userSchema.methods.updateImage = function(image, callback) {
    this.image = image
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.updateEmail = function(email) {
    this.email = email
    return this.save()
  }

  userSchema.methods.deleteImage = function(callback) {
    return this.updateImage(null, callback)
  }

  userSchema.methods.updateGoogleId = function(googleId) {
    this.googleId = googleId
    return this.save()
  }

  userSchema.methods.deleteGoogleId = function() {
    return this.updateGoogleId(null)
  }

  userSchema.methods.updateGitHubId = function(githubId) {
    this.githubId = githubId
    return this.save()
  }

  userSchema.methods.deleteGitHubId = function() {
    return this.updateGitHubId(null)
  }

  userSchema.methods.countValidThirdPartyIds = function() {
    const Config = crowi.model('Config')
    const config = crowi.getConfig()
    const googleId = Config.googleLoginEnabled(config) && this.googleId
    const githubId = Config.githubLoginEnabled(config) && this.githubId
    const validIds = [googleId, githubId].filter(Boolean)
    return validIds.length
  }

  userSchema.methods.hasValidThirdPartyId = function() {
    return this.countValidThirdPartyIds() > 0
  }

  userSchema.methods.canDisconnectThirdPartyId = function() {
    const Config = crowi.model('Config')
    const config = crowi.getConfig()
    return !Config.isDisabledPasswordAuth(config) || this.countValidThirdPartyIds() > 1
  }

  userSchema.methods.activateInvitedUser = function(username, name, password, callback) {
    this.setPassword(password)
    this.name = name
    this.username = username
    this.status = STATUS_ACTIVE
    this.save(function(err, userData) {
      userEvent.emit('activated', userData)
      return callback(err, userData)
    })
  }

  userSchema.methods.removeFromAdmin = function(callback) {
    debug('Remove from admin', this)
    this.admin = 0
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.makeAdmin = function(callback) {
    debug('Admin', this)
    this.admin = 1
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.statusActivate = function(callback) {
    debug('Activate User', this)
    this.status = STATUS_ACTIVE
    this.save(function(err, userData) {
      userEvent.emit('activated', userData)
      return callback(err, userData)
    })
  }

  userSchema.methods.statusSuspend = function(callback) {
    debug('Suspend User', this)
    this.status = STATUS_SUSPENDED
    if (this.email === undefined || this.email === null) {
      // migrate old data
      this.email = '-'
    }
    if (this.name === undefined || this.name === null) {
      // migrate old data
      this.name = '-' + Date.now()
    }
    if (this.username === undefined || this.usename === null) {
      // migrate old data
      this.username = '-'
    }
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.statusDelete = function(callback) {
    debug('Delete User', this)
    this.status = STATUS_DELETED
    this.password = ''
    this.email = 'deleted@deleted'
    this.googleId = null
    this.image = null
    this.save(function(err, userData) {
      return callback(err, userData)
    })
  }

  userSchema.methods.populateSecrets = async function() {
    const User = crowi.model('User')
    return User.findById(this._id, '+password +apiToken').exec()
  }

  userSchema.statics.getLanguageLabels = getLanguageLabels
  userSchema.statics.getUserStatusLabels = function() {
    var userStatus = {}
    userStatus[STATUS_REGISTERED] = '承認待ち'
    userStatus[STATUS_ACTIVE] = 'Active'
    userStatus[STATUS_SUSPENDED] = 'Suspended'
    userStatus[STATUS_DELETED] = 'Deleted'
    userStatus[STATUS_INVITED] = '招待済み'

    return userStatus
  }

  userSchema.statics.isEmailValid = function(email, callback) {
    var config = crowi.getConfig()
    var whitelist = config.crowi['security:registrationWhiteList']

    if (Array.isArray(whitelist) && whitelist.length > 0) {
      return config.crowi['security:registrationWhiteList'].some(function(allowedEmail) {
        var re = new RegExp(allowedEmail + '$')
        return re.test(email)
      })
    }

    return true
  }

  userSchema.statics.isGitHubAccountValid = function(organizations) {
    var config = crowi.getConfig()
    var org = config.crowi['github:organization']

    var orgs = organizations || []

    return !org || orgs.includes(org)
  }

  userSchema.statics.findUsers = function(options, callback) {
    var sort = options.sort || { status: 1, createdAt: 1 }

    this.find()
      .sort(sort)
      .skip(options.skip || 0)
      .limit(options.limit || 21)
      .exec(function(err, userData) {
        callback(err, userData)
      })
  }

  userSchema.statics.findAllUsers = function(option) {
    var User = this
    var option = option || {}
    var sort = option.sort || { createdAt: -1 }
    var status = option.status || [STATUS_ACTIVE, STATUS_SUSPENDED]
    var fields = option.fields

    if (!Array.isArray(status)) {
      status = [status]
    }

    return new Promise(function(resolve, reject) {
      User.find()
        .or(
          status.map(s => {
            return { status: s }
          }),
        )
        .select(fields)
        .sort(sort)
        .exec(function(err, userData) {
          if (err) {
            return reject(err)
          }

          return resolve(userData)
        })
    })
  }

  userSchema.statics.findUsersByIds = function(ids, option) {
    var User = this
    var option = option || {}
    var sort = option.sort || { createdAt: -1 }
    var status = option.status || STATUS_ACTIVE
    var fields = option.fields

    return new Promise(function(resolve, reject) {
      User.find({ _id: { $in: ids }, status: status })
        .select(fields)
        .sort(sort)
        .exec(function(err, userData) {
          if (err) {
            return reject(err)
          }

          return resolve(userData)
        })
    })
  }

  userSchema.statics.findAdmins = function(callback) {
    this.find({ admin: true }).exec(function(err, admins) {
      debug('Admins: ', admins)
      callback(err, admins)
    })
  }

  userSchema.statics.findUsersWithPagination = function(options, query, callback) {
    var sort = options.sort || { status: 1, username: 1, createdAt: 1 }

    this.paginate(
      query,
      { page: options.page || 1, limit: options.limit || PAGE_ITEMS },
      function(err, result) {
        if (err) {
          debug('Error on pagination:', err)
          return callback(err, null)
        }

        return callback(err, result)
      },
      { sortBy: sort },
    )
  }

  userSchema.statics.findUsersByPartOfEmail = function(emailPart, options) {
    const status = options.status || null
    const emailPartRegExp = new RegExp(emailPart.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
    const User = this

    return new Promise((resolve, reject) => {
      const query = User.find({ email: emailPartRegExp })

      if (status) {
        query.and({ status })
      }

      query.limit(PAGE_ITEMS + 1).exec((err, userData) => {
        if (err) {
          return reject(err)
        }

        return resolve(userData)
      })
    })
  }

  userSchema.statics.findUserByUsername = function(username) {
    var User = this
    return new Promise(function(resolve, reject) {
      User.findOne({ username: username }, function(err, userData) {
        if (err) {
          return reject(err)
        }

        return resolve(userData)
      })
    })
  }

  userSchema.statics.findUserByApiToken = function(apiToken) {
    var self = this

    return new Promise(function(resolve, reject) {
      self.findOne({ apiToken: apiToken }, function(err, userData) {
        if (err) {
          return reject(err)
        } else {
          return resolve(userData)
        }
      })
    })
  }

  userSchema.statics.findUserByGoogleId = function(googleId) {
    return this.findOne({ googleId })
  }

  userSchema.statics.findUserByGitHubId = function(githubId) {
    return this.findOne({ githubId })
  }

  userSchema.statics.findUserByEmail = function(email) {
    return this.findOne({ email })
  }

  userSchema.statics.findUserByEmailAndPassword = function(email, password) {
    const hashedPassword = generatePassword(password)
    return this.findOne({ email, password: hashedPassword })
  }

  userSchema.statics.isRegisterableUsername = function(username, callback) {
    var usernameUsable = true

    this.findOne({ username: username }, function(err, userData) {
      if (userData) {
        usernameUsable = false
      }
      return callback(usernameUsable)
    })
  }

  userSchema.statics.isRegisterable = function(email, username, callback) {
    var User = this
    var emailUsable = true
    var usernameUsable = true

    // username check
    this.findOne({ username: username }, function(err, userData) {
      if (userData) {
        usernameUsable = false
      }

      // email check
      User.findOne({ email: email }, function(err, userData) {
        if (userData) {
          emailUsable = false
        }

        if (!emailUsable || !usernameUsable) {
          return callback(false, { email: emailUsable, username: usernameUsable })
        }

        return callback(true, {})
      })
    })
  }

  userSchema.statics.removeCompletelyById = function(id, callback) {
    var User = this
    User.findById(id, function(err, userData) {
      if (!userData) {
        return callback(err, null)
      }

      debug('Removing user:', userData)
      // 物理削除可能なのは、招待中ユーザーのみ
      // 利用を一度開始したユーザーは論理削除のみ可能
      if (userData.status !== STATUS_INVITED) {
        return callback(new Error('Cannot remove completely the user whoes status is not INVITED'), null)
      }

      userData.remove(function(err) {
        if (err) {
          return callback(err, null)
        }

        return callback(null, 1)
      })
    })
  }

  userSchema.statics.resetPasswordByRandomString = function(id) {
    var User = this

    return new Promise(function(resolve, reject) {
      User.findById(id, function(err, userData) {
        if (!userData) {
          return reject(new Error('User not found'))
        }

        // is updatable check
        // if (userData.isUp
        var newPassword = generateRandomTempPassword()
        userData.setPassword(newPassword)
        userData.save(function(err, userData) {
          if (err) {
            return reject(err)
          }

          resolve({ user: userData, newPassword: newPassword })
        })
      })
    })
  }

  userSchema.statics.createUsersByInvitation = function(emailList, toSendEmail, callback) {
    var User = this
    var createdUserList = []
    var config = crowi.getConfig()
    var mailer = crowi.getMailer()

    if (!Array.isArray(emailList)) {
      debug('emailList is not array')
    }

    async.each(
      emailList,
      function(email, next) {
        var newUser = new User()
        var password

        email = email.trim()

        // email check
        // TODO: 削除済みはチェック対象から外そう〜
        User.findOne({ email: email }, function(err, userData) {
          // The user is exists
          if (userData) {
            createdUserList.push({
              email: email,
              password: null,
              user: null,
            })

            return next()
          }

          password = Math.random()
            .toString(36)
            .slice(-16)

          newUser.email = email
          newUser.setPassword(password)
          newUser.createdAt = Date.now()
          newUser.status = STATUS_INVITED

          newUser.save(function(err, userData) {
            if (err) {
              createdUserList.push({
                email: email,
                password: null,
                user: null,
              })
              debug('save failed!! ', email)
            } else {
              createdUserList.push({
                email: email,
                password: password,
                user: userData,
              })
              debug('saved!', email)
            }

            next()
          })
        })
      },
      function(err) {
        if (err) {
          debug('error occured while iterate email list')
        }

        if (toSendEmail) {
          // TODO: メール送信部分のロジックをサービス化する
          async.each(
            createdUserList,
            function(user, next) {
              if (user.password === null) {
                return next()
              }

              mailer.send(
                {
                  to: user.email,
                  subject: 'Invitation to ' + config.crowi['app:title'],
                  template: 'admin/userInvitation.txt',
                  vars: {
                    email: user.email,
                    password: user.password,
                    url: config.crowi['app:url'],
                    appTitle: config.crowi['app:title'],
                  },
                },
                function(err, s) {
                  debug('completed to send email: ', err, s)
                  next()
                },
              )
            },
            function(err) {
              debug('Sending invitation email completed.', err)
            },
          )
        }

        debug('createdUserList!!! ', createdUserList)
        return callback(null, createdUserList)
      },
    )
  }

  userSchema.statics.createUserByEmailAndPassword = function(name, username, email, password, lang, callback) {
    var User = this
    var newUser = new User()

    newUser.name = name
    newUser.username = username
    newUser.email = email
    newUser.setPassword(password)
    newUser.lang = lang
    newUser.createdAt = Date.now()
    newUser.status = decideUserStatusOnRegistration()

    newUser.save(function(err, userData) {
      if (userData.status == STATUS_ACTIVE) {
        userEvent.emit('activated', userData)
      }
      return callback(err, userData)
    })
  }

  userSchema.statics.createUserPictureFilePath = function(user, ext) {
    var ext = '.' + ext

    return 'user/' + user._id + ext
  }

  userSchema.statics.getUsernameByPath = function(path) {
    var username = null
    let m
    if ((m = path.match(/^\/user\/([^/]+)\/?/))) {
      username = m[1]
    }

    return username
  }

  userSchema.statics.STATUS_REGISTERED = STATUS_REGISTERED
  userSchema.statics.STATUS_ACTIVE = STATUS_ACTIVE
  userSchema.statics.STATUS_SUSPENDED = STATUS_SUSPENDED
  userSchema.statics.STATUS_DELETED = STATUS_DELETED
  userSchema.statics.STATUS_INVITED = STATUS_INVITED
  userSchema.statics.PAGE_ITEMS = PAGE_ITEMS

  userSchema.statics.LANG_EN = LANG_EN
  userSchema.statics.LANG_EN_US = LANG_EN_US
  userSchema.statics.LANG_EN_GB = LANG_EN_US
  userSchema.statics.LANG_JA = LANG_JA

  return mongoose.model('User', userSchema)
}
