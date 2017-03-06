/* global it, describe */
'use strict'

const vm = require('vm')
const assert = require('assert')
const Result = require('../result')

let inspectPromise = (p) => {
  const Debug = vm.runInDebugContext('Debug')
  const mirror = Debug.MakeMirror(p, true)
  return mirror.status()
}

describe('Result', function () {
  it('is a constructor', function (done) {
    assert.equal('function', typeof Result)
    done()
  })

  it('initializes correctly', function (done) {
    const inst = new Result()
    assert(Array.isArray(inst._pendingPromises))
    assert(Array.isArray(inst._pendingVals))
    assert.equal(inst._pendingPromises.length, 0)
    assert.equal(inst._pendingVals.length, 0)
    assert(!inst.isClosed)
    assert(!inst.hasValues)
    done()
  })

  describe('instance', function () {
    describe('#add()', function () {
      describe('value to empty Result', function () {
        it('buffers the value', function (done) {
          const res = new Result()
          const val = {}
          res.add(val)
          assert.equal(res._pendingVals.length, 1)
          assert.strictEqual(res._pendingVals[0], val)
          done()
        })
      })

      describe('value to Result with pending values', function () {
        it('buffers the value', function (done) {
          const res = new Result()
          const valA = {}
          const valB = {}
          res.add(valA)
          res.add(valB)
          assert.equal(res._pendingVals.length, 2)
          assert.strictEqual(res._pendingVals[1], valB)
          assert.strictEqual(res._pendingVals[0], valA)
          done()
        })
      })

      describe('Error to empty Result', function () {
        it('buffers the value', function (done) {
          const res = new Result()
          const val = new Error('fail')
          res.add(val)
          assert.equal(res._pendingVals.length, 1)
          assert.strictEqual(res._pendingVals[0], val)
          done()
        })
      })

      describe('Error to Result with pending values', function () {
        it('buffers the value', function (done) {
          const res = new Result()
          const valA = {}
          const valB = new Error('fail')
          res.add(valA)
          res.add(valB)
          assert.equal(res._pendingVals.length, 2)
          assert.strictEqual(res._pendingVals[1], valB)
          assert.strictEqual(res._pendingVals[0], valA)
          done()
        })
      })
    })

    describe('#then()', function () {
      describe('called on empty Result', function () {
        it('returns Promise that resolves w/ first added val when val is non-Error',
        function (done) {
          const res = new Result()
          const val = 108
          let ranInOrder = false

          const p = res.then((res) => {
            assert(ranInOrder)
            assert.equal(res, val)
            done()
          }).catch(done)

          assert(p instanceof Promise)
          const status = inspectPromise(p)
          assert.equal('pending', status)

          setTimeout(() => {
            ranInOrder = true
            res.add(val)
          }, 80)
        })

        it(`returns Promise that rejects w/ first added val when val is an Error`,
        function (done) {
          const res = new Result()
          const errMsg = 'boom'

          res.then(() => {
            throw new Error('should not get here')
          }).catch(err => {
            assert.equal(err.message, errMsg)
            done()
          }).catch(done)

          res.add(new TypeError(errMsg))
        })

        describe('and result is close()d with a non-Error', () => {
          it('returns Promise that resolves w/ the value passed to .close()',
          function (done) {
            const res = new Result()
            const val = 'Dr Ford'

            res.then((res) => {
              assert.strictEqual(res, val)
              done()
            }).catch(done)

            res.close(val)
          })
        })

        describe('and result is close()d with an Error', () => {
          it('returns Promise that rejects w/ the Error passed to .close()',
          function (done) {
            const res = new Result()
            const val = new TypeError('Lawrence')

            res.then(() => {
              done(new Error('should not resolved'))
            }).catch(err => {
              assert.strictEqual(err, val)
              done()
            }).catch(done)

            res.close(val)
          })
        })
      })

      describe('called > once on empty Result before .add() is called', function () {
        it('returns Promises that resolve w/ first added val when val is non-Error',
        function (done) {
          const res = new Result()
          let p1Ran = false
          let p2Ran = false
          let timer = null

          function complete () {
            if (p1Ran && p2Ran) {
              clearTimeout(timer)
              return done()
            }
          }

          res.then((msg) => {
            assert.equal('hello', msg)
            p1Ran = true
            complete()
          }).catch(done)

          res.then((msg) => {
            assert.equal('hello', msg)
            p2Ran = true
            complete()
          }).catch(done)

          timer = setTimeout(() => {
            if (!p1Ran) return done(new Error('p1 did not run'))
            if (!p2Ran) return done(new Error('p2 did not run'))
          }, 200)

          setImmediate(() => {
            res.add('hello')
            res.add('https://www.wired.com/2016/09/elon-musk-colonize-mars/')
          })
        })

        it(`returns Promises that reject w/ first added val when val is an Error`,
        function (done) {
          const res = new Result()
          let p1Ran = false
          let p2Ran = false
          let timer = null

          function complete () {
            if (p1Ran && p2Ran) {
              clearTimeout(timer)
              return done()
            }
          }

          res.then(() => {}, (err) => {
            assert.equal('kaboom', err.message)
            p1Ran = true
            complete()
          })

          res.then(() => {}, (err) => {
            assert.equal('kaboom', err.message)
            p2Ran = true
            complete()
          })

          timer = setTimeout(() => {
            if (!p1Ran) return done(new Error('p1 did not run'))
            if (!p2Ran) return done(new Error('p2 did not run'))
          }, 200)

          setImmediate(() => {
            res.add(new Error('kaboom'))
            res.add(new Error('nope'))
          })
        })
      })

      describe('called on Result with pending non-Error values', function () {
        it('returns a Promise resolved to the first single value in FIFO',
        function (done) {
          const res = new Result()
          res.add('one')
          res.add('two')

          res.then(test1).catch(done)
          res.then(test2).catch(done)

          function test1 (val) {
            assert.equal('one', val)
          }

          function test2 (val) {
            assert.equal('two', val)

            const p3 = res.then(test3).catch(done)

            setTimeout(() => {
              const status = inspectPromise(p3)
              assert.equal('pending', status)
              res.add(47)
            }, 80)
          }

          function test3 (val) {
            assert.equal(47, val)
            res.add(undefined)
            res.then(test4).catch(done)
          }

          function test4 (val) {
            assert.equal(undefined, val)
            done()
          }
        })
      })

      describe('called on Result where next pending value is an Error', function () {
        it('returns a rejected Promise with the Error', function (done) {
          const res = new Result()
          res.add(new Error('guests'))
          res.add('nope')

          res.then(() => {
            done(new Error('should not reach this'))
          }, (err) => {
            assert.equal(err.message, 'guests')
            done()
          }).catch(done)
        })
      })

      describe('called when Result has an Error queued for later', function () {
        it(`returns resolved Promises for all queued non-Error vals,
          and rejected Promises for Errors (FIFO)`, function (done) {
          const res = new Result()
          const vals = [4, 8, 15, 16, 23, 42]

          vals.forEach((v) => res.add(v))
          res.add(new Error('aww'))
          res.add(108)

          let count = vals.length + 2

          vals.forEach((v, i) => {
            res.then((val) => {
              assert.equal(v, val)
              count--
            }).catch(done)
          })

          res.then(() => {
            throw new Error('should not reach this')
          }).catch((_) => {
            count--
            res.then((val) => {
              count--
              assert.equal(108, val)
              assert.strictEqual(count, 0)
              done()
            }).catch(done)
          })
        })
      })
    })
  })
})
