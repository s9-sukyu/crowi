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
    const pathPattern = new RegExp(`^${path}`)

    const filters = [{ 'page.0.grant': 1 }, { 'page.0.status': 'published' }, { path: pathPattern }]

    if (type !== null) {
      filters.push({ path: typeFilters[type] })
    }

    const pipeline = [
      {
        $match: {
          $text: {
            $search: keyword,
            $language: 'none',
          },
        },
      },
      {
        $lookup: {
          from: 'pages',
          localField: '_id',
          foreignField: 'revision',
          as: 'page',
        },
      },
      {
        $match: {
          $and: filters,
        },
      },
    ]
    return mongoose.connection.db
      .command({
        aggregate: 'revisions',
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
        data: docs.map(item => {
          const page = item.page[0]
          delete item.page
          return {
            ...page,
            revision: item,
          }
        }),
      }))
  }
}
