'use strict'

const mongoose = require('mongoose')

module.exports = class {
  constructor() {
    this.host = ''
    this.indexNames = {
      base: '',
      current: '',
    }
    this.esVersion = ''
  }

  searchKeyword(keyword) {
    return this.searchKeywordUnderPath(keyword, '/')
  }
  searchKeywordUnderPath(keyword, path) {
    const date = new Date()
    const kwPattern = new RegExp(keyword)
    const pathPattern = new RegExp(`^${path}`)
    const pipeline = [
      {
        $match: {
          $and: [{ grant: 1 }, { status: 'published' }, { path: pathPattern }],
        },
      },
      {
        $lookup: {
          from: 'revisions',
          localField: 'revision',
          foreignField: '_id',
          as: 'revision',
        },
      },
      {
        $match: {
          $or: [{ path: kwPattern }, { 'revision.0.body': kwPattern }],
        },
      },
      {
        $sort: {
          updatedAt: -1,
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ]
    return mongoose.connection.db
      .command({
        aggregate: 'pages',
        cursor: { batchSize: 1e9 },
        pipeline,
      })
      .then(result => result.cursor.firstBatch)
      .then(docs => ({
        meta: {
          took: new Date() - date,
          total: docs.length,
          results: docs.length,
        },
        data: docs.map(item => ({ _id: '' + item._id })),
      }))
  }
}
