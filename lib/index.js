'use strict'


/**
 * Modules (Node.js)
 * @constant
 */
const fs = require('fs')
const os = require('os')

/**
 * Modules (Third party)
 * @constant
 */
const _ = require('lodash')
const cleanCSS = require('clean-css')
const fileUrl = require('file-url')
const logger = require('@sidneys/logger')({ timestamp: false })
const platformTools = require('@sidneys/platform-tools')
const moment = require('moment')
/* eslint-disable no-unused-vars */
const momentDurationFormatSetup = require('moment-duration-format')
/* eslint-enable */


/**
 * @constant
 * @default
 */
const defaultDebounce = 50


/**
 * Get background-image url attribute
 * @param {String} url - Image url
 * @return {String} background-image url
 */
let backgroundUrl = (url) => `url(\"${url}\")`

/**
 * Get child item index
 * @param {HTMLElement|Node} element - Element
 * @return {Number} Index
 */
let getElementIndex = (element) => {
    const childList = element.parentNode.childNodes

    let index = 0
    for (index; index < childList.length; index++) {
        if (element === childList[index]) {
            break
        }
    }

    return index
}

/** @function getEventListeners */

/**
 * Get all event listeners (Chrome only)
 * @param {HTMLElement|Node} element - Element
 * @return {Object} Event listeners
 */
let getListeners = (element) => {
    logger.debug('getListeners')

    return getEventListeners(element)
}


/**
 * Wrapper for Electron executeJavaScript method
 * @param {Electron.WebviewTag|HTMLElement|Node|Electron.WebContents} webviewElement - Electron Webview Element
 * @param {String} code - JavaScript Code
 * @returns {Promise} executeJavaScript Method
 */
let executeJavascript = (webviewElement, code) => webviewElement.executeJavaScript(code)


/**
 * Add CSS class(es) to Elements matched by selector
 * @param {String} selector - CSS Selector for target elements
 * @param {DOMTokenList[]|String[]} classList - CSS class name(s)
 */
let addClassList = (selector, classList = []) => {
    logger.debug('addClassList')

    // Find target elements
    Array.from(document.querySelectorAll(selector)).forEach((element) => {
        // Add CSS classes
        element.classList.add(...classList)
    })
}

/**
 * Add CSS class(es) to Elements matched by selector, inside embedded Webview
 * @param {Electron.WebviewTag|Electron.WebContents} webviewElement - Electron Webview
 * @param {String} selector - CSS Selector for target elements
 * @param {DOMTokenList[]|String[]} classList - Class attribute as a set of whitespace-separated tokens
 * @param {function=} callback - Callback Function
 */
let addClassListInWebview = (webviewElement, selector, classList, callback = () => {}) => {
    logger.debug('addClassListInWebview')

    webviewElement.executeJavaScript(
        `
        Array.from(document.querySelectorAll('${selector}')).forEach((element) => {
            element.classList.add("${classList.join('", "')}");
        });
        `
    )
        .then((result) => {
            logger.debug('addClassListInWebview', 'result:', result)

            // Callback
            callback(null, result)
        })
        .catch((error) => {
            logger.error('addClassListInWebview', 'error:', error)

            // Callback
            callback(error)
        })
}

/**
 * Add CSS class(es) to Elements matched by selector
 * @param {String} selector - CSS Selector for target elements
 * @param {...String} className - CSS class name(s)
 * @returns {void}
 */
let addClassName = (selector, ...className) => addClassList(selector, [ ...className ])


/**
 * Remove CSS class(es) from Elements matched by selector
 * @param {String} selector - CSS Selector for target elements
 * @param {DOMTokenList[]|String[]} classList - CSS class name(s)
 */
let removeClassList = (selector, classList = []) => {
    logger.debug('removeClassList')

    // Find target elements
    Array.from(document.querySelectorAll(selector)).forEach((element) => {
        // Remove CSS classes
        element.classList.remove(...classList)
    })
}

/**
 * Remove CSS class(es) from Elements matched by selector
 * @param {String} selector - CSS Selector for target elements
 * @param {...String} className - CSS class name(s)
 * @returns {void}
 */
let removeClassName = (selector, ...className) => removeClassList(selector, [ ...className ])


/**
 * Add name of active platform as CSS classes to Element (e.g., <html class="win32">)
 * @param {HTMLElement|Node} element - Target element
 * @return {void}
 */
let addPlatformClass = element => element.classList.add(...platformTools.names)

/**
 * Load CSS from local Stylesheet file, inject into webpage, inside embedded Webview
 * @param {Electron.WebviewTag|Electron.WebContents} webviewElement - Electron Webview
 * @param {String} stylesheetPath - Path to Stylesheet
 * @param {function=} callback - Callback Function
 */
let loadStylesheetCSSInWebview = (webviewElement, stylesheetPath, callback = () => {}) => {
    logger.debug('loadStylesheetCSSInWebview')

    // 1. Get list of previously injected Stylesheets
    webviewElement.executeJavaScript(`document.querySelector('html').dataset.injectedstylesheets;`)
        .then((result) => {
            // 2. Get paths of previously injected Stylesheet
            let stylesheetPathList = []
            if (result) {
                try {
                    stylesheetPathList = JSON.parse(result.toString())
                } catch (exception) {
                    // Skip if Stylesheet path list could not be parsed
                    logger.error(`could not parse previously injected stylesheet css: ${result}`)

                    // Callback
                    callback(exception)
                    return
                }

                // Print paths of previously injected Stylesheets
                logger.debug('previously injected stylesheets paths:', stylesheetPathList.join(', '))

                // Skip if Stylesheet was previously injected
                if (stylesheetPathList.includes(stylesheetPath)) {
                    // Callback
                    callback(Error(`stylesheet was previously injected from path: ${stylesheetPath}`))
                    return
                }
            }

            // Initialize CSS text
            let cssData

            // 3. Read Stylesheet data from disk
            const stream = fs.createReadStream(stylesheetPath, { encoding: 'utf8', autoClose: true, emitClose: true })

            /* @listens ReadStream#Event:data */
            stream.on('data', (chunk) => {
                logger.debug('stream#data')

                cssData += chunk
            })

            /* @listens ReadStream#Event:error */
            stream.on('error', (error) => {
                logger.debug('stream#error')

                // Callback
                callback(error)
            })

            /* @listens ReadStream#Event:close */
            stream.on('close', () => {
                logger.debug('stream#close')

                // Concat, trim, minify CSS code
                let cssText = cssData.toString().trim()
                cssText = `${cssText}${os.EOL}`
                cssText = (new cleanCSS()).minify(cssText)

                // Stats
                logger.debug(`stylesheet css minification result: (${(cssText.stats.efficiency * 100).toFixed(2)}% size reduction)`)

                // 4. Inject CSS
                webviewElement.insertCSS(cssText.styles)
                    .then((result) => {
                        logger.debug('injected new stylesheet from path:', stylesheetPath)

                        // Update list of injected Stylesheets
                        stylesheetPathList.push(stylesheetPath)
                        stylesheetPathList = [ ...new Set(stylesheetPathList) ]

                        // 5. Add Stylesheet path to list of injected Stylesheets
                        webviewElement.executeJavaScript(`document.querySelector('html').dataset.injectedstylesheets = '${JSON.stringify(stylesheetPathList)}';`)
                            .then(() => {
                                // Callback
                                callback(null, cssText.styles)
                            })
                            .catch((error) => {
                                // Callback
                                callback(error)
                            })
                    })
                    .catch((error) => {
                        // Callback
                        callback(error)
                    })
            })
        })
        .catch((error) => {
            // Callback
            callback(error)
        })
}

/**
 * Load file:// URL of local Stylesheet file, inject into webpage
 * @param {String} stylesheetPath - Path to Stylesheet
 */
let loadStylesheetURL = (stylesheetPath) => {
    logger.debug('loadStylesheetURL')

    // Init file:// URL
    const url = fileUrl(stylesheetPath)

    // Create <link> Element
    const linkElement = document.createElement('link')
    linkElement.href = url
    linkElement.type = 'text/css'
    linkElement.rel = 'stylesheet'

    /** @fires linkElement:Event#load */
    linkElement.onload = () => {
        console.info('loadStylesheetURL', 'url:', url)
    }

    // Add <link> Element to webpage
    document.querySelector('head').appendChild(linkElement)
}


/**
 * Check if Object is an HTML Element
 * @param {*} object - Object
 * @returns {Boolean} - Type
 */
let isHtmlElement = (object) => object instanceof HTMLElement

/**
 * Check if descendant elements of a given list have been scrolled into view, given a fixed percentage threshold.
 * @param {NodeList} elementList - Element to test
 * @param {Number=} threshold - Percentage of list after which loading starts
 * @param {Number} fixedCount - Use a fixed base list item count instead of the actual item count, e.g. for dynamically growing lists.
 * @returns {Boolean|void}
 */
let didScrollIntoViewport = (elementList, threshold = 0.75, fixedCount = elementList.length) => {
    // logger.debug('shouldLoadMore');

    if (elementList.length === 0) {
        return
    }

    // Calculated on basis of percentage of length
    let targetIndex = Math.floor(elementList.length - (1 - threshold) * fixedCount)

    const targetElement = elementList[targetIndex - 1]
    const targetElementRect = targetElement.getBoundingClientRect()

    // DEBUG
    // targetElement.style.background = 'red';

    return targetElementRect.top <= document.documentElement.clientHeight
}

/**
 * Format duration as HH:MM:SS
 * @param {String} duration - Duration
 * @returns {String} Formatted duration
 */
let formatDuration = (duration) => {
    // logger.debug('formatDuration');

    duration = moment.duration(duration).format('h:mm:ss')
    duration = duration === '0' ? '∞' : duration

    return duration
}

/**
 * Load external scripts
 * @param {String} filePath - Path to JavaScript
 */
let loadScript = (filePath) => {
    let url = fileUrl(filePath)

    let script = document.createElement('script')
    script.src = url
    script.type = 'text/javascript'

    script.onload = () => {
        console.debug('dom-helper', 'loadScript', 'complete', url)
    }

    document.getElementsByTagName('head')[0].appendChild(script)
}

/**
 * Remove element from DOM
 * @param {HTMLElement|Node} element - Element
 * @param {Number=} delay - Delay
 */
let remove = function(element, delay = 0) {
    logger.debug('remove')

    let timeout = setTimeout(() => {
        if (element.parentNode) {
            element.parentNode.removeChild(element)
        }

        clearTimeout(timeout)
    }, delay)
}

/** @namespace eventListener.useCapture */

/**
 * Remove all event listeners
 * @param {HTMLElement|Node} element - Element
 */
let removeListeners = (element) => {
    logger.debug('removeListeners')

    const eventListenerTypeList = getListeners(element)

    Object.keys(eventListenerTypeList).forEach((eventListenerType) => {

        const eventListenerList = eventListenerTypeList[eventListenerType]

        eventListenerList.forEach((eventListener) => {
            element.removeEventListener(eventListener.type, eventListener.listener, eventListener.useCapture)
        })
    })
}

/**
 * Copy target element size to source element size
 * @param {HTMLElement|Node} source - Source element
 * @param {HTMLElement|Node} target - Target element
 */
let scaleToFill = (source, target) => {
    //logger.debug('scaleToFill');

    let debounced = _.debounce(() => {
        source.style.height = target.clientHeight + 'px'
        source.style.width = target.clientWidth + 'px'
    }, defaultDebounce)

    // noinspection JSValidateTypes
    debounced()
}

/** @namespace window.Materialize */

/**
 * Show materializeCSS toast
 * @param {String} message - Text
 * @param {Number} displayLength - Time displayed
 */
let toast = (message, displayLength = 3000) => {
    logger.debug('toast')

    if (!window.Materialize) {
        return
    }

    window.Materialize.toast(message, displayLength)
}

/**
 * Find list item by list element
 * @param {HTMLElement|Node} element - Element list
 * @param {String} value - itemElement
 * @param {String=} tag - Tag name
 * @returns {HTMLLIElement|Node|void}
 *
 * @public
 */
let findChildElementByDatasetValue = (element, value, tag = 'li') => {
    logger.debug('findChildElementByDatasetValue')

    if (!element) {
        return
    }
    if (!value) {
        return
    }

    const itemElementList = Array.from(element.querySelectorAll(tag))

    return itemElementList.find((itemElement) => Object.values(itemElement.dataset).indexOf(value) !== -1)
}

/**
 * Set element text content
 * @param {HTMLElement|Node} element - Element
 * @param {String} text - Text
 * @param {Number=} delay - Delay
 */
let setText = (element, text = '', delay = 0) => {
    let timeout = setTimeout(() => {
        element.innerText = text
        clearTimeout(timeout)
    }, delay)
}

/**
 * Set element visibility
 * @param {HTMLElement|Node} element - Element
 * @param {Boolean} visible - Show or hide
 * @param {Number=} delay - Delay
 */
let setVisibility = (element, visible, delay = 0) => {
    let timeout = setTimeout(() => {
        if (visible) {
            element.classList.add('show')
            element.classList.remove('hide')
        } else {
            element.classList.add('hide')
            element.classList.remove('show')
        }
        clearTimeout(timeout)
    }, delay)
}

/**
 * Show element
 * @param {HTMLElement|Node} element - Element
 * @param {Number=} delay - Delay
 */
let hide = (element, delay = 0) => {
    setVisibility(element, false, delay)
}

/**
 * Hide element
 * @param {HTMLElement|Node} element - Element
 * @param {Number=} delay - Delay
 */
let show = (element, delay = 0) => {
    setVisibility(element, true, delay)
}


/**
 * @exports
 */
module.exports = {
    addClassList: addClassList,
    addClassListInWebview: addClassListInWebview,
    addClassName: addClassName,
    removeClassList: removeClassList,
    removeClassName: removeClassName,
    addPlatformClass: addPlatformClass,
    loadStylesheetCSSInWebview: loadStylesheetCSSInWebview,
    loadStylesheetURL: loadStylesheetURL,
    backgroundUrl: backgroundUrl,
    didScrollIntoViewport: didScrollIntoViewport,
    findChildElementByDatasetValue: findChildElementByDatasetValue,
    formatDuration: formatDuration,
    getElementIndex: getElementIndex,
    getListeners: getListeners,
    hide: hide,
    executeJavascript: executeJavascript,
    isHtmlElement: isHtmlElement,
    loadScript: loadScript,
    remove: remove,
    removeListeners: removeListeners,
    scaleToFill: scaleToFill,
    setText: setText,
    setVisibility: setVisibility,
    show: show,
    toast: toast,

    // Deprecated
    addElementCssClass: addClassList,
    addElementClassList: addClassList,
    injectElementCssClass: addClassListInWebview,
    addElementClassName: addClassName,
    removeElementClassList: removeClassList,
    removeElementClassName: removeClassName,
    addPlatformClasses: addPlatformClass,
    injectStylesheet: loadStylesheetCSSInWebview,
    loadStylesheet: loadStylesheetURL
}
