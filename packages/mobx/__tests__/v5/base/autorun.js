/**
 * @type {typeof import("./../../../src/v5/mobx")}
 */
const mobx = require("../../../src/mobx.ts")
const utils = require("../../v5/utils/test-utils")

test("autorun passes Reaction as an argument to view function", function () {
    const a = mobx.observable.box(1)
    const values = []

    mobx.autorun(r => {
        expect(typeof r.dispose).toBe("function")
        if (a.get() === "pleaseDispose") r.dispose()
        values.push(a.get())
    })

    a.set(2)
    a.set(2)
    a.set("pleaseDispose")
    a.set(3)
    a.set(4)

    expect(values).toEqual([1, 2, "pleaseDispose"])
})

test("autorun can be disposed on first run", function () {
    const a = mobx.observable.box(1)
    const values = []

    mobx.autorun(r => {
        r.dispose()
        values.push(a.get())
    })

    a.set(2)

    expect(values).toEqual([1])
})

test("autorun can be disposed using AbortSignal", function () {
    const a = mobx.observable.box(1)
    const ac = new AbortController()
    const values = []

    mobx.autorun(
        () => {
            values.push(a.get())
        },
        { signal: ac.signal }
    )

    a.set(2)
    a.set(3)
    ac.abort()
    a.set(4)

    expect(values).toEqual([1, 2, 3])
})

test("autorun should not run first time when passing already aborted AbortSignal", function () {
    const a = mobx.observable.box(1)
    const ac = new AbortController()
    const values = []

    ac.abort()

    mobx.autorun(
        () => {
            values.push(a.get())
        },
        { signal: ac.signal }
    )

    expect(values).toEqual([])
})

test("autorun warns when passed an action", function () {
    const action = mobx.action(() => {})
    expect.assertions(1)
    expect(() => mobx.autorun(action)).toThrowError(/Autorun does not accept actions/)
})

test("autorun batches automatically", function () {
    let runs = 0
    let a1runs = 0
    let a2runs = 0

    const x = mobx.observable({
        a: 1,
        b: 1,
        c: 1,
        get d() {
            runs++
            return this.c + this.b
        }
    })

    const d1 = mobx.autorun(() => {
        a1runs++
        x.d // read
    })

    const d2 = mobx.autorun(() => {
        a2runs++
        x.b = x.a
        x.c = x.a
    })

    expect(a1runs).toBe(1)
    expect(a2runs).toBe(1)
    expect(runs).toBe(1)

    x.a = 17

    expect(a1runs).toBe(2)
    expect(a2runs).toBe(2)
    expect(runs).toBe(2)

    d1()
    d2()
})

test("autorun tracks invalidation of unbound dependencies", function () {
    const a = mobx.observable.box(0)
    const b = mobx.observable.box(0)
    const c = mobx.computed(() => a.get() + b.get())
    const values = []

    mobx.autorun(() => {
        values.push(c.get())
        b.set(100)
    })

    a.set(1)
    expect(values).toEqual([0, 100, 101])
})

test("when effect is an action", function (done) {
    const a = mobx.observable.box(0)

    mobx.configure({ enforceActions: "observed" })
    mobx.when(
        () => a.get() === 1,
        () => {
            a.set(2)

            mobx.configure({ enforceActions: "never" })
            done()
        },
        { timeout: 1 }
    )

    mobx.runInAction(() => {
        a.set(1)
    })
})

describe("autorun opts requiresObservable", () => {
    test("warn when no observable", () => {
        utils.consoleWarn(() => {
            const disposer = mobx.autorun(() => 2, {
                requiresObservable: true
            })

            disposer()
        }, /is created\/updated without reading any observable value/)
    })

    test("Don't warn when observable", () => {
        const obsr = mobx.observable({
            x: 1
        })

        const messages = utils.supressConsole(() => {
            const disposer = mobx.autorun(() => obsr.x, {
                requiresObservable: true
            })

            disposer()
        })

        expect(messages.length).toBe(0)
    })
})
