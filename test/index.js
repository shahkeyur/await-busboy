/* global describe,it,before,after */
'use strict'

// https://github.com/cojs/busboy/blob/master/test.js

const assert = require('assert')
const Stream = require('stream')
const busboy = require('../')
const path = require('path')
const fs = require('fs')
const formstream = require('formstream')

describe('await-busboy', () => {
  it('should work without autoFields', async () => {
    const parts = busboy(request())

    let part
    let fields = 0
    let streams = 0

    while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
      if (part.length) {
        assert.equal(part.length, 4)
        fields++
      } else {
        streams++
        part.resume()
      }
    }

    assert.equal(fields, 6)
    assert.equal(streams, 3)
  })

  it('should work with autoFields', async () => {
    const parts = busboy(request(), {
      autoFields: true
    })

    let part
    let fields = 0
    let streams = 0

    while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
      if (part.length) {
        fields++
      } else {
        streams++
        part.resume()
      }
    }

    assert.equal(fields, 0)
    assert.equal(streams, 3)
    assert.equal(parts.fields.length, 6)
    assert.equal(Object.keys(parts.field).length, 3)
  })

  it('should work with autofields and arrays', async () => {
    const parts = busboy(request(), {
      autoFields: true
    })

    let part
    while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
      part.resume()
    }

    assert.equal(Object.keys(parts.field).length, 3)
    assert.equal(parts.field['file_name_0'].length, 3)
    assert.deepEqual(parts.field['file_name_0'], [ 'super alpha file', 'super beta file', 'super gamma file' ])
  })

  it('should work with delays', async () => {
    const parts = busboy(request(), {
      autoFields: true
    })

    let part
    let streams = 0

    while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
      streams++
      part.resume()
      await delay(10)
    }

    assert.equal(streams, 3)
  })

  it('should not overwrite prototypes', async () => {
    const parts = busboy(request(), {
      autoFields: true
    })

    let part
    while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
      if (!part.length) part.resume()
    }

    assert.equal(parts.field.hasOwnProperty, Object.prototype.hasOwnProperty)
  })

  it('should throw error when the files limit is reached', async () => {
    const parts = busboy(request(), {
      limits: {
        files: 1
      }
    })

    let part
    let error
    try {
      while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
        if (!part.length) part.resume()
      }
    } catch (e) {
      error = e
    }

    assert.equal(error.status, 413)
    assert.equal(error.code, 'Request_files_limit')
    assert.equal(error.message, 'Reach files limit')
  })

  it('should throw error when the fields limit is reached', async () => {
    const parts = busboy(request(), {
      limits: {
        fields: 1
      }
    })

    let part
    let error

    try {
      while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
        if (!part.length) part.resume()
      }
    } catch (e) {
      error = e
    }

    assert.equal(error.status, 413)
    assert.equal(error.code, 'Request_fields_limit')
    assert.equal(error.message, 'Reach fields limit')
  })

  it('should throw error when the parts limit is reached', async () => {
    const parts = busboy(request(), {
      limits: {
        parts: 1
      }
    })

    let part
    let error

    try {
      while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
        if (!part.length) part.resume()
      }
    } catch (e) {
      error = e
    }

    assert.equal(error.status, 413)
    assert.equal(error.code, 'Request_parts_limit')
    assert.equal(error.message, 'Reach parts limit')
  })

  it('should use options.checkField do csrf check', async () => {
    const parts = busboy(request(), {
      checkField: (name, value) => {
        if (name === '_csrf' && value !== 'pass') {
          return new Error('invalid csrf token')
        }
      }
    })

    let part

    try {
      while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
        if (part.length) {
          assert.equal(part.length, 4)
        } else {
          part.resume()
        }
      }
      throw new Error('should not run this')
    } catch (err) {
      assert.equal(err.message, 'invalid csrf token')
    }
  })

  it('should use options.checkFile do filename extension check', async () => {
    const parts = busboy(request(), {
      checkFile: (fieldname, filestream, filename) => {
        if (path.extname(filename) !== '.dat') {
          return new Error('invalid filename extension')
        }
      }
    })

    let part

    try {
      while ((part = await parts)) { // eslint-disable-line no-unmodified-loop-condition
        if (part.length) {
          assert.equal(part.length, 4)
        } else {
          part.resume()
        }
      }
      throw new Error('should not run this')
    } catch (err) {
      assert.equal(err.message, 'invalid filename extension')
    }
  })

  describe('checkFile()', () => {
    const logfile = path.join(__dirname, 'test.log')

    before(() => {
      fs.writeFileSync(logfile, new Buffer(1024 * 1024 * 10))
    })

    after(() => {
      fs.unlinkSync(logfile)
    })

    it('should checkFile fail', async () => {
      const form = formstream()

      form.field('foo1', 'fengmk2').field('love', 'chair1')
      form.file('file', logfile)
      form.field('foo2', 'fengmk2').field('love', 'chair2')
      form.headers = form.headers()
      form.headers['content-type'] = form.headers['Content-Type']

      const parts = busboy(form, {
        checkFile: (fieldname, fileStream, filename) => {
          const extname = filename && path.extname(filename)
          if (!extname || ['.jpg', '.png'].indexOf(extname.toLowerCase()) === -1) {
            var err = new Error('Invalid filename extension: ' + extname)
            err.status = 400
            return err
          }
        }
      })

      let part
      let fileCount = 0
      let fieldCount = 0
      let err
      while (true) {
        try {
          part = await parts
          if (!part) {
            break
          }
        } catch (e) {
          err = e
          break
        }

        if (!part.length) {
          fileCount++
          part.resume()
        } else {
          fieldCount++
        }
      }

      assert.equal(fileCount, 0)
      assert.equal(fieldCount, 4)
      assert(err)
      assert.equal(err.message, 'Invalid filename extension: .log')
    })

    it('should checkFile pass', async () => {
      const form = formstream()

      form.field('foo1', 'fengmk2').field('love', 'chair1')
      form.file('file', logfile)
      form.field('foo2', 'fengmk2').field('love', 'chair2')
      form.headers = form.headers()
      form.headers['content-type'] = form.headers['Content-Type']

      const parts = busboy(form, {
        checkFile: (fieldname, fileStream, filename) => {
          const extname = filename && path.extname(filename)
          if (!extname || ['.jpg', '.png', '.log'].indexOf(extname.toLowerCase()) === -1) {
            const err = new Error('Invalid filename extension: ' + extname)
            err.status = 400
            return err
          }
        }
      })

      let part
      let fileCount = 0
      let fieldCount = 0
      let err

      while (true) {
        try {
          part = await parts
          if (!part) {
            break
          }
        } catch (e) {
          err = e
          break
        }

        if (!part.length) {
          fileCount++
          part.resume()
        } else {
          fieldCount++
        }
      }

      assert.equal(fileCount, 1)
      assert.equal(fieldCount, 4)
      assert(!err)
    })
  })
})

function delay (ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), ms)
  })
}

function request () {
  // https://github.com/mscdex/busboy/blob/master/test/test-types-multipart.js

  const stream = new Stream.PassThrough()

  stream.headers = {
    'content-type': 'multipart/form-data; boundary=---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k'
  }

  stream.end([
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="file_name_0"',
    '',
    'super alpha file',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="file_name_0"',
    '',
    'super beta file',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="file_name_0"',
    '',
    'super gamma file',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="file_name_1"',
    '',
    'super gamma file',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="_csrf"',
    '',
    'ooxx',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="hasOwnProperty"',
    '',
    'super bad file',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="upload_file_0"; filename="1k_a.dat"',
    'Content-Type: application/octet-stream',
    '',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="upload_file_1"; filename="1k_b.dat"',
    'Content-Type: application/octet-stream',
    '',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    'Content-Disposition: form-data; name="upload_file_2"; filename="hack.exe"',
    'Content-Type: application/octet-stream',
    '',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
  ].join('\r\n'))

  return stream
}
