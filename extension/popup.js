function getDocumentImages() {
  // Match format 1: https://www.fanbox.cc/@{string}/posts/{number}
  // Match format 2: https://${string}.fanbox.cc/posts/${number}
  const FANBOX_URL_REGEX = new RegExp(
    '^https://[^.]+\\.fanbox\\.cc/(?:@[^/]+/)?posts/(?<postId>\\d+)',
  )

  const formatFilename = (template, fields) => {
    return Object.keys(fields).reduce(
      (result, key) => result.replace(`{${key}}`, fields[key]),
      template,
    )
  }

  const match = FANBOX_URL_REGEX.exec(document.location)
  if (!match) {
    return []
  }

  const { postId } = match.groups

  const article = document.querySelector('article')

  const title = article.querySelector('h1').innerText
  const escapedTitle = title.replace(/[/|]/g, '')

  const coverImageUrl = article.childNodes[0]
    .querySelector('[style^="background"]')
    ?.style.backgroundImage.slice(5, -2)
  const contentImageUrls = Array.from(article.querySelectorAll('[href]')).map(
    v => v.href,
  )
  const imageUrls = [coverImageUrl, ...contentImageUrls].filter(Boolean)

  const indexOffset = coverImageUrl == null ? 1 : 0

  return imageUrls.map((url, i) => {
    const [basename, baseext] = url.split('/').slice(-1)[0].split('.')
    const index = i + indexOffset
    const filename = formatFilename(
      '{postId}_p{index}_{basename} - {title}{ext}',
      { postId, index, basename, title: escapedTitle, ext: `.${baseext}` },
    )
    return { filename, url }
  })
}

function focusDocumentImage(url) {
  const node =
    document.querySelector(`a[href="${url}"]`) ||
    document.querySelector(`[style*="${url}"]`)
  node?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
}

function render(container, props) {
  const document = container.ownerDocument
  const {
    images,
    isAvailable,
    labelDownloadButton,
    nonImages,
    onClickDownload,
    onClickImage,
    textUnavailable,
    title,
  } = props

  function renderHeader() {
    const header = document.createElement('HEADER')

    const h1 = header.appendChild(document.createElement('H1'))
    h1.appendChild(document.createTextNode(title))

    const button = header.appendChild(document.createElement('BUTTON'))
    button.appendChild(document.createTextNode(labelDownloadButton))
    button.type = 'button'
    button.addEventListener('click', onClickDownload)
    if (!isAvailable) {
      button.setAttribute('disabled', '')
    }

    Object.assign(header.style, {
      alignItems: 'center',
      background: 'white',
      display: 'flex',
      padding: '16px 16px 4px',
      position: 'sticky',
      top: '0',
    })
    Object.assign(h1.style, {
      color: '#666',
      flex: '1',
      fontSize: '1rem',
      fontWeight: '700',
      minWidth: '0',
    })
    Object.assign(button.style, {
      background: 'white',
      border: 'solid 1px #999',
      borderRadius: '4px',
      cursor: isAvailable ? 'pointer' : 'not-allowed',
      fontSize: '.75rem',
      padding: '4px 8px',
    })

    return header
  }

  function renderMain() {
    const main = document.createElement('MAIN')

    Object.assign(main.style, {
      margin: '8px 0 0',
      padding: '0 16px 16px',
    })

    if (!isAvailable) {
      const messageBox = main.appendChild(document.createElement('P'))
      messageBox.appendChild(document.createTextNode(textUnavailable))

      Object.assign(messageBox.style, {
        color: 'red',
      })
    }

    if (isAvailable) {
      const ul = main.appendChild(document.createElement('UL'))

      Object.assign(ul.style, {
        display: 'flex',
        flexDirection: 'column',
      })

      const assets = [...images, ...nonImages]

      for (let i = 0, len = assets.length; i < len; ++i) {
        const asset = assets[i]
        const li = ul.appendChild(document.createElement('LI'))

        const orderSpan = li.appendChild(document.createElement('SPAN'))
        orderSpan.appendChild(document.createTextNode(i + 1))

        Object.assign(li.style, {
          alignItems: 'center',
          display: 'flex',
          gap: '8px',
          overflow: 'hidden',
        })
        Object.assign(orderSpan.style, {
          alignItems: 'center',
          color: '#666',
          display: 'flex',
          flexShrink: '0',
          fontSize: '0.75rem',
          justifySelf: 'center',
          textAlign: 'end',
          width: '20px',
        })

        const isImage = /(jpe?g|gif|png)$/.test(asset.url)
        if (isImage) {
          const img = li.appendChild(document.createElement('IMG'))
          img.src = asset.url
          img.alt = asset.filename
          img.addEventListener('click', onClickImage)

          const filenameSpan = li.appendChild(document.createElement('SPAN'))
          filenameSpan.appendChild(document.createTextNode(asset.filename))

          Object.assign(img.style, {
            cursor: 'pointer',
            height: '80px',
            minWidth: '0',
            objectFit: 'contain',
            width: '120px',
          })
          Object.assign(filenameSpan.style, {
            color: '#666',
            flex: 1,
            fontSize: '0.75rem',
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipses',
          })
        }

        if (!isImage) {
          const anchor = li.appendChild(document.createElement('A'))
          anchor.href = asset.url
          anchor.target = '_blank'
          anchor.appendChild(document.createTextNode(asset.url))

          Object.assign(anchor.style, {
            color: '#2563eb',
            flex: 1,
            fontSize: '0.75rem',
            minWidth: '0',
            overflow: 'hidden',
            textOverflow: 'ellipses',
          })
        }
      }
    }

    return main
  }

  const frag = document.createDocumentFragment()
  frag.appendChild(renderHeader())
  frag.appendChild(renderMain())

  while (container.firstChild) {
    container.removeChild(container.lastChild)
  }
  container.appendChild(frag)
}

function execGetImagesAsync(tab) {
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: getDocumentImages,
        args: [],
      },
      results => resolve(results[0].result),
    )
  })
}

function execFocusImage(tab, url) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: focusDocumentImage,
    args: [url],
  })
}

function mount() {
  function active(tab) {
    async function setup() {
      const assets = await execGetImagesAsync(tab)

      const isImage = v => /\.(jpe?g|gif|png)$/.test(v)
      const hasExtension = v => /\.[a-z]{1,4}$/.test(v)
      const images = assets.filter(v => isImage(v.url))
      const nonImages = assets.filter(v => !isImage(v.url))
      const downloadables = assets.filter(v => hasExtension(v.url))

      // Match format 1: https://www.fanbox.cc/@${string}/posts/${number}
      // Match format 2: https://${string}.fanbox.cc/posts/${number}
      const FANBOX_URL_REGEX = new RegExp(
        '^https://[^.]+\\.fanbox\\.cc/(?:@[^/]+/)?posts/(?<postId>\\d+)',
      )

      const isAvailable = FANBOX_URL_REGEX.test(tab.url)

      const appRoot = document.getElementById('app-root')
      const renderProps = {
        images,
        isAvailable,
        labelDownloadButton: `Download (${downloadables.length})`,
        nonImages,
        onClickDownload: () =>
          downloadables.forEach(opt => chrome.downloads.download(opt)),
        onClickImage: e => execFocusImage(tab, e.currentTarget.src),
        textUnavailable: `Unable to run script in this page: "${tab.url}".`,
        title: 'Pixiv Fanbox Helper',
      }

      render(appRoot, renderProps)
    }

    setup()
  }

  function updateActivate(nextTab) {
    if (nextTab != null) {
      active(nextTab)
    }
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    })
    return tabs[0] ?? null
  }

  getActiveTab().then(updateActivate)

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, tab => updateActivate(tab))
  })

  chrome.windows.onFocusChanged.addListener(() => {
    getActiveTab().then(updateActivate)
  })
}

mount()
