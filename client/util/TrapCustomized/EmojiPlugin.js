import Plugin from 'markdown-it-regexp'

let emojis = JSON.parse(localStorage.emojis || '[]')
;(async () => {
  const resp = await fetch('https://q.trap.jp/api/1.0/public/emoji.json')
  const data = await resp.json()
  emojis = Object.keys(data)
    .map(key => data[key])
    .reduce((a, b) => a.concat(b), [])
  localStorage.emojis = JSON.stringify(emojis)
})()

export default Plugin(/:([\w-_]+?)[:;]/, ([wrappedName, name], utils) => {
  if (emojis.some(emojiName => emojiName === name)) {
    return `<i class="emoji s${/:$/.test(wrappedName) ? 32 : 16} e_${name.replace(/\+/g, '_-plus-_')}" title="${wrappedName}">${wrappedName}</i>`
  } else {
    return wrappedName
  }
})
