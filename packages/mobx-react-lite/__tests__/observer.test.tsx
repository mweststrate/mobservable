import { act, cleanup, fireEvent, render } from "@testing-library/react"
import mockConsole from "jest-mock-console"
import * as mobx from "mobx"
import React from "react"

import { observer, useObserver, isObserverBatched, enableStaticRendering } from "../src"

const getDNode = (obj: any, prop?: string) => mobx.getObserverTree(obj, prop)

afterEach(cleanup)

let consoleWarnMock: jest.SpyInstance | undefined
afterEach(() => {
    consoleWarnMock?.mockRestore()
})

function runTestSuite(mode: "observer" | "useObserver") {
    function obsComponent<P extends object>(
        component: React.FunctionComponent<P>,
        forceMemo = false
    ) {
        if (mode === "observer") {
            return observer(component)
        } else {
            const c = (props: P) => {
                consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})
                return useObserver(() => {
                    return component(props)
                })
            }
            return forceMemo ? React.memo(c) : c
        }
    }

    describe(`nestedRendering - ${mode}`, () => {
        const execute = () => {
            // init element
            const store = mobx.observable({
                todos: [
                    {
                        completed: false,
                        title: "a"
                    }
                ]
            })

            const renderings = {
                item: 0,
                list: 0
            }

            const TodoItem = obsComponent(({ todo }: { todo: (typeof store.todos)[0] }) => {
                renderings.item++
                return <li>|{todo.title}</li>
            }, true)

            const TodoList = obsComponent(() => {
                renderings.list++
                return (
                    <div>
                        <span>{store.todos.length}</span>
                        {store.todos.map((todo, idx) => (
                            <TodoItem key={idx} todo={todo} />
                        ))}
                    </div>
                )
            }, true)
            const rendered = render(<TodoList />)
            return { ...rendered, store, renderings }
        }

        test("first rendering", () => {
            const { getAllByText, renderings } = execute()
            expect(renderings.list).toBe(1)
            expect(renderings.item).toBe(1)
            expect(getAllByText("1")).toHaveLength(1)
            expect(getAllByText("|a")).toHaveLength(1)
        })

        test("inner store changed", () => {
            const { store, getAllByText, renderings } = execute()
            act(() => {
                store.todos[0].title += "a"
            })
            expect(renderings.list).toBe(1)
            expect(renderings.item).toBe(2)
            expect(getAllByText("1")).toHaveLength(1)
            expect(getAllByText("|aa")).toHaveLength(1)
            expect(getDNode(store, "todos").observers!.length).toBe(1)
            expect(getDNode(store.todos[0], "title").observers!.length).toBe(1)
        })

        test("rerendering with outer store added", () => {
            const { store, container, getAllByText, renderings } = execute()
            act(() => {
                store.todos.push({
                    completed: true,
                    title: "b"
                })
            })
            expect(container.querySelectorAll("li").length).toBe(2)
            expect(getAllByText("2")).toHaveLength(1)
            expect(getAllByText("|b")).toHaveLength(1)
            expect(renderings.list).toBe(2)
            expect(renderings.item).toBe(2)
            expect(getDNode(store.todos[1], "title").observers!.length).toBe(1)
            expect(getDNode(store.todos[1], "completed").observers).toBeFalsy()
        })

        test("rerendering with outer store pop", () => {
            const { store, container, renderings } = execute()
            let oldTodo
            act(() => {
                oldTodo = store.todos.pop()
            })
            expect(renderings.list).toBe(2)
            expect(renderings.item).toBe(1)
            expect(container.querySelectorAll("li").length).toBe(0)
            expect(getDNode(oldTodo, "title").observers).toBeFalsy()
            expect(getDNode(oldTodo, "completed").observers).toBeFalsy()
        })
    })

    describe("isObjectShallowModified detects when React will update the component", () => {
        const store = mobx.observable({ count: 0 })
        let counterRenderings = 0
        const Counter = obsComponent(function TodoItem() {
            counterRenderings++
            return <div>{store.count}</div>
        })

        test("does not assume React will update due to NaN prop", () => {
            // @ts-ignore Not sure what this test does, the value is not used
            render(<Counter value={NaN} />)
            act(() => {
                store.count++
            })
            expect(counterRenderings).toBe(2)
        })
    })

    describe("keep views alive", () => {
        const execute = () => {
            const data = mobx.observable({
                x: 3,
                yCalcCount: 0,
                get y() {
                    this.yCalcCount++
                    return this.x * 2
                },
                z: "hi"
            })
            const TestComponent = obsComponent(() => {
                return (
                    <div>
                        {data.z}
                        {data.y}
                    </div>
                )
            })
            return { ...render(<TestComponent />), data }
        }

        test("init state", () => {
            const { data, queryByText } = execute()
            expect(data.yCalcCount).toBe(1)
            expect(queryByText("hi6")).toBeTruthy()
        })

        test("rerender should not need a recomputation of data.y", () => {
            const { data, queryByText } = execute()
            act(() => {
                data.z = "hello"
            })
            expect(data.yCalcCount).toBe(1)
            expect(queryByText("hello6")).toBeTruthy()
        })
    })

    describe("does not keep views alive when using static rendering", () => {
        const execute = () => {
            enableStaticRendering(true)
            let renderCount = 0
            const data = mobx.observable({
                z: "hi"
            })

            const TestComponent = obsComponent(() => {
                renderCount++
                return <div>{data.z}</div>
            })

            return { ...render(<TestComponent />), data, getRenderCount: () => renderCount }
        }

        afterEach(() => {
            enableStaticRendering(false)
        })

        test("init state is correct", () => {
            const { getRenderCount, getByText } = execute()
            expect(getRenderCount()).toBe(1)
            expect(getByText("hi")).toBeTruthy()
        })

        test("no re-rendering on static rendering", () => {
            const { getRenderCount, getByText, data } = execute()
            act(() => {
                data.z = "hello"
            })
            expect(getRenderCount()).toBe(1)
            expect(getByText("hi")).toBeTruthy()
            expect(getDNode(data, "z").observers!).toBeFalsy()
        })
    })

    describe("issue 12", () => {
        const createData = () =>
            mobx.observable({
                selected: "coffee",
                items: [
                    {
                        name: "coffee"
                    },
                    {
                        name: "tea"
                    }
                ]
            })

        interface IItem {
            name: string
        }
        interface IRowProps {
            item: IItem
            selected: string
        }
        const Row: React.FC<IRowProps> = props => {
            return (
                <span>
                    {props.item.name}
                    {props.selected === props.item.name ? "!" : ""}
                </span>
            )
        }
        /** table stateles component */
        const Table = obsComponent<{ data: { items: IItem[]; selected: string } }>(props => {
            return (
                <div>
                    {props.data.items.map(item => (
                        <Row key={item.name} item={item} selected={props.data.selected} />
                    ))}
                </div>
            )
        })

        test("init state is correct", () => {
            const data = createData()
            const { container } = render(<Table data={data} />)
            expect(container).toMatchSnapshot()
        })

        test("run transaction", () => {
            const data = createData()
            const { container } = render(<Table data={data} />)
            act(() => {
                mobx.transaction(() => {
                    data.items[1].name = "boe"
                    data.items.splice(0, 2, { name: "soup" })
                    data.selected = "tea"
                })
            })
            expect(container).toMatchSnapshot()
        })
    })

    describe("issue 309", () => {
        test("isObserverBatched is still defined and yields true by default", () => {
            consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})
            expect(isObserverBatched()).toBe(true)
            expect(consoleWarnMock).toMatchSnapshot()
        })
    })

    test("changing state in render should fail", () => {
        // This test is most likely obsolete ... exception is not thrown
        const data = mobx.observable.box(2)
        const Comp = obsComponent(() => {
            if (data.get() === 3) {
                try {
                    data.set(4) // wouldn't throw first time for lack of observers.. (could we tighten this?)
                } catch (err) {
                    expect(err).toBeInstanceOf(Error)
                    expect(err).toMatch(
                        /Side effects like changing state are not allowed at this point/
                    )
                }
            }
            return <div>{data.get()}</div>
        })
        const { container } = render(<Comp />)
        act(() => {
            data.set(3)
        })
        expect(container).toMatchSnapshot()
        mobx._resetGlobalState()
    })

    describe("should render component even if setState called with exactly the same props", () => {
        const execute = () => {
            let renderCount = 0
            const Component = obsComponent(() => {
                const [, setState] = React.useState({})
                const onClick = () => {
                    setState({})
                }
                renderCount++
                return <div onClick={onClick} data-testid="clickableDiv" />
            })
            return { ...render(<Component />), getCount: () => renderCount }
        }

        test("renderCount === 1", () => {
            const { getCount } = execute()
            expect(getCount()).toBe(1)
        })

        test("after click once renderCount === 2", async () => {
            const { getCount, getByTestId } = execute()
            fireEvent.click(getByTestId("clickableDiv"))
            expect(getCount()).toBe(2)
        })

        test("after click twice renderCount === 3", async () => {
            const { getCount, getByTestId } = execute()
            fireEvent.click(getByTestId("clickableDiv"))
            fireEvent.click(getByTestId("clickableDiv"))
            expect(getCount()).toBe(3)
        })
    })

    describe("it rerenders correctly when useMemo is wrapping observable", () => {
        const execute = () => {
            let renderCount = 0
            const createProps = () => {
                const odata = mobx.observable({ x: 1 })
                const data = { y: 1 }
                function doStuff() {
                    data.y++
                    odata.x++
                }
                return { odata, data, doStuff }
            }

            const Component = obsComponent((props: any) => {
                const computed = React.useMemo(() => props.odata.x, [props.odata.x])

                renderCount++
                return (
                    <span onClick={props.doStuff}>
                        {props.odata.x}-{props.data.y}-{computed}
                    </span>
                )
            })

            const rendered = render(<Component {...createProps()} />)
            return {
                ...rendered,
                getCount: () => renderCount,
                span: rendered.container.querySelector("span")!
            }
        }

        test("init renderCount === 1", () => {
            const { span, getCount } = execute()
            expect(getCount()).toBe(1)
            expect(span.innerHTML).toBe("1-1-1")
        })

        test("after click renderCount === 2", async () => {
            const { span, getCount } = execute()
            fireEvent.click(span)
            expect(getCount()).toBe(2)
            expect(span.innerHTML).toBe("2-2-2")
        })

        test("after click twice renderCount === 3", async () => {
            const { span, getCount } = execute()
            fireEvent.click(span)
            fireEvent.click(span)
            expect(getCount()).toBe(3)
            expect(span.innerHTML).toBe("3-3-3")
        })
    })

    describe("should not re-render on shallow equal new props", () => {
        const execute = () => {
            const renderings = {
                child: 0,
                parent: 0
            }
            const data = { x: 1 }
            const odata = mobx.observable({ y: 1 })

            const Child = obsComponent((props: any) => {
                renderings.child++
                return <span>{props.data.x}</span>
            }, true)
            const Parent = obsComponent(() => {
                renderings.parent++
                // tslint:disable-next-line no-unused-expression
                odata.y /// depend
                return <Child data={data} />
            }, true)
            return { ...render(<Parent />), renderings, odata }
        }

        test("init state is correct", () => {
            const { container, renderings } = execute()
            expect(renderings.parent).toBe(1)
            expect(renderings.child).toBe(1)
            expect(container.querySelector("span")!.innerHTML).toBe("1")
        })

        test("after odata change", async () => {
            const { container, renderings, odata } = execute()
            act(() => {
                odata.y++
            })
            expect(renderings.parent).toBe(2)
            expect(renderings.child).toBe(1)
            expect(container.querySelector("span")!.innerHTML).toBe("1")
        })
    })

    describe("error handling", () => {
        test("errors should propagate", () => {
            const x = mobx.observable.box(1)
            const errorsSeen: any[] = []

            class ErrorBoundary extends React.Component<{ children: any }> {
                public static getDerivedStateFromError() {
                    return { hasError: true }
                }

                public state = {
                    hasError: false
                }

                public componentDidCatch(error: any, info: any) {
                    errorsSeen.push("" + error)
                }

                public render() {
                    if (this.state.hasError) {
                        return <span>Saw error!</span>
                    }
                    return this.props.children
                }
            }

            const C = obsComponent(() => {
                if (x.get() === 42) {
                    throw new Error("The meaning of life!")
                }
                return <span>{x.get()}</span>
            })

            const restoreConsole = mockConsole()
            try {
                const rendered = render(
                    <ErrorBoundary>
                        <C />
                    </ErrorBoundary>
                )
                expect(rendered.container.querySelector("span")!.innerHTML).toBe("1")
                act(() => {
                    x.set(42)
                })
                expect(errorsSeen).toEqual(["Error: The meaning of life!"])
                expect(rendered.container.querySelector("span")!.innerHTML).toBe("Saw error!")
            } finally {
                restoreConsole()
            }
        })
    })
}

runTestSuite("observer")
runTestSuite("useObserver")

test("observer(cmp, { forwardRef: true }) + useImperativeHandle", () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})

    interface IMethods {
        focus(): void
    }

    interface IProps {
        value: string
        ref: React.Ref<IMethods>
    }

    const FancyInput = observer<IProps>(
        (props: IProps, ref: React.Ref<IMethods>) => {
            const inputRef = React.useRef<HTMLInputElement>(null)
            React.useImperativeHandle(
                ref,
                () => ({
                    focus: () => {
                        inputRef.current!.focus()
                    }
                }),
                []
            )
            return <input ref={inputRef} defaultValue={props.value} />
        },
        { forwardRef: true }
    )

    const cr = React.createRef<IMethods>()
    render(<FancyInput ref={cr} value="" />)
    expect(cr).toBeTruthy()
    expect(cr.current).toBeTruthy()
    expect(typeof cr.current!.focus).toBe("function")
    expect(consoleWarnMock).toMatchSnapshot()
})

test("observer(forwardRef(cmp)) + useImperativeHandle", () => {
    interface IMethods {
        focus(): void
    }

    interface IProps {
        value: string
    }

    const FancyInput = observer(
        React.forwardRef((props: IProps, ref: React.Ref<IMethods>) => {
            const inputRef = React.useRef<HTMLInputElement>(null)
            React.useImperativeHandle(
                ref,
                () => ({
                    focus: () => {
                        inputRef.current!.focus()
                    }
                }),
                []
            )
            return <input ref={inputRef} defaultValue={props.value} />
        })
    )

    const cr = React.createRef<IMethods>()
    render(<FancyInput ref={cr} value="" />)
    expect(cr).toBeTruthy()
    expect(cr.current).toBeTruthy()
    expect(typeof cr.current!.focus).toBe("function")
})

test("useImperativeHandle and forwardRef should work with useObserver", () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})
    interface IMethods {
        focus(): void
    }

    interface IProps {
        value: string
    }

    const FancyInput = React.memo(
        React.forwardRef((props: IProps, ref: React.Ref<IMethods>) => {
            const inputRef = React.useRef<HTMLInputElement>(null)
            React.useImperativeHandle(
                ref,
                () => ({
                    focus: () => {
                        inputRef.current!.focus()
                    }
                }),
                []
            )
            return useObserver(() => {
                return <input ref={inputRef} defaultValue={props.value} />
            })
        })
    )

    const cr = React.createRef<IMethods>()
    render(<FancyInput ref={cr} value="" />)
    expect(cr).toBeTruthy()
    expect(cr.current).toBeTruthy()
    expect(typeof cr.current!.focus).toBe("function")
    expect(consoleWarnMock).toMatchSnapshot()
})

it("should hoist known statics only", () => {
    function isNumber() {
        return null
    }

    function MyHipsterComponent() {
        return null
    }
    MyHipsterComponent.defaultProps = { x: 3 }
    MyHipsterComponent.propTypes = { x: isNumber }
    MyHipsterComponent.randomStaticThing = 3
    MyHipsterComponent.type = "Nope!"
    MyHipsterComponent.compare = "Nope!"
    MyHipsterComponent.render = "Nope!"

    const wrapped = observer(MyHipsterComponent)
    expect(wrapped.randomStaticThing).toEqual(3)
    expect(wrapped.defaultProps).toEqual({ x: 3 })
    expect(wrapped.propTypes).toEqual({ x: isNumber })
    expect(wrapped.type).toBeInstanceOf(Function) // And not "Nope!"; this is the wrapped component, the property is introduced by memo
    expect(wrapped.compare).toBe(null) // another memo field
    expect(wrapped.render).toBe(undefined)
})

it("should inherit original name/displayName #3438", () => {
    function Name() {
        return null
    }
    Name.displayName = "DisplayName"
    const TestComponent = observer(Name)

    expect((TestComponent as any).type.name).toBe("Name")
    expect((TestComponent as any).type.displayName).toBe("DisplayName")
})

test("parent / childs render in the right order", done => {
    // See: https://jsfiddle.net/gkaemmer/q1kv7hbL/13/
    const events: string[] = []

    class User {
        public name = "User's name"
        constructor() {
            mobx.makeObservable(this, {
                name: mobx.observable
            })
        }
    }

    class Store {
        public user: User | null = new User()
        public logout() {
            this.user = null
        }
        constructor() {
            mobx.makeObservable(this, {
                user: mobx.observable,
                logout: mobx.action
            })
        }
    }

    const store = new Store()

    function tryLogout() {
        try {
            store.logout()
            expect(true).toBeTruthy()
        } catch (e) {
            // t.fail(e)
        }
    }

    const Parent = observer(() => {
        events.push("parent")
        if (!store.user) {
            return <span>Not logged in.</span>
        }
        return (
            <div>
                <Child />
                <button onClick={tryLogout}>Logout</button>
            </div>
        )
    })

    const Child = observer(() => {
        events.push("child")
        if (!store.user) {
            return null
        }
        return <span>Logged in as: {store.user.name}</span>
    })

    render(<Parent />)

    tryLogout()
    expect(events).toEqual(["parent", "child"])
    done()
})

it("should have overload for props with children", () => {
    interface IProps {
        value: string
    }
    const TestComponent = observer<IProps>(({ value }) => {
        return null
    })

    render(<TestComponent value="1" />)

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

it("should have overload for empty options", () => {
    // empty options are not really making sense now, but we shouldn't rely on `forwardRef`
    // being specified in case other options are added in the future

    interface IProps {
        value: string
    }
    const TestComponent = observer<IProps>(({ value }) => {
        return null
    }, {})

    render(<TestComponent value="1" />)

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

it("should have overload for props with children when forwardRef", () => {
    interface IMethods {
        focus(): void
    }

    interface IProps {
        value: string
    }
    const TestComponent = observer<IProps, IMethods>(
        ({ value }, ref) => {
            return null
        },
        { forwardRef: true }
    )

    render(<TestComponent value="1" />)

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

it("should preserve generic parameters", () => {
    interface IColor {
        name: string
        css: string
    }

    interface ITestComponentProps<T> {
        value: T
        callback: (value: T) => void
    }
    const TestComponent = observer(<T extends unknown>(props: ITestComponentProps<T>) => {
        return null
    })

    function callbackString(value: string) {
        return
    }
    function callbackColor(value: IColor) {
        return
    }

    render(<TestComponent value="1" callback={callbackString} />)
    render(
        <TestComponent value={{ name: "red", css: "rgb(255, 0, 0)" }} callback={callbackColor} />
    )

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

it("should preserve generic parameters when forwardRef", () => {
    interface IMethods {
        focus(): void
    }

    interface IColor {
        name: string
        css: string
    }

    interface ITestComponentProps<T> {
        value: T
        callback: (value: T) => void
    }
    const TestComponent = observer(
        <T extends unknown>(props: ITestComponentProps<T>, ref: React.Ref<IMethods>) => {
            return null
        },
        { forwardRef: true }
    )

    function callbackString(value: string) {
        return
    }
    function callbackColor(value: IColor) {
        return
    }

    render(<TestComponent value="1" callback={callbackString} />)
    render(
        <TestComponent value={{ name: "red", css: "rgb(255, 0, 0)" }} callback={callbackColor} />
    )

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

it("should keep original props types", () => {
    interface TestComponentProps {
        a: number
    }

    function TestComponent({ a }: TestComponentProps): JSX.Element | null {
        return null
    }

    const ObserverTestComponent = observer(TestComponent)

    const element = React.createElement(ObserverTestComponent, { a: 1 })
    render(element)

    // this test has no `expect` calls as it verifies whether such component compiles or not
})

// describe("206 - @observer should produce usefull errors if it throws", () => {
//     const data = mobx.observable({ x: 1 })
//     let renderCount = 0

//     const emmitedErrors = []
//     const disposeErrorsHandler = onError(error => {
//         emmitedErrors.push(error)
//     })

//     @observer
//     class Child extends React.Component {
//         render() {
//             renderCount++
//             if (data.x === 42) throw new Error("Oops!")
//             return <span>{data.x}</span>
//         }
//     }

//     beforeAll(async done => {
//         await asyncReactDOMRender(<Child />, testRoot)
//         done()
//     })

//     test("init renderCount should === 1", () => {
//         expect(renderCount).toBe(1)
//     })

//     test("catch exception", () => {
//         expect(() => {
//             withConsole(() => {
//                 data.x = 42
//             })
//         }).toThrow(/Oops!/)
//         expect(renderCount).toBe(3) // React fiber will try to replay the rendering, so the exception gets thrown a second time
//     })

//     test("component recovers!", async () => {
//         await sleepHelper(500)
//         data.x = 3
//         TestUtils.renderIntoDocument(<Child />)
//         expect(renderCount).toBe(4)
//         expect(emmitedErrors).toEqual([new Error("Oops!"), new Error("Oops!")]) // see above comment
//     })
// })

// test("195 - async componentWillMount does not work", async () => {
//     const renderedValues = []

//     @observer
//     class WillMount extends React.Component {
//         @mobx.observable
//         counter = 0

//         @mobx.action
//         inc = () => this.counter++

//         componentWillMount() {
//             setTimeout(() => this.inc(), 300)
//         }

//         render() {
//             renderedValues.push(this.counter)
//             return (
//                 <p>
//                     {this.counter}
//                     <button onClick={this.inc}>+</button>
//                 </p>
//             )
//         }
//     }
//     TestUtils.renderIntoDocument(<WillMount />)

//     await sleepHelper(500)
//     expect(renderedValues).toEqual([0, 1])
// })

// test.skip("195 - should throw if trying to overwrite lifecycle methods", () => {
//     // Test disabled, see #231...

//     @observer
//     class WillMount extends React.Component {
//         componentWillMount = () => {}

//         render() {
//             return null
//         }
//     }
//     expect(TestUtils.renderIntoDocument(<WillMount />)).toThrow(
//         /Cannot assign to read only property 'componentWillMount'/
//     )
// })

it("dependencies should not become temporarily unobserved", async () => {
    jest.spyOn(React, "useEffect")

    let p: Promise<any>[] = []
    const cleanups: any[] = []

    async function runEffects() {
        await Promise.all(p.splice(0))
    }

    // @ts-ignore
    React.useEffect.mockImplementation(effect => {
        p.push(
            new Promise<void>(resolve => {
                setTimeout(() => {
                    act(() => {
                        cleanups.push(effect())
                    })
                    resolve()
                }, 10)
            })
        )
    })

    let computed = 0
    let renders = 0

    const store = mobx.makeAutoObservable({
        x: 1,
        get double() {
            computed++
            return this.x * 2
        },
        inc() {
            this.x++
        }
    })

    const doubleDisposed = jest.fn()
    const reactionFired = jest.fn()

    mobx.onBecomeUnobserved(store, "double", doubleDisposed)

    const TestComponent = observer(() => {
        renders++
        return <div>{store.double}</div>
    })

    const r = render(<TestComponent />)

    expect(computed).toBe(1)
    expect(renders).toBe(1)
    expect(doubleDisposed).toBeCalledTimes(0)

    store.inc()
    expect(computed).toBe(2) // change propagated
    expect(renders).toBe(1) // but not yet rendered
    expect(doubleDisposed).toBeCalledTimes(0) // if we dispose to early, this fails!

    // Bug: change the state, before the useEffect fires, can cause the reaction to be disposed
    mobx.reaction(() => store.x, reactionFired)
    expect(reactionFired).toBeCalledTimes(0)
    expect(computed).toBe(2) // Not 3!
    expect(renders).toBe(1)
    expect(doubleDisposed).toBeCalledTimes(0)

    await runEffects()
    expect(reactionFired).toBeCalledTimes(0)
    expect(computed).toBe(2) // Not 3!
    expect(renders).toBe(2)
    expect(doubleDisposed).toBeCalledTimes(0)

    r.unmount()
    cleanups.filter(Boolean).forEach(f => f())
    expect(reactionFired).toBeCalledTimes(0)
    expect(computed).toBe(2)
    expect(renders).toBe(2)
    expect(doubleDisposed).toBeCalledTimes(1)
})

it.skip("Legacy context support", () => {
    const contextKey = "key"
    const contextValue = "value"

    function ContextConsumer(_, context) {
        expect(context[contextKey]).toBe(contextValue)
        return null
    }

    ContextConsumer.contextTypes = {
        [contextKey]: () => null
    }

    const ObserverContextConsumer = observer(ContextConsumer)

    class ContextProvider extends React.Component {
        getChildContext() {
            return { [contextKey]: contextValue }
        }

        render() {
            return <ObserverContextConsumer />
        }
    }

    ;(ContextProvider as any).childContextTypes = {
        [contextKey]: () => null
    }

    render(<ContextProvider />)
})

it("Throw when trying to set contextType on observer", () => {
    const NamedObserver = observer(function TestCmp() {
        return null
    })
    const AnonymousObserver = observer(() => null)
    expect(() => {
        ;(NamedObserver as any).contextTypes = {}
    }).toThrow(/\[mobx-react-lite\] `TestCmp.contextTypes` must be set before applying `observer`./)
    expect(() => {
        ;(AnonymousObserver as any).contextTypes = {}
    }).toThrow(
        /\[mobx-react-lite\] `Component.contextTypes` must be set before applying `observer`./
    )
})

test("Anonymous component displayName #3192", () => {
    // React prints errors even if we catch em
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

    // Simulate returning something not renderable:
    // Error: n_a_m_e(...):
    // The point is to get correct displayName in error msg.

    let memoError
    let observerError

    // @ts-ignore
    const MemoCmp = React.memo(() => {
        return { hello: "world" }
    })
    // @ts-ignore
    const ObserverCmp = observer(() => {
        return { hello: "world" }
    })

    ObserverCmp.displayName = MemoCmp.displayName = "n_a_m_e"

    try {
        render(<MemoCmp />)
    } catch (error) {
        memoError = error
    }

    try {
        // @ts-ignore
        render(<ObserverCmp />)
    } catch (error) {
        observerError = error
    }

    expect(memoError).toBeInstanceOf(Error)
    expect(observerError).toBeInstanceOf(Error)

    expect(memoError.message.includes(MemoCmp.displayName))
    expect(MemoCmp.displayName).toEqual(ObserverCmp.displayName)
    expect(observerError.message).toEqual(memoError.message)
    consoleErrorSpy.mockRestore()
})

test("#3648 enableStaticRendering doesn't warn with observableRequiresReaction/computedRequiresReaction", () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
        enableStaticRendering(true)
        mobx.configure({ observableRequiresReaction: true, computedRequiresReaction: true })
        const o = mobx.observable.box(0, { name: "o" })
        const c = mobx.computed(() => o.get(), { name: "c" })
        const TestCmp = observer(() => <div>{o.get() + c.get()}</div>)

        const { unmount, container } = render(<TestCmp />)
        expect(container).toHaveTextContent("0")
        unmount()

        expect(consoleWarnMock).toMatchSnapshot()
    } finally {
        enableStaticRendering(false)
        mobx._resetGlobalState()
        consoleWarnMock.mockRestore()
    }
})

test("StrictMode #3671", async () => {
    const o = mobx.observable({ x: 0 })

    const Cmp = observer(() => o.x as any)

    const { container, unmount } = render(
        <React.StrictMode>
            <Cmp />
        </React.StrictMode>
    )

    expect(container).toHaveTextContent("0")
    act(
        mobx.action(() => {
            o.x++
        })
    )
    expect(container).toHaveTextContent("1")
})

test("`isolateGlobalState` shouldn't break reactivity #3734", async () => {
    mobx.configure({ isolateGlobalState: true })

    const o = mobx.observable({ x: 0 })

    const Cmp = observer(() => o.x as any)

    const { container, unmount } = render(<Cmp />)

    expect(container).toHaveTextContent("0")
    act(
        mobx.action(() => {
            o.x++
        })
    )
    expect(container).toHaveTextContent("1")
    unmount()

    mobx._resetGlobalState()
})
