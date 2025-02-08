"use strict"

import {
    observe,
    computed,
    observable,
    autorun,
    extendObservable,
    action,
    IObservableArray,
    IArrayWillChange,
    IArrayWillSplice,
    IObservableValue,
    isObservable,
    isObservableProp,
    isObservableObject,
    transaction,
    IObjectDidChange,
    spy,
    configure,
    isAction,
    IAtom,
    createAtom,
    runInAction,
    makeObservable,
    flow,
    flowResult
} from "../../../src/mobx"
import * as mobx from "../../../src/mobx"

const testFunction = function (a: any) {}

// lazy wrapper around yest

const t = {
    equal(a: any, b: any) {
        expect(a).toBe(b)
    },
    deepEqual(a: any, b: any) {
        expect(a).toEqual(b)
    },
    notEqual(a: any, b: any) {
        expect(a).not.toEqual(b)
    },

    throws(a: any, b: any) {
        expect(a).toThrow(b)
    }
}

test("decorators", () => {
    class Order {
        @observable price: number = 3
        @observable amount: number = 2
        @observable orders: string[] = []
        @observable aFunction = testFunction

        @computed
        get total() {
            return this.amount * this.price * (1 + this.orders.length)
        }

        constructor() {
            makeObservable(this)
        }

        @flow
        *testDouble(n: number): Generator<number, number> {
            yield 3
            return n * 2
        }

        async run() {
            const x: number = await flowResult(this.testDouble(2))
        }
    }

    const o = new Order()
    t.equal(isObservableObject(o), true)
    t.equal(isObservableProp(o, "amount"), true)
    t.equal(isObservableProp(o, "total"), true)

    const events: any[] = []
    const d1 = observe(o, (ev: IObjectDidChange) => events.push(ev.name, (ev as any).oldValue))
    const d2 = observe(o, "price", ev => events.push(ev.newValue, ev.oldValue))
    const d3 = observe(o, "total", ev => events.push(ev.newValue, ev.oldValue))

    o.price = 4

    d1()
    d2()
    d3()

    o.price = 5

    t.deepEqual(events, [
        8, // new total
        6, // old total
        4, // new price
        3, // old price
        "price", // event name
        3 // event oldValue
    ])
})

test("annotations", () => {
    const fn0 = () => 0
    class Order {
        @observable price: number = 3
        @observable amount: number = 2
        @observable orders: string[] = []
        @observable aFunction = fn0

        @computed
        get total() {
            return this.amount * this.price * (1 + this.orders.length)
        }

        constructor() {
            makeObservable(this)
        }
    }

    const order1totals: number[] = []
    const order1 = new Order()
    const order2 = new Order()

    const disposer = autorun(() => {
        order1totals.push(order1.total)
    })

    order2.price = 4
    order1.amount = 1

    t.equal(order1.price, 3)
    t.equal(order1.total, 3)
    t.equal(order2.total, 8)
    order2.orders.push("bla")
    t.equal(order2.total, 16)

    order1.orders.splice(0, 0, "boe", "hoi")
    t.deepEqual(order1totals, [6, 3, 9])

    disposer()
    order1.orders.pop()
    t.equal(order1.total, 6)
    t.deepEqual(order1totals, [6, 3, 9])
    expect(isAction(order1.aFunction)).toBe(true)
    expect(order1.aFunction()).toBe(0)
    order1.aFunction = () => 1
    expect(isAction(order1.aFunction)).toBe(true)
    expect(order1.aFunction()).toBe(1)
})

test("box", () => {
    class Box {
        @observable uninitialized: any
        @observable height = 20
        @observable sizes = [2]
        @observable
        someFunc = function () {
            return 2
        }
        @computed
        get width() {
            return this.height * this.sizes.length * this.someFunc() * (this.uninitialized ? 2 : 1)
        }
        @action("test")
        addSize() {
            this.sizes.push(3)
            this.sizes.push(4)
        }

        constructor() {
            makeObservable(this)
        }
    }

    const box = new Box()

    const ar: number[] = []

    autorun(() => {
        ar.push(box.width)
    })

    t.deepEqual(ar.slice(), [40])
    box.height = 10
    t.deepEqual(ar.slice(), [40, 20])
    box.sizes.push(3, 4)
    t.deepEqual(ar.slice(), [40, 20, 60])
    box.someFunc = () => 7
    t.deepEqual(ar.slice(), [40, 20, 60, 210])
    box.uninitialized = true
    t.deepEqual(ar.slice(), [40, 20, 60, 210, 420])
    box.addSize()
    expect(ar.slice()).toEqual([40, 20, 60, 210, 420, 700])
})

test("computed setter should succeed", () => {
    class Bla {
        @observable a = 3
        @computed
        get propX() {
            return this.a * 2
        }
        set propX(v) {
            this.a = v
        }

        constructor() {
            makeObservable(this)
        }
    }

    const b = new Bla()
    t.equal(b.propX, 6)
    b.propX = 4
    t.equal(b.propX, 8)
})

test("@computed.shallow (TS)", () => {
    class TestClass {
        @observable.struct x = { a: 3 }
        @observable.struct y = { b: 4 }
        @computed.shallow
        get array() {
            return [this.x, this.y]
        }
        constructor() {
            makeObservable(this)
        }
    }

    const t1 = new TestClass()
    const changes: string[] = []
    const d = autorun(() => changes.push(JSON.stringify(t1.array)))

    t1.x = { a: 5 } // change
    t.equal(changes.length, 2)
    t1.x.a = 6 // no change
    t.equal(changes.length, 2)
    d()

    t.deepEqual(changes, ['[{"a":3},{"b":4}]', '[{"a":5},{"b":4}]'])
})

test("@computed.struct (TS)", () => {
    class TestClass {
        @observable x = 3
        @observable y = 3
        @computed.struct
        get boxedSum() {
            return { sum: Math.round(this.x) + Math.round(this.y) }
        }
        constructor() {
            makeObservable(this)
        }
    }

    const t1 = new TestClass()
    const changes: { sum: number }[] = []
    const d = autorun(() => changes.push(t1.boxedSum))

    t1.y = 4 // change
    t.equal(changes.length, 2)
    t1.y = 4.2 // no change
    t.equal(changes.length, 2)
    transaction(() => {
        t1.y = 3
        t1.x = 4
    }) // no change
    t.equal(changes.length, 2)
    t1.x = 6 // change
    t.equal(changes.length, 3)
    d()

    t.deepEqual(changes, [{ sum: 6 }, { sum: 7 }, { sum: 9 }])
})

test("issue 165", () => {
    function report<T>(msg: string, value: T) {
        // console.log(msg, ":", value)
        return value
    }

    class Card {
        constructor(public game: Game, public id: number) {
            makeObservable(this)
        }

        @computed
        get isWrong() {
            return report(
                "Computing isWrong for card " + this.id,
                this.isSelected && this.game.isMatchWrong
            )
        }

        @computed
        get isSelected() {
            return report(
                "Computing isSelected for card" + this.id,
                this.game.firstCardSelected === this || this.game.secondCardSelected === this
            )
        }
    }

    class Game {
        @observable firstCardSelected: Card | null = null
        @observable secondCardSelected: Card | null = null

        @computed
        get isMatchWrong() {
            return report(
                "Computing isMatchWrong",
                this.secondCardSelected !== null &&
                    this.firstCardSelected!.id !== this.secondCardSelected.id
            )
        }

        constructor() {
            makeObservable(this)
        }
    }

    let game = new Game()
    let card1 = new Card(game, 1),
        card2 = new Card(game, 2)

    autorun(() => {
        card1.isWrong
        card2.isWrong
        // console.log("card1.isWrong =", card1.isWrong)
        // console.log("card2.isWrong =", card2.isWrong)
        // console.log("------------------------------")
    })

    // console.log("Selecting first card")
    game.firstCardSelected = card1
    // console.log("Selecting second card")
    game.secondCardSelected = card2

    t.equal(card1.isWrong, true)
    t.equal(card2.isWrong, true)
})

test("issue 191 - shared initializers (ts)", () => {
    class Test {
        @observable obj = { a: 1 }
        @observable array = [2]
        constructor() {
            makeObservable(this)
        }
    }

    const t1 = new Test()
    t1.obj.a = 2
    t1.array.push(3)

    const t2 = new Test()
    t2.obj.a = 3
    t2.array.push(4)

    t.notEqual(t1.obj, t2.obj)
    t.notEqual(t1.array, t2.array)
    t.equal(t1.obj.a, 2)
    t.equal(t2.obj.a, 3)

    t.deepEqual(t1.array.slice(), [2, 3])
    t.deepEqual(t2.array.slice(), [2, 4])
})

function normalizeSpyEvents(events: any[]) {
    events.forEach(ev => {
        delete ev.fn
        delete ev.time
    })
    return events
}

test("action decorator (typescript)", () => {
    class Store {
        constructor(private multiplier: number) {
            makeObservable(this)
        }

        @action
        add(a: number, b: number): number {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(3)
    const events: any[] = []
    const d = spy(events.push.bind(events))
    t.equal(store1.add(3, 4), 14)
    t.equal(store2.add(2, 2), 12)
    t.equal(store1.add(1, 1), 4)

    t.deepEqual(normalizeSpyEvents(events), [
        { arguments: [3, 4], name: "add", spyReportStart: true, object: store1, type: "action" },
        { type: "report-end", spyReportEnd: true },
        { arguments: [2, 2], name: "add", spyReportStart: true, object: store2, type: "action" },
        { type: "report-end", spyReportEnd: true },
        { arguments: [1, 1], name: "add", spyReportStart: true, object: store1, type: "action" },
        { type: "report-end", spyReportEnd: true }
    ])

    d()
})

test("custom action decorator (typescript)", () => {
    class Store {
        constructor(private multiplier: number) {
            makeObservable(this)
        }

        @action("zoem zoem")
        add(a: number, b: number): number {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(3)
    const events: any[] = []
    const d = spy(events.push.bind(events))
    t.equal(store1.add(3, 4), 14)
    t.equal(store2.add(2, 2), 12)
    t.equal(store1.add(1, 1), 4)

    t.deepEqual(normalizeSpyEvents(events), [
        {
            arguments: [3, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true },
        {
            arguments: [2, 2],
            name: "zoem zoem",
            spyReportStart: true,
            object: store2,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true },
        {
            arguments: [1, 1],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true }
    ])

    d()
})

test("action decorator on field (typescript)", () => {
    class Store {
        constructor(private multiplier: number) {
            makeObservable(this)
        }

        @action
        add = (a: number, b: number) => {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(7)
    expect(store1.add).not.toEqual(store2.add)

    const events: any[] = []
    const d = spy(events.push.bind(events))
    t.equal(store1.add(3, 4), 14)
    t.equal(store2.add(4, 5), 63)
    t.equal(store1.add(2, 2), 8)

    t.deepEqual(normalizeSpyEvents(events), [
        { arguments: [3, 4], name: "add", spyReportStart: true, object: store1, type: "action" },
        { type: "report-end", spyReportEnd: true },
        { arguments: [4, 5], name: "add", spyReportStart: true, object: store2, type: "action" },
        { type: "report-end", spyReportEnd: true },
        { arguments: [2, 2], name: "add", spyReportStart: true, object: store1, type: "action" },
        { type: "report-end", spyReportEnd: true }
    ])

    d()
})

test("custom action decorator on field (typescript)", () => {
    class Store {
        constructor(private multiplier: number) {
            makeObservable(this)
        }

        @action("zoem zoem")
        add = (a: number, b: number) => {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(7)

    const events: any[] = []
    const d = spy(events.push.bind(events))
    t.equal(store1.add(3, 4), 14)
    t.equal(store2.add(4, 5), 63)
    t.equal(store1.add(2, 2), 8)

    t.deepEqual(normalizeSpyEvents(events), [
        {
            arguments: [3, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true },
        {
            arguments: [4, 5],
            name: "zoem zoem",
            spyReportStart: true,
            object: store2,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true },
        {
            arguments: [2, 2],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { type: "report-end", spyReportEnd: true }
    ])

    d()
})

test("267 (typescript) should be possible to declare properties observable outside strict mode", () => {
    configure({ enforceActions: "observed" })

    class Store {
        @observable timer: number | null = null

        constructor() {
            makeObservable(this)
        }
    }

    configure({ enforceActions: "never" })
})

test("288 atom not detected for object property", () => {
    class Store {
        @observable foo = ""

        constructor() {
            makeObservable(this)
        }
    }

    const store = new Store()

    mobx.observe(
        store,
        "foo",
        () => {
            // console.log("Change observed")
        },
        true
    )
})

test.skip("observable performance - ts - decorators", () => {
    const AMOUNT = 100000

    class A {
        @observable a = 1
        @observable b = 2
        @observable c = 3
        @computed
        get d() {
            return this.a + this.b + this.c
        }
        constructor() {
            makeObservable(this)
        }
    }

    const objs: any[] = []
    const start = Date.now()

    for (let i = 0; i < AMOUNT; i++) objs.push(new A())

    console.log("created in ", Date.now() - start)

    for (let j = 0; j < 4; j++) {
        for (let i = 0; i < AMOUNT; i++) {
            const obj = objs[i]
            obj.a += 3
            obj.b *= 4
            obj.c = obj.b - obj.a
            obj.d
        }
    }

    console.log("changed in ", Date.now() - start)
})

test("unbound methods", () => {
    class A {
        // shared across all instances
        @action
        m1() {}

        // per instance
        @action m2 = () => {}
        constructor() {
            makeObservable(this)
        }
    }

    const a1 = new A()
    const a2 = new A()

    t.equal(a1.m1, a2.m1)
    t.notEqual(a1.m2, a2.m2)
    t.equal(Object.hasOwnProperty.call(a1, "m1"), false)
    t.equal(Object.hasOwnProperty.call(a1, "m2"), true)
    t.equal(Object.hasOwnProperty.call(a2, "m1"), false)
    t.equal(Object.hasOwnProperty.call(a2, "m2"), true)
})

test("inheritance", () => {
    class A {
        @observable a = 2
        constructor() {
            makeObservable(this)
        }
    }

    class B extends A {
        @observable b = 3
        @computed
        get c() {
            return this.a + this.b
        }
        constructor() {
            super()
            makeObservable(this)
        }
    }
    const b1 = new B()
    const b2 = new B()
    const values: any[] = []
    mobx.autorun(() => values.push(b1.c + b2.c))

    b1.a = 3
    b1.b = 4
    b2.b = 5
    b2.a = 6

    t.deepEqual(values, [10, 11, 12, 14, 18])
})

test("inheritance overrides observable", () => {
    class A {
        @observable a = 2
        constructor() {
            makeObservable(this)
        }
    }

    class B {
        @observable a = 5
        @observable b = 3
        @computed
        get c() {
            return this.a + this.b
        }
        constructor() {
            makeObservable(this)
        }
    }

    const b1 = new B()
    const b2 = new B()
    const values: any[] = []
    mobx.autorun(() => values.push(b1.c + b2.c))

    b1.a = 3
    b1.b = 4
    b2.b = 5
    b2.a = 6

    t.deepEqual(values, [16, 14, 15, 17, 18])
})

test("reusing initializers", () => {
    class A {
        @observable a = 3
        @observable b = this.a + 2
        @computed
        get c() {
            return this.a + this.b
        }
        @computed
        get d() {
            return this.c + 1
        }
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    const values: any[] = []
    mobx.autorun(() => values.push(a.d))

    a.a = 4
    t.deepEqual(values, [9, 10])
})

test("enumerability", () => {
    class A {
        @observable a = 1 // enumerable, on proto
        @computed
        get b() {
            return this.a
        } // non-enumerable, (and, ideally, on proto)
        @action
        m() {} // non-enumerable, on proto
        @action m2 = () => {} // non-enumerable, on self
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()

    // not initialized yet
    let ownProps = Object.keys(a)
    let props: string[] = []
    for (const key in a) props.push(key)

    t.deepEqual(ownProps, [
        "a" // yeej!
    ])

    t.deepEqual(props, [
        // also 'a' would be ok
        "a"
    ])

    t.equal("a" in a, true)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("a"), true)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("b"), true) // false would be slightly better, true also ok-ish, and, see #1777
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("m"), false)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("m2"), true)

    t.equal(mobx.isAction(a.m), true)
    t.equal(mobx.isAction(a.m2), true)

    // after initialization
    a.a
    a.b
    a.m
    a.m2

    ownProps = Object.keys(a)
    props = []
    for (const key in a) props.push(key)

    t.deepEqual(ownProps, ["a"])

    t.deepEqual(props, ["a"])

    t.equal("a" in a, true)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("a"), true)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("b"), true) // false would be slightly better, true also ok-ish, and, see #1777
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("m"), false)
    // eslint-disable-next-line
    t.equal(a.hasOwnProperty("m2"), true)
})

test("issue 285 (typescript)", () => {
    const { observable, toJS } = mobx

    class Todo {
        id = 1
        @observable title: string
        @observable finished = false
        @observable childThings = [1, 2, 3]
        constructor(title: string) {
            makeObservable(this)
            this.title = title
        }
    }

    const todo = new Todo("Something to do")

    t.deepEqual(toJS(todo), {
        id: 1,
        title: "Something to do",
        finished: false,
        childThings: [1, 2, 3]
    })
})

test("verify object assign (typescript)", () => {
    class Todo {
        @observable title = "test"
        @computed
        get upperCase() {
            return this.title.toUpperCase()
        }
        constructor() {
            makeObservable(this)
        }
    }

    t.deepEqual((Object as any).assign({}, new Todo()), {
        title: "test"
    })
})

test("379, inheritable actions (typescript)", () => {
    class A {
        @action
        method() {
            return 42
        }
        constructor() {
            makeObservable(this)
        }
    }

    class B extends A {
        method() {
            return super.method() * 2
        }
        constructor() {
            super()
            makeObservable(this)
        }
    }

    class C extends B {
        method() {
            return super.method() + 3
        }
        constructor() {
            super()
            makeObservable(this)
        }
    }

    const b = new B()
    t.equal(b.method(), 84)
    t.equal(isAction(b.method), true)

    const a = new A()
    t.equal(a.method(), 42)
    t.equal(isAction(a.method), true)

    const c = new C()
    t.equal(c.method(), 87)
    t.equal(isAction(c.method), true)
})

test("373 - fix isObservable for unused computed", () => {
    class Bla {
        @computed
        get computedVal() {
            return 3
        }
        constructor() {
            makeObservable(this)
            t.equal(isObservableProp(this, "computedVal"), true)
            this.computedVal
            t.equal(isObservableProp(this, "computedVal"), true)
        }
    }

    new Bla()
})

test("505, don't throw when accessing subclass fields in super constructor (typescript)", () => {
    const values: any = {}
    class A {
        @observable a = 1
        constructor() {
            makeObservable(this)
            values.b = (this as any)["b"]
            values.a = this.a
        }
    }

    class B extends A {
        @observable b = 2

        constructor() {
            super()
            makeObservable(this)
        }
    }

    new B()
    t.deepEqual(values, { a: 1, b: undefined }) // undefined, as A constructor runs before B constructor
})

test("705 - setter undoing caching (typescript)", () => {
    let recomputes = 0
    let autoruns = 0

    class Person {
        @observable name: string = ""
        @observable title: string = ""

        // Typescript bug: if fullName is before the getter, the property is defined twice / incorrectly, see #705
        // set fullName(val) {
        // 	// Noop
        // }
        @computed
        get fullName() {
            recomputes++
            return this.title + " " + this.name
        }
        // Should also be possible to define the setter _before_ the fullname
        set fullName(val) {
            // Noop
        }
        constructor() {
            makeObservable(this)
        }
    }

    let p1 = new Person()
    p1.name = "Tom Tank"
    p1.title = "Mr."

    t.equal(recomputes, 0)
    t.equal(autoruns, 0)

    const d1 = autorun(() => {
        autoruns++
        p1.fullName
    })

    const d2 = autorun(() => {
        autoruns++
        p1.fullName
    })

    t.equal(recomputes, 1)
    t.equal(autoruns, 2)

    p1.title = "Master"
    t.equal(recomputes, 2)
    t.equal(autoruns, 4)

    d1()
    d2()
})

test("@observable.ref (TS)", () => {
    class A {
        @observable.ref ref = { a: 3 }
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    t.equal(a.ref.a, 3)
    t.equal(mobx.isObservable(a.ref), false)
    t.equal(mobx.isObservableProp(a, "ref"), true)
})

test("@observable.shallow (TS)", () => {
    class A {
        @observable.shallow arr = [{ todo: 1 }]
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    const todo2 = { todo: 2 }
    a.arr.push(todo2)
    t.equal(mobx.isObservable(a.arr), true)
    t.equal(mobx.isObservableProp(a, "arr"), true)
    t.equal(mobx.isObservable(a.arr[0]), false)
    t.equal(mobx.isObservable(a.arr[1]), false)
    t.equal(a.arr[1] === todo2, true)
})

test("@observable.shallow - 2 (TS)", () => {
    class A {
        @observable.shallow arr: Record<string, any> = { x: { todo: 1 } }
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    const todo2 = { todo: 2 }
    a.arr.y = todo2
    t.equal(mobx.isObservable(a.arr), true)
    t.equal(mobx.isObservableProp(a, "arr"), true)
    t.equal(mobx.isObservable(a.arr.x), false)
    t.equal(mobx.isObservable(a.arr.y), false)
    t.equal(a.arr.y === todo2, true)
})

test("@observable.deep (TS)", () => {
    class A {
        @observable.deep arr = [{ todo: 1 }]
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    const todo2 = { todo: 2 }
    a.arr.push(todo2)

    t.equal(mobx.isObservable(a.arr), true)
    t.equal(mobx.isObservableProp(a, "arr"), true)
    t.equal(mobx.isObservable(a.arr[0]), true)
    t.equal(mobx.isObservable(a.arr[1]), true)
    t.equal(a.arr[1] !== todo2, true)
    t.equal(isObservable(todo2), false)
})

test("action.bound binds (TS)", () => {
    class A {
        @observable x = 0
        @action.bound
        inc(value: number) {
            this.x += value
        }
        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    const runner = a.inc
    runner(2)

    t.equal(a.x, 2)
})

test("@computed.equals (TS)", () => {
    const sameTime = (from: Time, to: Time) => from.hour === to.hour && from.minute === to.minute
    class Time {
        constructor(hour: number, minute: number) {
            makeObservable(this)
            this.hour = hour
            this.minute = minute
        }

        @observable public hour: number
        @observable public minute: number

        @computed({ equals: sameTime })
        public get time() {
            return { hour: this.hour, minute: this.minute }
        }
    }
    const time = new Time(9, 0)

    const changes: Array<{ hour: number; minute: number }> = []
    const disposeAutorun = autorun(() => changes.push(time.time))

    t.deepEqual(changes, [{ hour: 9, minute: 0 }])
    time.hour = 9
    t.deepEqual(changes, [{ hour: 9, minute: 0 }])
    time.minute = 0
    t.deepEqual(changes, [{ hour: 9, minute: 0 }])
    time.hour = 10
    t.deepEqual(changes, [
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 }
    ])
    time.minute = 30
    t.deepEqual(changes, [
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 },
        { hour: 10, minute: 30 }
    ])

    disposeAutorun()
})

test("1072 - @observable without initial value and observe before first access", () => {
    class User {
        @observable loginCount?: number

        constructor() {
            makeObservable(this)
        }
    }

    const user = new User()
    observe(user, "loginCount", () => {})
})

test("unobserved computed reads should warn with requiresReaction enabled", () => {
    const consoleWarn = console.warn
    const warnings: string[] = []
    console.warn = function (...args) {
        warnings.push(...args)
    }
    try {
        const expectedWarnings: string[] = []

        class A {
            @observable x = 0

            @computed({ requiresReaction: true })
            get y() {
                return this.x * 2
            }
            constructor() {
                makeObservable(this, undefined, { name: "a" })
            }
        }

        const a = new A()

        a.y
        expectedWarnings.push(
            `[mobx] Computed value 'a.y' is being read outside a reactive context. Doing a full recompute.`
        )

        const d = mobx.reaction(
            () => a.y,
            () => {}
        )

        a.y

        d()

        a.y
        expectedWarnings.push(
            `[mobx] Computed value 'a.y' is being read outside a reactive context. Doing a full recompute.`
        )

        expect(warnings).toEqual(expectedWarnings)
    } finally {
        console.warn = consoleWarn
    }
})

test("multiple inheritance should work", () => {
    class A {
        @observable x = 1

        constructor() {
            makeObservable(this)
        }
    }

    class B extends A {
        @observable y = 1

        constructor() {
            super()
            makeObservable(this)
        }
    }

    expect(mobx.keys(new B())).toEqual(["x", "y"])
})

// 19.12.2020 @urugator:
// All annotated non-observable fields are not writable.
// All annotated fields of non-plain objects are non-configurable.
// https://github.com/mobxjs/mobx/pull/2641
test.skip("actions are reassignable", () => {
    // See #1398 and #1545, make actions reassignable to support stubbing
    class A {
        @action
        m1() {}
        @action m2 = () => {}
        @action.bound
        m3() {}
        @action.bound m4 = () => {}

        constructor() {
            makeObservable(this)
        }
    }

    const a = new A()
    expect(isAction(a.m1)).toBe(true)
    expect(isAction(a.m2)).toBe(true)
    expect(isAction(a.m3)).toBe(true)
    expect(isAction(a.m4)).toBe(true)
    a.m1 = () => {}
    expect(isAction(a.m1)).toBe(false)
    a.m2 = () => {}
    expect(isAction(a.m2)).toBe(false)
    a.m3 = () => {}
    expect(isAction(a.m3)).toBe(false)
    a.m4 = () => {}
    expect(isAction(a.m4)).toBe(false)
})

test("it should support asyncAction as decorator (ts)", async () => {
    mobx.configure({ enforceActions: "observed" })

    class X {
        @observable a = 1

        f = mobx.flow(function* f(this: X, initial: number) {
            this.a = initial // this runs in action
            this.a += yield Promise.resolve(5) as any
            this.a = this.a * 2
            return this.a
        })

        constructor() {
            makeObservable(this)
        }
    }

    const x = new X()

    expect(await x.f(3)).toBe(16)
})

test("toJS bug #1413 (TS)", () => {
    class X {
        @observable
        test = {
            test1: 1
        }

        constructor() {
            makeObservable(this)
        }
    }

    const x = new X()
    const res = mobx.toJS(x.test) as any
    expect(res).toEqual({ test1: 1 })
    expect(res.__mobxDidRunLazyInitializers).toBe(undefined)
})

test("#2159 - computed property keys", () => {
    const testSymbol = Symbol("test symbol")
    const testString = "testString"

    class TestClass {
        @observable [testSymbol] = "original symbol value";
        @observable [testString] = "original string value"

        constructor() {
            makeObservable(this)
        }
    }

    const o = new TestClass()

    const events: any[] = []
    observe(o, testSymbol, ev => events.push(ev.newValue, ev.oldValue))
    observe(o, testString, ev => events.push(ev.newValue, ev.oldValue))

    runInAction(() => {
        o[testSymbol] = "new symbol value"
        o[testString] = "new string value"
    })

    t.deepEqual(events, [
        "new symbol value", // new symbol
        "original symbol value", // original symbol
        "new string value", // new string
        "original string value" // original string
    ])
})
