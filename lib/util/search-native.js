'use strict'

const mongoose = require('mongoose')

const typeFilters = {
  portal: new RegExp('/$'),
  public: new RegExp('[^/]$'),
  user: new RegExp('^/user/'),
}

module.exports = class {
  constructor() {
    this.host = ''
    this.indexNames = {
      base: '',
      current: '',
    }
    this.esVersion = ''
  }

  searchKeyword(keyword, option) {
    return this.searchKeywordUnderPath(keyword, '/', option)
  }
  searchKeywordUnderPath(keyword, path, option) {
    // const from = option.offset || null
    // const size = option.limit || null
    const type = option.type || null

    const date = new Date()
    const kwPattern = new RegExp(keyword)
    const pathPattern = new RegExp(`^${path}`)

    const filters = [{ grant: 1 }, { status: 'published' }, { path: pathPattern }]

    if (type !== null) {
      filters.push({ path: typeFilters[type] })
    }

    const pipeline = [
      {
        $match: {
          $and: filters,
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
