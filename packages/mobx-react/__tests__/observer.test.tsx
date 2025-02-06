import React, { StrictMode, Suspense } from "react"
import { inject, observer, Observer, enableStaticRendering } from "../src"
import { render, act, waitFor } from "@testing-library/react"
import {
    getObserverTree,
    _getGlobalState,
    _resetGlobalState,
    action,
    computed,
    observable,
    transaction,
    makeObservable,
    autorun,
    IReactionDisposer,
    reaction,
    configure,
    runInAction
} from "mobx"
import { withConsole } from "./utils/withConsole"
import { shallowEqual } from "../src/utils/utils"
/**
 *  some test suite is too tedious
 */

afterEach(() => {
    jest.useRealTimers()
})

let consoleWarnMock: jest.SpyInstance | undefined
afterEach(() => {
    consoleWarnMock?.mockRestore()
})

/*
 use TestUtils.renderIntoDocument will re-mounted the component with different props
 some misunderstanding will be cause？
*/
describe("nestedRendering", () => {
    let store

    let todoItemRenderings
    const TodoItem = observer(function TodoItem(props) {
        todoItemRenderings++
        return <li>|{props.todo.title}</li>
    })

    let todoListRenderings
    const TodoList = observer(
        class TodoList extends React.Component {
            render() {
                todoListRenderings++
                const todos = store.todos
                return (
                    <div>
                        <span>{todos.length}</span>
                        {todos.map((todo, idx) => (
                            <TodoItem key={idx} todo={todo} />
                        ))}
                    </div>
                )
            }
        }
    )

    beforeEach(() => {
        todoItemRenderings = 0
        todoListRenderings = 0
        store = observable({
            todos: [
                {
                    title: "a",
                    completed: false
                }
            ]
        })
    })

    test("first rendering", () => {
        const { container } = render(<TodoList />)

        expect(todoListRenderings).toBe(1)
        expect(container.querySelectorAll("li").length).toBe(1)
        expect(container.querySelector("li")).toHaveTextContent("|a")
        expect(todoItemRenderings).toBe(1)
    })

    test("second rendering with inner store changed", () => {
        render(<TodoList />)

        act(() => {
            store.todos[0].title += "a"
        })

        expect(todoListRenderings).toBe(1)
        expect(todoItemRenderings).toBe(2)
        expect(getObserverTree(store, "todos").observers!.length).toBe(1)
        expect(getObserverTree(store.todos[0], "title").observers!.length).toBe(1)
    })

    test("rerendering with outer store added", () => {
        const { container } = render(<TodoList />)

        act(() => {
            store.todos.push({
                title: "b",
                completed: true
            })
        })

        expect(container.querySelectorAll("li").length).toBe(2)
        expect(
            Array.from(container.querySelectorAll("li"))
                .map((e: any) => e.innerHTML)
                .sort()
        ).toEqual(["|a", "|b"].sort())
        expect(todoListRenderings).toBe(2)
        expect(todoItemRenderings).toBe(2)
        expect(getObserverTree(store.todos[1], "title").observers!.length).toBe(1)
        expect(getObserverTree(store.todos[1], "completed").observers).toBe(undefined)
    })

    test("rerendering with outer store pop", () => {
        const { container } = render(<TodoList />)

        let oldTodo
        act(() => (oldTodo = store.todos.pop()))

        expect(todoListRenderings).toBe(2)
        expect(todoItemRenderings).toBe(1)
        expect(container.querySelectorAll("li").length).toBe(0)
        expect(getObserverTree(oldTodo, "title").observers).toBe(undefined)
        expect(getObserverTree(oldTodo, "completed").observers).toBe(undefined)
    })
})

describe("isObjectShallowModified detects when React will update the component", () => {
    const store = observable({ count: 0 })
    let counterRenderings = 0
    const Counter: React.FunctionComponent<any> = observer(function TodoItem() {
        counterRenderings++
        return <div>{store.count}</div>
    })

    test("does not assume React will update due to NaN prop", () => {
        render(<Counter value={NaN} />)

        act(() => {
            store.count++
        })

        expect(counterRenderings).toBe(2)
    })
})

describe("keep views alive", () => {
    let yCalcCount
    let data
    const TestComponent = observer(function testComponent() {
        return (
            <div>
                {data.z}
                {data.y}
            </div>
        )
    })

    beforeEach(() => {
        yCalcCount = 0
        data = observable({
            x: 3,
            get y() {
                yCalcCount++
                return this.x * 2
            },
            z: "hi"
        })
    })

    test("init state", () => {
        const { container } = render(<TestComponent />)

        expect(yCalcCount).toBe(1)
        expect(container).toHaveTextContent("hi6")
    })

    test("rerender should not need a recomputation of data.y", () => {
        const { container } = render(<TestComponent />)

        act(() => {
            data.z = "hello"
        })

        expect(yCalcCount).toBe(1)
        expect(container).toHaveTextContent("hello6")
    })
})

describe("does not views alive when using static rendering", () => {
    let renderCount
    let data

    const TestComponent = observer(function testComponent() {
        renderCount++
        return <div>{data.z}</div>
    })

    beforeAll(() => {
        enableStaticRendering(true)
    })

    beforeEach(() => {
        renderCount = 0
        data = observable({
            z: "hi"
        })
    })

    afterAll(() => {
        enableStaticRendering(false)
    })

    test("init state is correct", () => {
        const { container } = render(<TestComponent />)

        expect(renderCount).toBe(1)
        expect(container).toHaveTextContent("hi")
    })

    test("no re-rendering on static rendering", () => {
        const { container } = render(<TestComponent />)

        act(() => {
            data.z = "hello"
        })

        expect(getObserverTree(data, "z").observers).toBe(undefined)
        expect(renderCount).toBe(1)
        expect(container).toHaveTextContent("hi")
    })
})

test("issue 12", () => {
    const events: Array<any> = []
    const data = observable({
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

    /** Row Class */
    class Row extends React.Component<any, any> {
        constructor(props) {
            super(props)
        }

        render() {
            events.push("row: " + this.props.item.name)
            return (
                <span>
                    {this.props.item.name}
                    {data.selected === this.props.item.name ? "!" : ""}
                </span>
            )
        }
    }
    /** table stateles component */
    const Table = observer(function table() {
        events.push("table")
        JSON.stringify(data)
        return (
            <div>
                {data.items.map(item => (
                    <Row key={item.name} item={item} />
                ))}
            </div>
        )
    })

    const { container } = render(<Table />)
    expect(container).toMatchSnapshot()

    act(() => {
        transaction(() => {
            data.items[1].name = "boe"
            data.items.splice(0, 2, { name: "soup" })
            data.selected = "tea"
        })
    })
    expect(container).toMatchSnapshot()
    expect(events).toEqual(["table", "row: coffee", "row: tea", "table", "row: soup"])
})

test("observer component can be injected", () => {
    const msg: Array<any> = []
    const baseWarn = console.warn
    console.warn = m => msg.push(m)

    inject("foo")(
        observer(
            class T extends React.Component {
                render() {
                    return null
                }
            }
        )
    )

    // N.B, the injected component will be observer since mobx-react 4.0!
    inject(() => ({}))(
        observer(
            class T extends React.Component {
                render() {
                    return null
                }
            }
        )
    )

    expect(msg.length).toBe(0)
    console.warn = baseWarn
})

test("correctly wraps display name of child component", () => {
    const A = observer(
        class ObserverClass extends React.Component {
            render() {
                return null
            }
        }
    )
    const B: React.FunctionComponent<any> = observer(function StatelessObserver() {
        return null
    })

    expect(A.name).toEqual("ObserverClass")
    expect((B as any).type.name).toEqual("StatelessObserver")
    expect((B as any).type.displayName).toEqual(undefined)
})

describe("124 - react to changes in this.props via computed", () => {
    class T extends React.Component<any, any> {
        @computed
        get computedProp() {
            return this.props.x
        }
        render() {
            return (
                <span>
                    x:
                    {this.computedProp}
                </span>
            )
        }
    }

    const Comp = observer(T)

    class Parent extends React.Component {
        state = { v: 1 }
        render() {
            return (
                <div onClick={() => this.setState({ v: 2 })}>
                    <Comp x={this.state.v} />
                </div>
            )
        }
    }

    test("init state is correct", () => {
        const { container } = render(<Parent />)

        expect(container).toHaveTextContent("x:1")
    })

    test("change after click", () => {
        const { container } = render(<Parent />)

        act(() => container.querySelector("div")!.click())
        expect(container).toHaveTextContent("x:2")
    })
})

// Test on skip: since all reactions are now run in batched updates, the original issues can no longer be reproduced
//this test case should be deprecated?
test("should stop updating if error was thrown in render (#134)", () => {
    const data = observable.box(0)
    let renderingsCount = 0
    let lastOwnRenderCount = 0
    const errors: Array<any> = []

    class Outer extends React.Component<any> {
        state = { hasError: false }

        render() {
            return this.state.hasError ? <div>Error!</div> : <div>{this.props.children}</div>
        }

        static getDerivedStateFromError() {
            return { hasError: true }
        }

        componentDidCatch(error, info) {
            errors.push(error.toString().split("\n")[0], info)
        }
    }

    const Comp = observer(
        class X extends React.Component {
            ownRenderCount = 0

            render() {
                lastOwnRenderCount = ++this.ownRenderCount
                renderingsCount++
                if (data.get() === 2) {
                    throw new Error("Hello")
                }
                return <div />
            }
        }
    )
    render(
        <Outer>
            <Comp />
        </Outer>
    )

    // Check this
    // @ts-ignore
    expect(getObserverTree(data).observers!.length).toBe(1)
    act(() => data.set(1))
    expect(renderingsCount).toBe(2)
    expect(lastOwnRenderCount).toBe(2)
    withConsole(() => {
        act(() => data.set(2))
    })

    // @ts-ignore
    expect(getObserverTree(data).observers).toBe(undefined)
    act(() => {
        data.set(3)
        data.set(4)
        data.set(2)
        data.set(5)
    })
    // MWE: not sure if these numbers make sense. Nor whether it really matters
    expect(lastOwnRenderCount).toBe(4)
    expect(renderingsCount).toBe(4)
})

describe("should render component even if setState called with exactly the same props", () => {
    let renderCount
    const Comp = observer(
        class T extends React.Component {
            onClick = () => {
                this.setState({})
            }
            render() {
                renderCount++
                return <div onClick={this.onClick} id="clickableDiv" />
            }
        }
    )

    beforeEach(() => {
        renderCount = 0
    })

    test("renderCount === 1", () => {
        render(<Comp />)

        expect(renderCount).toBe(1)
    })

    test("after click once renderCount === 2", () => {
        const { container } = render(<Comp />)
        const clickableDiv = container.querySelector("#clickableDiv") as HTMLElement

        act(() => clickableDiv.click())

        expect(renderCount).toBe(2)
    })

    test("after click twice renderCount === 3", () => {
        const { container } = render(<Comp />)
        const clickableDiv = container.querySelector("#clickableDiv") as HTMLElement

        act(() => clickableDiv.click())
        act(() => clickableDiv.click())

        expect(renderCount).toBe(3)
    })
})

test("it rerenders correctly if some props are non-observables - 1", () => {
    let odata = observable({ x: 1 })
    let data = { y: 1 }

    @observer
    class Comp extends React.Component<any, any> {
        @computed
        get computed() {
            // n.b: data.y would not rerender! shallowly new equal props are not stored
            return this.props.odata.x
        }
        render() {
            return (
                <span onClick={stuff}>
                    {this.props.odata.x}-{this.props.data.y}-{this.computed}
                </span>
            )
        }
    }

    const Parent = observer(
        class Parent extends React.Component<any, any> {
            render() {
                // this.props.odata.x;
                return <Comp data={this.props.data} odata={this.props.odata} />
            }
        }
    )

    function stuff() {
        act(() => {
            data.y++
            odata.x++
        })
    }

    const { container } = render(<Parent odata={odata} data={data} />)

    expect(container).toHaveTextContent("1-1-1")
    stuff()
    expect(container).toHaveTextContent("2-2-2")
    stuff()
    expect(container).toHaveTextContent("3-3-3")
})

test("it rerenders correctly if some props are non-observables - 2", () => {
    let renderCount = 0
    let odata = observable({ x: 1 })

    @observer
    class Component extends React.PureComponent<any, any> {
        @computed
        get computed() {
            return this.props.data.y // should recompute, since props.data is changed
        }

        render() {
            renderCount++
            return (
                <span onClick={stuff}>
                    {this.props.data.y}-{this.computed}
                </span>
            )
        }
    }

    const Parent = observer(props => {
        let data = { y: props.odata.x }
        return <Component data={data} odata={props.odata} />
    })

    function stuff() {
        odata.x++
    }

    const { container } = render(<Parent odata={odata} />)

    expect(renderCount).toBe(1)
    expect(container).toHaveTextContent("1-1")

    act(() => stuff())
    expect(renderCount).toBe(2)
    expect(container).toHaveTextContent("2-2")

    act(() => stuff())
    expect(renderCount).toBe(3)
    expect(container).toHaveTextContent("3-3")
})

describe("Observer regions should react", () => {
    let data
    const Comp = () => (
        <div>
            <Observer>{() => <span data-testid="inside-of-observer">{data.get()}</span>}</Observer>
            <span data-testid="outside-of-observer">{data.get()}</span>
        </div>
    )

    beforeEach(() => {
        data = observable.box("hi")
    })

    test("init state is correct", () => {
        const { queryByTestId } = render(<Comp />)

        expect(queryByTestId("inside-of-observer")).toHaveTextContent("hi")
        expect(queryByTestId("outside-of-observer")).toHaveTextContent("hi")
    })

    test("set the data to hello", () => {
        const { queryByTestId } = render(<Comp />)

        act(() => data.set("hello"))

        expect(queryByTestId("inside-of-observer")).toHaveTextContent("hello")
        expect(queryByTestId("outside-of-observer")).toHaveTextContent("hi")
    })
})

test("Observer should not re-render on shallow equal new props", () => {
    let childRendering = 0
    let parentRendering = 0
    const data = { x: 1 }
    const odata = observable({ y: 1 })

    const Child = observer(({ data }) => {
        childRendering++
        return <span>{data.x}</span>
    })
    const Parent = observer(() => {
        parentRendering++
        odata.y /// depend
        return <Child data={data} />
    })

    const { container } = render(<Parent />)

    expect(parentRendering).toBe(1)
    expect(childRendering).toBe(1)
    expect(container).toHaveTextContent("1")

    act(() => {
        odata.y++
    })
    expect(parentRendering).toBe(2)
    expect(childRendering).toBe(1)
    expect(container).toHaveTextContent("1")
})

test("parent / childs render in the right order", () => {
    // See: https://jsfiddle.net/gkaemmer/q1kv7hbL/13/
    let events: Array<any> = []

    class User {
        @observable
        name = "User's name"
    }

    class Store {
        @observable
        user: User | null = new User()
        @action
        logout() {
            this.user = null
        }
        constructor() {
            makeObservable(this)
        }
    }

    function tryLogout() {
        try {
            // ReactDOM.unstable_batchedUpdates(() => {
            store.logout()
            expect(true).toBeTruthy()
            // });
        } catch (e) {
            // t.fail(e)
        }
    }

    const store = new Store()

    const Parent = observer(() => {
        events.push("parent")
        if (!store.user) return <span>Not logged in.</span>
        return (
            <div>
                <Child />
                <button onClick={tryLogout}>Logout</button>
            </div>
        )
    })

    const Child = observer(() => {
        events.push("child")
        return <span>Logged in as: {store.user?.name}</span>
    })

    render(<Parent />)

    act(() => tryLogout())
    expect(events).toEqual(["parent", "child", "parent"])
})

describe("use Observer inject and render sugar should work  ", () => {
    test("use render without inject should be correct", () => {
        const Comp = () => (
            <div>
                <Observer render={() => <span>{123}</span>} />
            </div>
        )
        const { container } = render(<Comp />)
        expect(container).toHaveTextContent("123")
    })

    test("use children without inject should be correct", () => {
        const Comp = () => (
            <div>
                <Observer>{() => <span>{123}</span>}</Observer>
            </div>
        )
        const { container } = render(<Comp />)
        expect(container).toHaveTextContent("123")
    })

    test("show error when using children and render at same time ", () => {
        const msg: Array<any> = []
        const baseError = console.error
        console.error = m => msg.push(m)

        const Comp = () => (
            <div>
                <Observer render={() => <span>{123}</span>}>{() => <span>{123}</span>}</Observer>
            </div>
        )

        render(<Comp />)
        expect(msg.length).toBe(1)
        console.error = baseError
    })
})

test("use PureComponent", () => {
    const msg: Array<any> = []
    const baseWarn = console.warn
    console.warn = m => msg.push(m)

    try {
        observer(
            class X extends React.PureComponent {
                render() {
                    return <div />
                }
            }
        )

        expect(msg).toEqual([])
    } finally {
        console.warn = baseWarn
    }
})

test("static on function components are hoisted", () => {
    const Comp = () => <div />
    Comp.foo = 3

    const Comp2 = observer(Comp)

    expect(Comp2.foo).toBe(3)
})

test("computed properties react to props", () => {
    jest.useFakeTimers()

    const seen: Array<any> = []
    @observer
    class Child extends React.Component<any, any> {
        @computed
        get getPropX() {
            return this.props.x
        }

        render() {
            seen.push(this.getPropX)
            return <div>{this.getPropX}</div>
        }
    }

    class Parent extends React.Component {
        state = { x: 0 }
        render() {
            seen.push("parent")
            return <Child x={this.state.x} />
        }

        componentDidMount() {
            setTimeout(() => this.setState({ x: 2 }), 100)
        }
    }

    const { container } = render(<Parent />)
    expect(container).toHaveTextContent("0")

    act(() => {
        jest.runAllTimers()
    })
    expect(container).toHaveTextContent("2")

    expect(seen).toEqual(["parent", 0, "parent", 2])
})

test("#692 - componentDidUpdate is triggered", () => {
    jest.useFakeTimers()

    let cDUCount = 0

    @observer
    class Test extends React.Component<any, any> {
        @observable
        counter = 0

        @action
        inc = () => this.counter++

        constructor(props) {
            super(props)
            makeObservable(this)
            setTimeout(() => this.inc(), 300)
        }

        render() {
            return <p>{this.counter}</p>
        }

        componentDidUpdate() {
            cDUCount++
        }
    }
    render(<Test />)
    expect(cDUCount).toBe(0)

    act(() => {
        jest.runAllTimers()
    })
    expect(cDUCount).toBe(1)
})

// Not possible to properly test error catching (see ErrorCatcher)
test.skip("#709 - applying observer on React.memo component", () => {
    const WithMemo = React.memo(() => {
        return null
    })

    const Observed = observer(WithMemo)
    // @ts-ignore
    // eslint-disable-next-line no-undef
    render(<Observed />, { wrapper: ErrorCatcher })
})

test("Redeclaring an existing observer component as an observer should throw", () => {
    @observer
    class AlreadyObserver extends React.Component<any, any> {
        render() {
            return <div />
        }
    }

    expect(() => observer(AlreadyObserver)).toThrowErrorMatchingSnapshot()
})

test("Missing render should throw", () => {
    class Component extends React.Component<any, any> {
        render = function () {
            return <div />
        }
    }
    expect(() => observer(Component)).toThrow()
})

test("class observer supports re-mounting #3395", () => {
    const state = observable.box(1)
    let mountCounter = 0

    @observer
    class TestCmp extends React.Component<any> {
        componentDidMount() {
            mountCounter++
        }
        render() {
            return state.get()
        }
    }

    const app = (
        <StrictMode>
            <TestCmp />
        </StrictMode>
    )

    const { unmount, container } = render(app)

    expect(mountCounter).toBe(2)
    expect(container).toHaveTextContent("1")
    act(() => {
        state.set(2)
    })
    expect(mountCounter).toBe(2)
    expect(container).toHaveTextContent("2")

    unmount()
})

test("SSR works #3448", () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})

    @observer
    class TestCmp extends React.Component<any> {
        render() {
            return ":)"
        }
    }

    const app = <TestCmp />

    enableStaticRendering(true)
    const { unmount, container } = render(app)
    expect(container).toHaveTextContent(":)")
    unmount()
    enableStaticRendering(false)

    expect(consoleWarnMock).toMatchSnapshot()
})

test("#3492 should not cause warning by calling forceUpdate on uncommited components", async () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})

    const o = observable({ x: 0 })
    let aConstructorCount = 0
    let aMountCount = 0
    let aRenderCount = 0

    @observer
    class A extends React.Component<any> {
        constructor(props) {
            super(props)
            aConstructorCount++
        }
        componentDidMount(): void {
            aMountCount++
        }
        render() {
            aRenderCount++
            return (
                <Suspense fallback="fallback">
                    <LazyB />
                    {o.x}
                </Suspense>
            )
        }
    }

    class B extends React.Component {
        render() {
            return "B"
        }
    }

    const LazyA = React.lazy(() => Promise.resolve({ default: A }))
    const LazyB = React.lazy(() => Promise.resolve({ default: B }))

    function App() {
        return (
            <Suspense fallback="fallback">
                <LazyA />
            </Suspense>
        )
    }

    const { unmount, container } = render(<App />)

    expect(container).toHaveTextContent("fallback")
    await waitFor(() => expect(container).toHaveTextContent("B0"))
    act(() => {
        o.x++
    })
    expect(container).toHaveTextContent("B1")
    // React throws away the first instance, therefore the mismatch
    expect(aConstructorCount).toBe(2)
    expect(aMountCount).toBe(1)
    expect(aRenderCount).toBe(3)
    unmount()
    expect(consoleWarnMock).toMatchSnapshot()
})

test("#3648 enableStaticRendering doesn't warn with observableRequiresReaction/computedRequiresReaction", () => {
    consoleWarnMock = jest.spyOn(console, "warn").mockImplementation(() => {})
    const { observableRequiresReaction, computedRequiresReaction } = _getGlobalState()
    try {
        enableStaticRendering(true)
        configure({ observableRequiresReaction: true, computedRequiresReaction: true })
        const o = observable.box(0, { name: "o" })
        const c = computed(() => o.get(), { name: "c" })

        @observer
        class TestCmp extends React.Component<any> {
            render() {
                expect(this).toBeDefined()
                return o.get() + c.get()
            }
        }

        const { unmount, container } = render(<TestCmp />)
        expect(container).toHaveTextContent("0")
        unmount()

        expect(consoleWarnMock).toMatchSnapshot()
    } finally {
        enableStaticRendering(false)
        _resetGlobalState()
        configure({ observableRequiresReaction, computedRequiresReaction })
        consoleWarnMock.mockRestore()
    }
})
;["props", "state", "context"].forEach(key => {
    test(`using ${key} in computed throws`, () => {
        // React prints errors even if we catch em
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

        const TestCmp = observer(
            class TestCmp extends React.Component {
                render() {
                    computed(() => this[key]).get()
                    return ""
                }
            }
        )

        expect(() => render(<TestCmp />)).toThrowError(
            new RegExp(`^\\[mobx-react\\] Cannot read "TestCmp.${key}" in a reactive context`)
        )

        consoleErrorSpy.mockRestore()
    })

    test(`using ${key} in autorun throws`, () => {
        // React prints errors even if we catch em
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

        let caughtError

        const TestCmp = observer(
            class TestCmp extends React.Component {
                disposeAutorun: IReactionDisposer | undefined

                componentDidMount(): void {
                    this.disposeAutorun = autorun(() => this[key], {
                        onError: error => (caughtError = error)
                    })
                }

                componentWillUnmount(): void {
                    this.disposeAutorun?.()
                }

                render() {
                    return ""
                }
            }
        )

        render(<TestCmp />)
        expect(caughtError?.message).toMatch(
            new RegExp(`^\\[mobx-react\\] Cannot read "TestCmp.${key}" in a reactive context`)
        )

        consoleErrorSpy.mockRestore()
    })
})

test(`Component react's to observable changes in componenDidMount #3691`, () => {
    const o = observable.box(0)

    const TestCmp = observer(
        class TestCmp extends React.Component {
            componentDidMount(): void {
                o.set(o.get() + 1)
            }

            render() {
                return o.get()
            }
        }
    )

    const { container, unmount } = render(<TestCmp />)
    expect(container).toHaveTextContent("1")
    unmount()
})

test(`Observable changes in componenWillUnmount don't cause any warnings or errors`, () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    const o = observable.box(0)

    const TestCmp = observer(
        class TestCmp extends React.Component {
            componentWillUnmount(): void {
                o.set(o.get() + 1)
            }

            render() {
                return o.get()
            }
        }
    )

    const { container, unmount } = render(<TestCmp />)
    expect(container).toHaveTextContent("0")
    unmount()

    expect(consoleErrorSpy).not.toBeCalled()
    expect(consoleWarnSpy).not.toBeCalled()

    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
})

test(`Observable prop workaround`, () => {
    configure({
        enforceActions: "observed"
    })

    const propValues: Array<any> = []

    const TestCmp = observer(
        class TestCmp extends React.Component<{ prop: number }> {
            disposeReaction: IReactionDisposer | undefined
            observableProp: number

            get computed() {
                return this.observableProp + 100
            }

            constructor(props) {
                super(props)
                // Synchronize our observableProp with the actual prop on the first render.
                this.observableProp = this.props.prop
                makeObservable(this, {
                    observableProp: observable,
                    computed: computed,
                    // Mutates observable therefore must be action
                    componentDidUpdate: action
                })
            }

            componentDidMount(): void {
                // Reactions/autoruns must be created in componenDidMount (not in constructor).
                this.disposeReaction = reaction(
                    () => this.observableProp,
                    prop => propValues.push(prop),
                    {
                        fireImmediately: true
                    }
                )
            }

            componentDidUpdate(): void {
                // Synchronize our observableProp with the actual prop on every update.
                this.observableProp = this.props.prop
            }

            componentWillUnmount(): void {
                this.disposeReaction?.()
            }

            render() {
                return this.computed
            }
        }
    )

    const { container, unmount, rerender } = render(<TestCmp prop={1} />)
    expect(container).toHaveTextContent("101")
    rerender(<TestCmp prop={2} />)
    expect(container).toHaveTextContent("102")
    rerender(<TestCmp prop={3} />)
    expect(container).toHaveTextContent("103")
    rerender(<TestCmp prop={4} />)
    expect(container).toHaveTextContent("104")
    expect(propValues).toEqual([1, 2, 3, 4])
    unmount()
})

test(`Observable props/state/context workaround`, () => {
    configure({
        enforceActions: "observed"
    })

    const reactionResults: Array<string> = []

    const ContextType = React.createContext(0)

    const TestCmp = observer(
        class TestCmp extends React.Component<any, any> {
            static contextType = ContextType

            disposeReaction: IReactionDisposer | undefined
            observableProps: any
            observableState: any
            observableContext: any

            constructor(props, context) {
                super(props, context)
                this.state = {
                    x: 0
                }
                this.observableState = this.state
                this.observableProps = this.props
                this.observableContext = this.context
                makeObservable(this, {
                    observableProps: observable,
                    observableState: observable,
                    observableContext: observable,
                    computed: computed,
                    componentDidUpdate: action
                })
            }

            get computed() {
                return `${this.observableProps?.x}${this.observableState?.x}${this.observableContext}`
            }

            componentDidMount(): void {
                this.disposeReaction = reaction(
                    () => this.computed,
                    prop => reactionResults.push(prop),
                    {
                        fireImmediately: true
                    }
                )
            }

            componentDidUpdate(): void {
                // Props are different object with every update
                if (!shallowEqual(this.observableProps, this.props)) {
                    this.observableProps = this.props
                }
                if (!shallowEqual(this.observableState, this.state)) {
                    this.observableState = this.state
                }
                if (!shallowEqual(this.observableContext, this.context)) {
                    this.observableContext = this.context
                }
            }

            componentWillUnmount(): void {
                this.disposeReaction?.()
            }

            render() {
                return (
                    <span
                        id="updateState"
                        onClick={() => this.setState(state => ({ x: state.x + 1 }))}
                    >
                        {this.computed}
                    </span>
                )
            }
        }
    )

    const App = () => {
        const [context, setContext] = React.useState(0)
        const [prop, setProp] = React.useState(0)
        return (
            <ContextType.Provider value={context}>
                <span id="updateContext" onClick={() => setContext(val => val + 1)}></span>
                <span id="updateProp" onClick={() => setProp(val => val + 1)}></span>
                <TestCmp x={prop}></TestCmp>
            </ContextType.Provider>
        )
    }

    const { container, unmount } = render(<App />)

    const updateProp = () =>
        act(() => (container.querySelector("#updateProp") as HTMLElement).click())
    const updateState = () =>
        act(() => (container.querySelector("#updateState") as HTMLElement).click())
    const updateContext = () =>
        act(() => (container.querySelector("#updateContext") as HTMLElement).click())

    expect(container).toHaveTextContent("000")
    updateProp()
    expect(container).toHaveTextContent("100")
    updateState()
    expect(container).toHaveTextContent("110")
    updateContext()
    expect(container).toHaveTextContent("111")

    expect(reactionResults).toEqual(["000", "100", "110", "111"])
    unmount()
})

test("Class observer can react to changes made before mount #3730", () => {
    const o = observable.box(0)

    @observer
    class Child extends React.Component {
        componentDidMount(): void {
            runInAction(() => o.set(1))
        }
        render() {
            return ""
        }
    }

    @observer
    class Parent extends React.Component {
        render() {
            return (
                <span>
                    {o.get()}
                    <Child />
                </span>
            )
        }
    }

    const { container, unmount } = render(<Parent />)
    expect(container).toHaveTextContent("1")
    unmount()
})
