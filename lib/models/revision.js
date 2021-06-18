module.exports = function(crowi) {
  // var debug = require('debug')('crowi:models:revision')
  var mongoose = require('mongoose')
  var ObjectId = mongoose.Schema.Types.ObjectId
  var revisionSchema

  revisionSchema = new mongoose.Schema({
    path: { type: String, required: true, index: true },
    body: { type: String, required: true },
    format: { type: String, default: 'markdown' },
    author: { type: ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  })

  revisionSchema.statics.findLatestRevision = function(path, cb) {
    this.find({ path: path })
      .sort({ createdAt: -1 })
      .limit(1)
      .exec(function(err, data) {
        cb(err, data.shift())
      })
  }

  revisionSchema.statics.findRevision = function(id) {
    var Revision = this

    return new Promise(function(resolve, reject) {
      Revision.findById(id)
        .populate('author')
        .exec(function(err, data) {
          if (err) {
            return reject(err)
          }

          return resolve(data)
        })
    })
  }

  revisionSchema.statics.findRevisions = function(ids) {
    var Revision = this

    if (!Array.isArray(ids)) {
      return Promise.reject(new Error('The argument was not Array.'))
    }

    return new Promise(function(resolve, reject) {
      Revision.find({ _id: { $in: ids } })
        .sort({ createdAt: -1 })
        .populate('author')
        .exec(function(err, revisions) {
          if (err) {
            return reject(err)
          }

          return resolve(revisions)
        })
    })
  }

  revisionSchema.statics.findRevisionIdList = function(path) {
    return this.find({ path: path })
      .select('_id author createdAt')
      .sort({ createdAt: -1 })
      .exec()
  }

  revisionSchema.statics.findRevisionList = function(path, options) {
    var Revision = this

    return new Promise(function(resolve, reject) {
      Revision.find({ path: path })
        .sort({ createdAt: -1 })
        .populate('author')
        .exec(function(err, data) {
          if (err) {
            return reject(err)
          }

          return resolve(data)
        })
    })
  }

  revisionSchema.statics.updateRevisionListByPath = function(path, updateData, options) {
    var Revision = this

    return new Promise(function(resolve, reject) {
      Revision.update({ path: path }, { $set: updateData }, { multi: true }, function(err, data) {
        if (err) {
          return reject(err)
        }

        return resolve(data)
      })
    })
  }

  revisionSchema.statics.prepareRevision = function(pageData, body, user, options) {
    var Revision = this

    if (!options) {
      options = {}
    }
    var format = options.format || 'markdown'

    if (!user._id) {
      throw new Error('Error: user should have _id')
    }

    var newRevision = new Revision()
    newRevision.path = pageData.path
    newRevision.body = body
    newRevision.format = format
    newRevision.author = user._id
    newRevision.createdAt = Date.now()

    return newRevision
  }

  revisionSchema.statics.removeRevisionsByPath = function(path) {
    const Revision = this
    return Revision.remove({ path })
  }

  revisionSchema.statics.updatePath = function(pathName) {}

  return mongoose.model('Revision', revisionSchema)
}
