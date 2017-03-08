'use strict'

const vm = require('vm')

function hasAsyncSupport () {
  try {
    vm.runInNewContext('async () => {}')
  } catch (err) {
    return false
  }

  return true
}

// tests

require('./co-busboy.js')
require('./result.js')

if (hasAsyncSupport()) {
  require('./async.js')
}
