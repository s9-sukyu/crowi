'use strict'

const disabledHandler = (req, res) => {
  res.status(410)
  res.send(`
		<h2>410 Gone</h2>
		<p><strong>${req.path}</strong> was disabled :(</p>
	`)
}

module.exports = (crowi, app) => {
  // disable login/resiter feature
  app.all('/log*', disabledHandler)
  app.all('/register*', disabledHandler)

  // disable user-setting feature
  app.all(/^\/me($|\/(?!apiToken$))/, disabledHandler)
}
