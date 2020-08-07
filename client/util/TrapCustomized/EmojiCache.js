export let emojis = JSON.parse(localStorage.emojis || '[]')
;(async () => {
  const resp = await fetch('https://q.trap.jp/api/1.0/public/emoji.json')
  const data = await resp.json()
  emojis = Object.keys(data)
    .map(key => data[key])
    .reduce((a, b) => a.concat(b), [])
  localStorage.emojis = JSON.stringify(emojis)
})()
