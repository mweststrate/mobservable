/**
 * @type {typeof import("./../../../src/v5/mobx")}
 */
const mobx = require("../../../src/mobx.ts")
const reaction = mobx.reaction
const utils = require("../../v5/utils/test-utils")

test("basic", () => {
    const a = mobx.observable.box(1)
    const values = []

    const d = reaction(
        () => a.get(),
        (newValue, oldValue) => {
            values.push([newValue, oldValue])
        }
    )

    a.set(2)
    a.set(3)
    d()
    a.set(4)

    expect(values).toEqual([
        [2, 1],
        [3, 2]
    ])
})

test("effect fireImmediately is honored", () => {
    const a = mobx.observable.box(1)
    const values = []

    const d = reaction(
        () => a.get(),
        newValue => {
            values.push(newValue)
        },
        { fireImmediately: true }
    )

    a.set(2)
    a.set(3)
    d()
    a.set(4)

    expect(values).toEqual([1, 2, 3])
})

test("effect is untracked", () => {
    const a = mobx.observable.box(1)
    const b = mobx.observable.box(2)
    const values = []

    const d = reaction(
        () => a.get(),
        newValue => {
            values.push(newValue * b.get())
        },
        { fireImmediately: true }
    )

    a.set(2)
    b.set(7) // shoudn't trigger a new change
    a.set(3)
    d()
    a.set(4)

    expect(values).toEqual([2, 4, 21])
})

let TIME_AMPLIFIER = 1
if (process.env.CI === "true") {
    console.log("Amplifying time")
    jest.setTimeout(50 * 1000)
    TIME_AMPLIFIER = 10
}

test("effect debounce is honored", () => {
    expect.assertions(2)

    return new Promise((resolve, reject) => {
        const a = mobx.observable.box(1)
        const values = []
        let exprCount = 0

        const d = reaction(
            () => {
                exprCount++
                return a.get()
            },
            newValue => {
                values.push(newValue)
            },
            {
                delay: 150 * TIME_AMPLIFIER,
                fireImmediately: false
            }
        )

        setTimeout(() => a.set(2), 40 * TIME_AMPLIFIER)
        setTimeout(() => {
            a.set(3) // should not be visible, combined with the next
            setImmediate(() => {
                a.set(4)
            })
        }, 300 * TIME_AMPLIFIER)
        setTimeout(() => a.set(5), 600 * TIME_AMPLIFIER)
        setTimeout(() => {
            d()
            a.set(6)
        }, 1000 * TIME_AMPLIFIER)

        setTimeout(() => {
            try {
                expect(values).toEqual([2, 4, 5])
                expect(exprCount).toBe(4)
                resolve()
            } catch (e) {
                reject(e)
            }
        }, 1200 * TIME_AMPLIFIER)
    })
})

test("effect debounce + fire immediately is honored", () => {
    expect.assertions(2)
    return new Promise((resolve, reject) => {
        const a = mobx.observable.box(1)
        const values = []
        let exprCount = 0

        const d = reaction(
            () => {
                exprCount++
                return a.get()
            },
            newValue => {
                values.push(newValue)
            },
            {
                fireImmediately: true,
                delay: 100 * TIME_AMPLIFIER
            }
        )

        setTimeout(() => a.set(3), 150 * TIME_AMPLIFIER)
        setTimeout(() => a.set(4), 300 * TIME_AMPLIFIER)

        setTimeout(() => {
            try {
                d()
                expect(values).toEqual([1, 3, 4])
                expect(exprCount).toBe(3)
                resolve()
            } catch (e) {
                reject(e)
            }
        }, 500 * TIME_AMPLIFIER)
    })
})

test("passes Reaction as an argument to expression function", () => {
    const a = mobx.observable.box(1)
    const values = []

    reaction(
        r => {
            if (a.get() === "pleaseDispose") r.dispose()
            return a.get()
        },
        newValue => {
            values.push(newValue)
        },
        { fireImmediately: true }
    )

    a.set(2)
    a.set(2)
    a.set("pleaseDispose")
    a.set(3)
    a.set(4)

    expect(values).toEqual([1, 2, "pleaseDispose"])
})

test("passes Reaction as an argument to effect function", () => {
    const a = mobx.observable.box(1)
    const values = []

    reaction(
        () => a.get(),
        (newValue, _oldValue, r) => {
            if (a.get() === "pleaseDispose") r.dispose()
            values.push(newValue)
        },
        { fireImmediately: true }
    )

    a.set(2)
    a.set(2)
    a.set("pleaseDispose")
    a.set(3)
    a.set(4)

    expect(values).toEqual([1, 2, "pleaseDispose"])
})

test("can dispose reaction on first run", () => {
    const a = mobx.observable.box(1)

    const valuesExpr1st = []
    reaction(
        () => a.get(),
        (newValue, oldValue, r) => {
            r.dispose()
            valuesExpr1st.push([newValue, oldValue])
        },
        { fireImmediately: true }
    )

    const valuesEffect1st = []
    reaction(
        r => {
            r.dispose()
            return a.get()
        },
        (newValue, oldValue) => {
            valuesEffect1st.push([newValue, oldValue])
        },
        { fireImmediately: true }
    )

    const valuesExpr = []
    reaction(
        () => a.get(),
        (newValue, oldValue, r) => {
            r.dispose()
            valuesExpr.push([newValue, oldValue])
        }
    )

    const valuesEffect = []
    reaction(
        r => {
            r.dispose()
            return a.get()
        },
        (newValue, oldValue) => {
            valuesEffect.push([newValue, oldValue])
        }
    )

    a.set(2)
    a.set(3)

    expect(valuesExpr1st).toEqual([[1, undefined]])
    expect(valuesEffect1st).toEqual([[1, undefined]])
    expect(valuesExpr).toEqual([[2, 1]])
    expect(valuesEffect).toEqual([])
})

test("can dispose reaction with AbortSignal", () => {
    const a = mobx.observable.box(1)
    const ac = new AbortController()
    const values = []

    reaction(
        () => a.get(),
        (newValue, oldValue) => {
            values.push([newValue, oldValue])
        },
        { signal: ac.signal }
    )

    a.set(2)
    a.set(3)
    ac.abort()
    a.set(4)

    expect(values).toEqual([
        [2, 1],
        [3, 2]
    ])
})

test("fireImmediately should not be honored when passed already aborted AbortSignal", () => {
    const a = mobx.observable.box(1)
    const ac = new AbortController()
    const values = []

    ac.abort()

    reaction(
        () => a.get(),
        newValue => {
            values.push(newValue)
        },
        { signal: ac.signal, fireImmediately: true }
    )

    expect(values).toEqual([])
})

test("#278 do not rerun if expr output doesn't change", () => {
    const a = mobx.observable.box(1)
    const values = []

    const d = reaction(
        () => (a.get() < 10 ? a.get() : 11),
        newValue => {
            values.push(newValue)
        }
    )

    a.set(2)
    a.set(3)
    a.set(10)
    a.set(11)
    a.set(12)
    a.set(4)
    a.set(5)
    a.set(13)

    d()
    a.set(4)

    expect(values).toEqual([2, 3, 11, 4, 5, 11])
})

test("#278 do not rerun if expr output doesn't change structurally", () => {
    const users = mobx.observable([
        {
            name: "jan",
            get uppername() {
                return this.name.toUpperCase()
            }
        },
        {
            name: "piet",
            get uppername() {
                return this.name.toUpperCase()
            }
        }
    ])
    const values = []

    const d = reaction(
        () => users.map(user => user.uppername),
        newValue => {
            values.push(newValue)
        },
        {
            fireImmediately: true,
            compareStructural: true
        }
    )

    users[0].name = "john"
    users[0].name = "JoHn"
    users[0].name = "jOHN"
    users[1].name = "johan"

    d()
    users[1].name = "w00t"

    expect(values).toEqual([
        ["JAN", "PIET"],
        ["JOHN", "PIET"],
        ["JOHN", "JOHAN"]
    ])
})

test("do not rerun if prev & next expr output is NaN", () => {
    const v = mobx.observable.box("a")
    const values = []
    const valuesS = []

    const d = reaction(
        () => v.get(),
        newValue => {
            values.push(String(newValue))
        },
        { fireImmediately: true }
    )
    const dd = reaction(
        () => v.get(),
        newValue => {
            valuesS.push(String(newValue))
        },
        { fireImmediately: true, compareStructural: true }
    )

    v.set(NaN)
    v.set(NaN)
    v.set(NaN)
    v.set("b")

    d()
    dd()

    expect(values).toEqual(["a", "NaN", "b"])
    expect(valuesS).toEqual(["a", "NaN", "b"])
})

test("reaction uses equals", () => {
    const o = mobx.observable.box("a")
    const values = []
    const disposeReaction = mobx.reaction(
        () => o.get(),
        value => values.push(value.toLowerCase()),
        { equals: (from, to) => from.toUpperCase() === to.toUpperCase(), fireImmediately: true }
    )
    expect(values).toEqual(["a"])
    o.set("A")
    expect(values).toEqual(["a"])
    o.set("B")
    expect(values).toEqual(["a", "b"])
    o.set("A")
    expect(values).toEqual(["a", "b", "a"])

    disposeReaction()
})

test("reaction equals function only invoked when necessary", () => {
    utils.supressConsole(() => {
        const comparisons = []
        const loggingComparer = (from, to) => {
            comparisons.push({ from, to })
            return from === to
        }

        const left = mobx.observable.box("A")
        const right = mobx.observable.box("B")

        const values = []
        const disposeReaction = mobx.reaction(
            // Note: exceptions thrown here are intentional!
            () => left.get().toLowerCase() + right.get().toLowerCase(),
            value => values.push(value),
            { equals: loggingComparer, fireImmediately: true }
        )

        // No comparison should be made on the first value
        expect(comparisons).toEqual([])

        // First change will cause a comparison
        left.set("C")
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Exception in the reaction expression won't cause a comparison
        left.set(null)
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Another exception in the reaction expression won't cause a comparison
        right.set(null)
        expect(comparisons).toEqual([{ from: "ab", to: "cb" }])

        // Transition from exception in the expression will cause a comparison with the last valid value
        left.set("D")
        right.set("E")
        expect(comparisons).toEqual([
            { from: "ab", to: "cb" },
            { from: "cb", to: "de" }
        ])

        // Another value change will cause a comparison
        right.set("F")
        expect(comparisons).toEqual([
            { from: "ab", to: "cb" },
            { from: "cb", to: "de" },
            { from: "de", to: "df" }
        ])

        expect(values).toEqual(["ab", "cb", "de", "df"])

        disposeReaction()
    })
})

test("issue #1148", () => {
    const a = mobx.observable.box(1)
    let called = 0
    const dispose = reaction(
        () => a.get(),
        () => {
            called++
        },
        { delay: 1 }
    )
    a.set(2)
    dispose()
    expect(called).toBe(0)
})

test("Introduce custom onError for - autorun - 1", () => {
    let error = ""
    let globalHandlerCalled = false
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    expect(() => {
        mobx.autorun(
            () => {
                throw "OOPS"
            },
            {
                onError(e) {
                    error = e
                }
            }
        )
    }).not.toThrow()
    expect(error).toBe("OOPS")
    expect(globalHandlerCalled).toBe(false)
    d()
})

test("Introduce custom onError for - autorun - 2", done => {
    let globalHandlerCalled = false
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    expect(() => {
        mobx.autorun(
            () => {
                throw "OOPS"
            },
            {
                delay: 5,
                onError(error) {
                    setImmediate(() => {
                        expect(error).toBe("OOPS")
                        expect(globalHandlerCalled).toBe(false)
                        d()
                        done()
                    })
                }
            }
        )
    }).not.toThrow()
})

test("Introduce custom onError for - reaction - 1", () => {
    let error = ""
    let globalHandlerCalled = false
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    expect(() => {
        mobx.reaction(
            () => {
                throw "OOPS"
            },
            () => {},
            {
                onError(e) {
                    error = e
                }
            }
        )
    }).not.toThrow()
    expect(error).toBe("OOPS")
    expect(globalHandlerCalled).toBe(false)
    d()
})

test("Introduce custom onError for - reaction - 2", () => {
    let error = ""
    let globalHandlerCalled = false
    let box = mobx.observable.box(1)
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    mobx.reaction(
        () => box.get(),
        () => {
            throw "OOPS"
        },
        {
            onError(e) {
                error = e
            }
        }
    )
    expect(() => {
        box.set(2)
    }).not.toThrow()
    expect(error).toBe("OOPS")
    expect(globalHandlerCalled).toBe(false)
    d()
})

test("Introduce custom onError for - reaction - 3", done => {
    let globalHandlerCalled = false
    let box = mobx.observable.box(1)
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    mobx.reaction(
        () => box.get(),
        () => {
            throw "OOPS"
        },
        {
            delay: 5,
            onError(e) {
                expect(e).toBe("OOPS")
                setImmediate(() => {
                    expect(globalHandlerCalled).toBe(false)
                    d()
                    done()
                })
            }
        }
    )
    expect(() => {
        box.set(2)
    }).not.toThrow()
})

test("Introduce custom onError for - when - 1", () => {
    let error = ""
    let globalHandlerCalled = false
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    expect(() => {
        mobx.when(
            () => {
                throw "OOPS"
            },
            () => {},
            {
                onError(e) {
                    error = e
                }
            }
        )
    }).not.toThrow()
    expect(error).toBe("OOPS")
    expect(globalHandlerCalled).toBe(false)
    d()
})

test("Introduce custom onError for - when - 2", () => {
    let error = ""
    let globalHandlerCalled = false
    let box = mobx.observable.box(1)
    const d = mobx.onReactionError(() => {
        globalHandlerCalled = true
    })
    mobx.when(
        () => box.get() === 2,
        () => {
            throw "OOPS"
        },
        {
            onError(e) {
                error = e
            }
        }
    )
    expect(() => {
        box.set(2)
    }).not.toThrow()
    expect(error).toBe("OOPS")
    expect(globalHandlerCalled).toBe(false)
    d()
})

describe("reaction opts requiresObservable", () => {
    test("warn when no observable", () => {
        utils.consoleWarn(() => {
            const disposer = mobx.reaction(
                () => 2,
                () => 1,
                {
                    requiresObservable: true
                }
            )

            disposer()
        }, /is created\/updated without reading any observable value/)
    })

    test("Don't warn when observable", () => {
        const obsr = mobx.observable({
            x: 1
        })

        const messages = utils.supressConsole(() => {
            const disposer = mobx.reaction(
                () => obsr.x,
                () => 1,
                {
                    requiresObservable: true
                }
            )

            disposer()
        })

        expect(messages.length).toBe(0)
    })
})
