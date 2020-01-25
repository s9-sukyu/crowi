import MarkdownIt from 'markdown-it'

import LinkPlugin from './LinkPlugin'
import EmojiPlugin from './EmojiPlugin'
const { useContainer, katexPlugin, markPlugin, createHighlightFunc } = require('traq-markdown-it')

export default class {
  constructor(crowi) {
    const md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
      highlight: createHighlightFunc('wiki-code wiki-lang'),
    })

    LinkPlugin.forEach(plugin => md.use(plugin))
    md.use(EmojiPlugin)
    useContainer(md)
    md.use(markPlugin)
    md.use(katexPlugin, {
      output: 'html',
    })
    md.use(require('markdown-it-footnote'))

    md.linkify.set({ fuzzyLink: false })

    this.renderer = md
  }

  render(markdown, dom) {
    return this.renderer.render(markdown)
  }
}
