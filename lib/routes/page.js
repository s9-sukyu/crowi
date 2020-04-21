module.exports = function(crowi, app) {
  'use strict'

  const debug = require('debug')('crowi:routes:page')
  const Page = crowi.model('Page')
  const User = crowi.model('User')
  const Bookmark = crowi.model('Bookmark')
  const ApiResponse = require('../util/apiResponse')
  const sprintf = require('sprintf')
  const actions = {}

  // register page events

  const pageEvent = crowi.event('page')
  pageEvent.on('update', function(page, user) {
    crowi.getIo().sockets.emit('page edited', { page, user })
  })

  function getPathFromRequest(req) {
    var path = '/' + (req.params[0] || '')
    return path.replace(/\.md$/, '')
  }

  // TODO: total とかでちゃんと計算する
  function generatePager(options) {
    var next = null
    var prev = null
    var offset = parseInt(options.offset, 10)
    var limit = parseInt(options.limit, 10)
    var length = options.length || 0

    if (offset > 0) {
      prev = offset - limit
      if (prev < 0) {
        prev = 0
      }
    }

    if (length < limit) {
      next = null
    } else {
      next = offset + limit
    }

    return {
      prev: prev,
      next: next,
      offset: offset,
    }
  }

  // routing
  actions.pageListShow = async function(req, res) {
    const limit = 15
    const offset = parseInt(req.query.offset) || 0
    const SEENER_THRESHOLD = 10
    let path = getPathFromRequest(req)
    path = path + (path == '/' ? '' : '/')

    debug('Page list show', path)

    const pagerOptions = {
      offset: offset,
      limit: limit,
    }
    const queryOptions = {
      offset: offset,
      limit: limit + 1,
    }

    try {
      const [portalPage, pageList] = await Promise.all([
        Page.hasPortalPage(path, req.user, req.query.revision),
        Page.findListByStartWith(path, req.user, queryOptions),
      ])

      if (pageList.length > limit) {
        pageList.pop()
      }

      if (portalPage) {
        crowi.lru.add(req.user._id.toString(), portalPage._id.toString())
      }

      pagerOptions.length = pageList.length
      res.render('page_list', {
        path,
        page: portalPage || null,
        pages: pageList,
        pager: generatePager(pagerOptions),
        viewConfig: {
          seener_threshold: SEENER_THRESHOLD,
        },
      })
    } catch (err) {
      debug('Error on rendering pageListShow', err)
    }
  }

  actions.deletedPageListShow = function(req, res) {
    var path = '/trash' + getPathFromRequest(req)
    var limit = 50
    var offset = parseInt(req.query.offset) || 0

    // index page
    var pagerOptions = {
      offset: offset,
      limit: limit,
    }
    var queryOptions = {
      offset: offset,
      limit: limit + 1,
      includeDeletedPage: true,
    }

    var renderVars = {
      page: null,
      path: path,
      pages: [],
    }

    Page.findListByStartWith(path, req.user, queryOptions)
      .then(function(pageList) {
        if (pageList.length > limit) {
          pageList.pop()
        }

        pagerOptions.length = pageList.length

        renderVars.pager = generatePager(pagerOptions)
        renderVars.pages = pageList
        res.render('page_list', renderVars)
      })
      .catch(function(err) {
        debug('Error on rendering deletedPageListShow', err)
      })
  }

  async function renderPage(pageData, req, res) {
    // create page
    if (!pageData) {
      return res.render('page', {
        author: {},
        page: false,
      })
    }

    crowi.lru.add(req.user._id.toString(), pageData._id.toString())

    if (pageData.redirectTo) {
      return res.redirect(encodeURI(pageData.redirectTo + '?redirectFrom=' + pageData.path))
    }

    const renderVars = {
      path: pageData.path,
      page: pageData,
      revision: pageData.revision || {},
      author: pageData.revision.author || false,
    }
    const defaultPageTeamplate = 'page'

    res.render(req.query.presentation ? 'page_presentation' : defaultPageTeamplate, renderVars)
  }

  actions.userPageShow = async function(req, res) {
    const username = req.params.username
    const path = `/user/${username}`
    res.locals.path = path
    debug('path', path)

    // check page existance
    let pageData
    try {
      pageData = await Page.findPage(path, req.user, req.query.revision)

      crowi.lru.add(req.user._id.toString(), pageData._id.toString())

      if (pageData.redirectTo) {
        return res.redirect(encodeURI(pageData.redirectTo + '?redirectFrom=' + pageData.path))
      }
    } catch (e) {
      // for B.C.: Old Crowi has no user page
      return renderPage(null, req, res) // show create
    }

    let pageUser = {}
    let bookmarkList = []
    let createdList = []
    try {
      // user いない場合
      pageUser = await User.findUserByUsername(username)
      ;[bookmarkList, createdList] = await Promise.all([
        Bookmark.findByUser(pageUser, { limit: 10, populatePage: true, requestUser: req.user }),
        Page.findListByCreator(pageUser, { limit: 10 }, req.user),
      ])
    } catch (e) {
      debug('Error while loading user page.', username)
    }

    return res.render('user_page', {
      username,
      bookmarkList,
      createdList,
      pageUser,
      path: pageData.path,
      page: pageData,
      revision: pageData.revision || {},
      author: pageData.revision.author || false,
    })
  }

  actions.pageShow = function(req, res) {
    var path = getPathFromRequest(req)

    // FIXME: せっかく getPathFromRequest になってるのにここが生 params[0] だとダサイ
    var isMarkdown = req.params[0].match(/.+\.md$/) || false

    res.locals.path = path
    Page.findPage(path, req.user, req.query.revision)
      .then(function(page) {
        debug('Page found', page._id, page.path)

        if (isMarkdown) {
          res.set('Content-Type', 'text/plain')
          return res.send(page.revision.body)
        }

        return renderPage(page, req, res)
      })
      .catch(function(err) {
        const normalizedPath = Page.normalizePath(path)
        if (normalizedPath !== path) {
          return res.redirect(normalizedPath)
        }

        // pageShow は /* にマッチしてる最後の砦なので、creatableName でない routing は
        // これ以前に定義されているはずなので、こうしてしまって問題ない。
        if (!Page.isCreatableName(path)) {
          // 削除済みページの場合 /trash 以下に移動しているので creatableName になっていないので、表示を許可
          debug('Page is not creatable name.', path)
          res.redirect('/')
          return
        }
        if (req.query.revision) {
          return res.redirect(encodeURI(path))
        }

        if (isMarkdown) {
          return res.redirect('/')
        }

        Page.hasPortalPage(path + '/', req.user)
          .then(function(page) {
            if (page) {
              return res.redirect(encodeURI(path) + '/')
            } else {
              var fixed = Page.fixToCreatableName(path)
              if (fixed !== path) {
                debug('fixed page name', fixed)
                res.redirect(encodeURI(fixed))
                return
              }

              debug('There no page for', `${path}`)
              return renderPage(null, req, res)
            }
          })
          .catch(function(err) {
            debug('Error on rendering pageShow (redirect to portal)', err)
          })
      })
  }

  actions.pageEdit = function(req, res) {
    var pageForm = req.body.pageForm
    var body = pageForm.body
    var currentRevision = pageForm.currentRevision
    var grant = pageForm.grant
    var path = pageForm.path

    // TODO: make it pluggable
    var notify = pageForm.notify || {}

    debug('notify: ', notify)

    var redirectPath = encodeURI(path)
    var pageData = {}
    var updateOrCreate
    var previousRevision = false

    // set to render
    res.locals.pageForm = pageForm

    // 削除済みページはここで編集不可判定される
    if (!Page.isCreatableName(path)) {
      res.redirect(redirectPath)
      return
    }

    var ignoreNotFound = true
    Page.findPage(path, req.user, null, ignoreNotFound)
      .then(function(data) {
        pageData = data

        if (!req.form.isValid) {
          debug('Form data not valid')
          throw new Error('Form data not valid.')
        }

        if (data && !data.isUpdatable(currentRevision)) {
          debug('Conflict occured')
          req.form.errors.push('page_edit.notice.conflict')
          throw new Error('Conflict.')
        }

        if (data) {
          previousRevision = data.revision
          return Page.updatePage(data, body, req.user, { grant: grant })
        } else {
          // new page
          updateOrCreate = 'create'
          return Page.create(path, body, req.user, { grant: grant })
        }
      })
      .then(function(data) {
        // data is a saved page data.
        pageData = data
        if (!data) {
          throw new Error('Data not found')
        }
        // TODO: move to events
        if (notify.slack) {
          if (notify.slack.on && notify.slack.channel) {
            data
              .updateSlackChannel(notify.slack.channel)
              .then(function() {})
              .catch(function() {})

            if (crowi.slack) {
              notify.slack.channel.split(',').map(function(chan) {
                var message = crowi.slack.prepareSlackMessage(pageData, req.user, chan, updateOrCreate, previousRevision)
                crowi.slack
                  .post(message.channel, message.text, message)
                  .then(function() {})
                  .catch(function() {})
              })
            }
          }
        }

        return res.redirect(redirectPath)
      })
      .catch(function(err) {
        debug('Page create or edit error.', err)
        if (pageData && !req.form.isValid) {
          return renderPage(pageData, req, res)
        }

        return res.redirect(redirectPath)
      })
  }

  // app.get( '/users/:username([^/]+)/bookmarks'      , loginRequired(crowi, app) , page.userBookmarkList);
  actions.userBookmarkList = function(req, res) {
    var username = req.params.username
    var limit = 50
    var offset = parseInt(req.query.offset) || 0

    var renderVars = {}

    var pagerOptions = { offset: offset, limit: limit }
    var queryOptions = { offset: offset, limit: limit + 1, populatePage: true, requestUser: req.user }

    User.findUserByUsername(username)
      .then(function(user) {
        if (user === null) {
          throw new Error('The user not found.')
        }
        renderVars.pageUser = user

        return Bookmark.findByUser(user, queryOptions)
      })
      .then(function(bookmarks) {
        if (bookmarks.length > limit) {
          bookmarks.pop()
        }
        pagerOptions.length = bookmarks.length

        renderVars.pager = generatePager(pagerOptions)
        renderVars.bookmarks = bookmarks

        return res.render('user/bookmarks', renderVars)
      })
      .catch(function(err) {
        debug('Error on rendereing bookmark', err)
        res.redirect('/')
      })
  }

  // app.get( '/users/:username([^/]+)/recent-create' , loginRequired(crowi, app) , page.userRecentCreatedList);
  actions.userRecentCreatedList = function(req, res) {
    var username = req.params.username
    var limit = 50
    var offset = parseInt(req.query.offset) || 0

    var renderVars = {}

    var pagerOptions = { offset: offset, limit: limit }
    var queryOptions = { offset: offset, limit: limit + 1 }

    User.findUserByUsername(username)
      .then(function(user) {
        if (user === null) {
          throw new Error('The user not found.')
        }
        renderVars.pageUser = user

        return Page.findListByCreator(user, queryOptions, req.user)
      })
      .then(function(pages) {
        if (pages.length > limit) {
          pages.pop()
        }
        pagerOptions.length = pages.length

        renderVars.pager = generatePager(pagerOptions)
        renderVars.pages = pages

        return res.render('user/recent-create', renderVars)
      })
      .catch(function(err) {
        debug('Error on rendereing recent-created', err)
        res.redirect('/')
      })
  }

  var api = (actions.api = {})

  /**
   * redirector
   */
  api.redirector = function(req, res) {
    var id = req.params.id

    Page.findPageById(id)
      .then(function(pageData) {
        const isGranted = pageData.isGrantedFor(req.user)

        if (pageData.grant == Page.GRANT_RESTRICTED && !isGranted) {
          return Page.pushToGrantedUsers(pageData, req.user)
        }

        if (!isGranted) {
          throw new Error('Page is not granted for the user.')
        }

        return Promise.resolve(pageData)
      })
      .then(function(page) {
        return res.redirect(encodeURI(page.path))
      })
      .catch(function(err) {
        return res.redirect('/')
      })
  }

  /**
   * @api {get} /pages.list List pages by user
   * @apiName ListPage
   * @apiGroup Page
   *
   * @apiParam {String} path
   * @apiParam {String} user
   */
  api.list = function(req, res) {
    var username = req.query.user || null
    var path = req.query.path || null
    var limit = 50
    var offset = parseInt(req.query.offset) || 0

    var pagerOptions = { offset: offset, limit: limit }
    var queryOptions = { offset: offset, limit: limit + 1 }

    // Accepts only one of these
    if (username === null && path === null) {
      return res.json(ApiResponse.error('Parameter user or path is required.'))
    }
    if (username !== null && path !== null) {
      return res.json(ApiResponse.error('Parameter user or path is required.'))
    }

    var pageFetcher
    if (path === null) {
      pageFetcher = User.findUserByUsername(username).then(function(user) {
        if (user === null) {
          throw new Error('The user not found.')
        }
        return Page.findListByCreator(user, queryOptions, req.user)
      })
    } else {
      pageFetcher = Page.findListByStartWith(path, req.user, queryOptions)
    }

    pageFetcher
      .then(function(pages) {
        if (pages.length > limit) {
          pages.pop()
        }
        pagerOptions.length = pages.length

        var result = {}
        result.pages = pages
        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        return res.json(ApiResponse.error(err))
      })
  }

  /**
   * @api {post} /pages.create Create new page
   * @apiName CreatePage
   * @apiGroup Page
   *
   * @apiParam {String} body
   * @apiParam {String} path
   * @apiParam {String} grant
   */
  api.create = function(req, res) {
    var body = req.body.body || null
    var pagePath = req.body.path || null
    var grant = req.body.grant || null

    if (body === null || pagePath === null) {
      return res.json(ApiResponse.error('Parameters body and path are required.'))
    }

    var ignoreNotFound = true
    Page.findPage(pagePath, req.user, null, ignoreNotFound)
      .then(function(data) {
        if (data !== null) {
          throw new Error('Page exists')
        }

        return Page.create(pagePath, body, req.user, { grant: grant })
      })
      .then(function(data) {
        if (!data) {
          throw new Error('Failed to create page.')
        }
        var result = { page: data.toObject() }

        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        return res.json(ApiResponse.error(err))
      })
  }

  /**
   * @api {post} /pages.update Update page
   * @apiName UpdatePage
   * @apiGroup Page
   *
   * @apiParam {String} body
   * @apiParam {String} page_id
   * @apiParam {String} revision_id
   * @apiParam {String} grant
   *
   * In the case of the page exists:
   * - If revision_id is specified => update the page,
   * - If revision_id is not specified => force update by the new contents.
   */
  api.update = function(req, res) {
    var pageBody = req.body.body || null
    var pageId = req.body.page_id || null
    var revisionId = req.body.revision_id || null
    var grant = req.body.grant || null

    if (pageId === null || pageBody === null) {
      return res.json(ApiResponse.error('page_id and body are required.'))
    }

    Page.findPageByIdAndGrantedUser(pageId, req.user)
      .then(function(pageData) {
        if (pageData && revisionId !== null && !pageData.isUpdatable(revisionId)) {
          throw new Error('Revision error.')
        }

        var grantOption = { grant: pageData.grant }
        if (grant !== null) {
          grantOption.grant = grant
        }
        return Page.updatePage(pageData, pageBody, req.user, grantOption)
      })
      .then(function(pageData) {
        var result = {
          page: pageData.toObject(),
        }
        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('error on _api/pages.update', err)
        return res.json(ApiResponse.error(err))
      })
  }

  /**
   * @api {get} /pages.get Get page data
   * @apiName GetPage
   * @apiGroup Page
   *
   * @apiParam {String} page_id
   * @apiParam {String} path
   * @apiParam {String} revision_id
   */
  api.get = function(req, res) {
    const pagePath = req.query.path || null
    const pageId = req.query.page_id || null // TODO: handling
    const revisionId = req.query.revision_id || null

    if (!pageId && !pagePath) {
      return res.json(ApiResponse.error(new Error('Parameter path or page_id is required.')))
    }

    let pageFinder
    if (pageId) {
      // prioritized
      pageFinder = Page.findPageByIdAndGrantedUser(pageId, req.user)
    } else if (pagePath) {
      pageFinder = Page.findPage(pagePath, req.user, revisionId)
    }

    pageFinder
      .then(function(pageData) {
        var result = {}
        result.page = pageData

        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        return res.json(ApiResponse.error(err))
      })
  }

  /**
   * @api {post} /pages.seen Mark as seen user
   * @apiName SeenPage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   */
  api.seen = function(req, res) {
    var pageId = req.body.page_id
    if (!pageId) {
      return res.json(ApiResponse.error('page_id required'))
    }

    Page.findPageByIdAndGrantedUser(pageId, req.user)
      .then(function(page) {
        return page.seen(req.user)
      })
      .then(function(user) {
        var result = {}
        result.seenUser = user

        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Seen user update error', err)
        return res.json(ApiResponse.error(err))
      })
  }

  /**
   * @api {post} /likes.add Like page
   * @apiName LikePage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   */
  api.like = function(req, res) {
    var id = req.body.page_id

    Page.findPageByIdAndGrantedUser(id, req.user)
      .then(function(pageData) {
        return pageData.like(req.user)
      })
      .then(function(data) {
        var result = { page: data }
        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Like failed', err)
        return res.json(ApiResponse.error({}))
      })
  }

  /**
   * @api {post} /likes.remove Unlike page
   * @apiName UnlikePage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   */
  api.unlike = function(req, res) {
    var id = req.body.page_id

    Page.findPageByIdAndGrantedUser(id, req.user)
      .then(function(pageData) {
        return pageData.unlike(req.user)
      })
      .then(function(data) {
        var result = { page: data }
        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Unlike failed', err)
        return res.json(ApiResponse.error({}))
      })
  }

  /**
   * @api {get} /pages.updatePost
   * @apiName Get UpdatePost setting list
   * @apiGroup Page
   *
   * @apiParam {String} path
   */
  api.getUpdatePost = function(req, res) {
    var path = req.query.path
    var UpdatePost = crowi.model('UpdatePost')

    if (!path) {
      return res.json(ApiResponse.error({}))
    }

    UpdatePost.findSettingsByPath(path)
      .then(function(data) {
        data = data.map(function(e) {
          return e.channel
        })
        debug('Found updatePost data', data)
        var result = { updatePost: data }
        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Error occured while get setting', err)
        return res.json(ApiResponse.error({}))
      })
  }

  /**
   * @api {post} /pages.remove Remove page
   * @apiName RemovePage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   * @apiParam {String} revision_id
   */
  api.remove = function(req, res) {
    var pageId = req.body.page_id
    var previousRevision = req.body.revision_id || null

    // get completely flag
    const isCompletely = req.body.completely !== undefined

    Page.findPageByIdAndGrantedUser(pageId, req.user)
      .then(function(pageData) {
        debug('Delete page', pageData._id, pageData.path)

        if (isCompletely) {
          return Page.completelyDeletePage(pageData, req.user)
        }

        // else

        if (!pageData.isUpdatable(previousRevision)) {
          throw new Error("Someone could update this page, so couldn't delete.")
        }
        return Page.deletePage(pageData, req.user)
      })
      .then(function(data) {
        debug('Page deleted', data.path)
        var result = {}
        result.page = data

        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Error occured while get setting', err, err.stack)
        return res.json(ApiResponse.error('Failed to delete page.'))
      })
  }

  /**
   * @api {post} /pages.revertRemove Revert removed page
   * @apiName RevertRemovePage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   */
  api.revertRemove = function(req, res) {
    var pageId = req.body.page_id

    Page.findPageByIdAndGrantedUser(pageId, req.user)
      .then(function(pageData) {
        // TODO: これでいいんだっけ
        return Page.revertDeletedPage(pageData, req.user)
      })
      .then(function(data) {
        debug('Complete to revert deleted page', data.path)
        var result = {}
        result.page = data

        return res.json(ApiResponse.success(result))
      })
      .catch(function(err) {
        debug('Error occured while get setting', err, err.stack)
        return res.json(ApiResponse.error('Failed to revert deleted page.'))
      })
  }

  /**
   * @api {post} /pages.rename Rename page
   * @apiName RenamePage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   * @apiParam {String} path
   * @apiParam {String} revision_id
   * @apiParam {String} new_path
   * @apiParam {Bool} create_redirect
   */
  api.rename = async function(req, res) {
    const { page_id: pageId, revision_id: previousRevision = null, new_path: newPath, create_redirect: createRedirect, move_trees: moveTrees } = req.body
    const newPagePath = Page.normalizePath(newPath)
    const newPageIsPortal = newPagePath.endsWith('/')
    const options = {
      createRedirectPage: (!newPageIsPortal && createRedirect) || 0,
      moveUnderTrees: moveTrees || 0,
    }

    if (!Page.isCreatableName(newPagePath)) {
      return res.json(ApiResponse.error(sprintf('このページ名は作成できません (%s)', newPagePath)))
    }

    const rename = async function() {
      try {
        const page = await Page.findPageById(pageId)
        if (!page.isUpdatable(previousRevision)) {
          return res.json(ApiResponse.error(new Error("Someone could update this page, so couldn't delete.")))
        }
        await Page.rename(page, newPagePath, req.user, options)
        const result = { page }
        return res.json(ApiResponse.success(result))
      } catch (err) {
        return res.json(ApiResponse.error('Failed to update page.'))
      }
    }

    try {
      const page = await Page.findPageByPath(newPagePath)
      if (page.isUnlinkable(req.user)) {
        try {
          await page.unlink(req.user)
          rename()
        } catch (err) {
          res.json(ApiResponse.error(err))
        }
      } else {
        // can't rename to that path when page found and can't remove it
        return res.json(ApiResponse.error(sprintf('このページ名は作成できません (%s)。ページが存在します。', newPagePath)))
      }
    } catch (err) {
      rename()
    }
  }

  api.renameTree = async function(req, res) {
    const { path, new_path: newPath, create_redirect: createRedirect = 0 } = req.body
    const options = { createRedirectPage: createRedirect }

    const paths = await Page.findChildrenByPath(path, req.user, {})
    const pathMap = Page.getPathMap(paths, path, newPath)

    const [error, errors] = await Page.checkPagesRenamable(Object.values(pathMap), req.user)

    if (error) {
      const info = { errors, path_map: pathMap }
      return res.json(ApiResponse.error('rename_tree.error.can_not_move', info))
    }

    try {
      const result = await Page.renameTree(pathMap, req.user, options)
      return res.json(ApiResponse.success({ pages: result }))
    } catch (err) {
      return res.json(ApiResponse.error(err))
    }
  }

  api.checkTreeRenamable = async function(req, res) {
    const { path, new_path: newPath } = req.body

    const paths = await Page.findChildrenByPath(path, req.user, {})
    const pathMap = Page.getPathMap(paths, path, newPath)

    const [error, errors] = await Page.checkPagesRenamable(Object.values(pathMap), req.user)

    if (error) {
      const info = { errors, path_map: pathMap }
      return res.json(ApiResponse.error('rename_tree.error.can_not_move', info))
    }

    return res.json(ApiResponse.success({ path_map: pathMap }))
  }

  /**
   * @api {post} /pages.unlink Remove the redirecting page
   * @apiName UnlinkPage
   * @apiGroup Page
   *
   * @apiParam {String} page_id Page Id.
   * @apiParam {String} revision_id
   */
  api.unlink = async function(req, res) {
    const { page_id: pageId } = req.body
    try {
      const page = await Page.findPageByIdAndGrantedUser(pageId, req.user)
      debug('Unlink page', page._id, page.path)
      await Page.removeRedirectOriginPageByPath(page.path)
      debug('Redirect Page deleted', page.path)
      const result = { page }
      return res.json(ApiResponse.success(result))
    } catch (err) {
      debug('Error occured while get setting', err, err.stack)
      return res.json(ApiResponse.error('Failed to delete redirect page.'))
    }
  }

  return actions
}
