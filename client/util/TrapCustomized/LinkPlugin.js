import Plugin from 'markdown-it-regexp'

const handler = ([_, url], utils) => ` <a href="${utils.escape(url)}">${utils.escape(url)}</a>`

export default [Plugin(/\[(\/[^\]]+?)\](?!\()/, handler), Plugin(/<((\/[^>]+?){2,})>/, handler)]
