---
title: Creating observable state
sidebar_label: Observable state
hide_title: true
---

<script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=CEBD4KQ7&placement=mobxjsorg" id="_carbonads_js"></script>

# Creating observable state

Properties, entire objects, arrays, Maps and Sets can all be made observable.
The basics of making objects observable is specifying an annotation per property using `makeObservable`.
The most important annotations are:

-   [`observable`](#observable) defines a trackable field that stores the state.
-   [`action`](actions.md) marks a method as an action that will modify the state.
-   [`computed`](computeds.md) marks a getter that will derive new facts from the state and cache its output.

## `makeObservable`

Usage:

-   `makeObservable(target, annotations?, options?)`

This function can be used to make _existing_ object properties observable. Any JavaScript object (including class instances) can be passed into `target`.
Typically `makeObservable` is used in the constructor of a class, and its first argument is `this`.
The `annotations` argument maps [annotations](#available-annotations) to each member. Only annotated members are affected.

Alternatively, decorators like `@observable` can be used on class members instead of calling `makeObservable` in the constructor.

Methods that derive information and take arguments (for example `findUsersOlderThan(age: number): User[]`) can not be annotated as `computed` – their read operations will still be tracked when they are called from a reaction, but their output won't be memoized to avoid memory leaks. To memoize such methods you can use [MobX-utils computedFn {🚀}](https://github.com/mobxjs/mobx-utils#computedfn) instead.

[Subclassing is supported with some limitations](subclassing.md) by using the `override` annotation (see the example [here](subclassing.md)).

<!--DOCUSAURUS_CODE_TABS-->
<!--class + makeObservable-->

```javascript
import { makeObservable, observable, computed, action, flow } from "mobx"

class Doubler {
    value

    constructor(value) {
        makeObservable(this, {
            value: observable,
            double: computed,
            increment: action,
            fetch: flow
        })
        this.value = value
    }

    get double() {
        return this.value * 2
    }

    increment() {
        this.value++
    }

    *fetch() {
        const response = yield fetch("/api/value")
        this.value = response.json()
    }
}
```

**All annotated** fields are **non-configurable**.<br>
**All non-observable** (stateless) fields (`action`, `flow`) are **non-writable**.


<!--class + decorators-->

When using modern decorators, there is no need to call `makeObservable`, below is what a decorator based class looks like.
Note that the `@observable` annotation should always be used in combination with the `accessor` keyword.

```javascript
import { observable, computed, action, flow } from "mobx"

class Doubler {
    @observable accessor value

    constructor(value) {
        this.value = value
    }

    @computed
    get double() {
        return this.value * 2
    }

    @action
    increment() {
        this.value++
    }

    @flow
    *fetch() {
        const response = yield fetch("/api/value")
        this.value = response.json()
    }
}
```

<!--factory function + makeAutoObservable-->

```javascript
import { makeAutoObservable } from "mobx"

function createDoubler(value) {
    return makeAutoObservable({
        value,
        get double() {
            return this.value * 2
        },
        increment() {
            this.value++
        }
    })
}
```

Note that classes can leverage `makeAutoObservable` as well.
The difference in the examples just demonstrate how MobX can be applied to different programming styles.

<!--observable-->

```javascript
import { observable } from "mobx"

const todosById = observable({
    "TODO-123": {
        title: "find a decent task management system",
        done: false
    }
})

todosById["TODO-456"] = {
    title: "close all tickets older than two weeks",
    done: true
}

const tags = observable(["high prio", "medium prio", "low prio"])
tags.push("prio: for fun")
```

In contrast to the first example with `makeObservable`, `observable` supports adding (and removing) _fields_ to an object.
This makes `observable` great for collections like dynamically keyed objects, arrays, Maps and Sets.


<!--class + decorators (legacy)-->

To use legacy decorators, `makeObservable(this)` should be called in the constructor to make sure decorators work.

```javascript
import { observable, computed, action, flow } from "mobx"

class Doubler {
    @observable value

    constructor(value) {
        makeObservable(this)
        this.value = value
    }

    @computed
    get double() {
        return this.value * 2
    }

    @action
    increment() {
        this.value++
    }

    @flow
    *fetch() {
        const response = yield fetch("/api/value")
        this.value = response.json()
    }
}
```

<!--END_DOCUSAURUS_CODE_TABS-->

## `makeAutoObservable`

Usage:

-   `makeAutoObservable(target, overrides?, options?)`

`makeAutoObservable` is like `makeObservable` on steroids, as it infers all the properties by default. You can however use the `overrides` parameter to override the default behavior with specific annotations —
in particular `false` can be used to exclude a property or method from being processed entirely.
Check out the code above for an example.

The `makeAutoObservable` function can be more compact and easier to maintain than using `makeObservable`, since new members don't have to be mentioned explicitly.
However, `makeAutoObservable` cannot be used on classes that have super or are [subclassed](subclassing.md).

Inference rules:

-   All _own_ properties become `observable`.
-   All `getters` become `computed`.
-   All `setters` become `action`.
-   All _functions_ become [`autoAction`](#autoAction).
-   All _generator_ functions become `flow`. (Note that generator functions are not detectable in some transpiler configurations, if flow doesn't work as expected, make sure to specify `flow` explicitly.)
-   Members marked with `false` in the `overrides` argument will not be annotated. For example, using it for read only fields such as identifiers.

## `observable`

Usage:

-   `observable(source, overrides?, options?)`
-   `@observable accessor` _(field decorator)_

The `observable` annotation can also be called as a function to make an entire object observable at once.
The `source` object will be cloned and all members will be made observable, similar to how it would be done by `makeAutoObservable`.
Likewise, an `overrides` map can be provided to specify the annotations of specific members.
Check out the above code block for an example.

The object returned by `observable` will be a Proxy, which means that properties that are added later to the object will be picked up and made observable as well (except when [proxy usage](configuration.md#proxy-support) is disabled).

The `observable` method can also be called with collections types like [arrays](api.md#observablearray), [Maps](api.md#observablemap) and [Sets](api.md#observableset). Those will be cloned as well and converted into their observable counterparts.

<details id="observable-array"><summary>**Example:** observable array<a href="#observable-array" class="tip-anchor"></a></summary>

The following example creates an observable and observes it using [`autorun`](reactions.md#autorun).
Working with Map and Set collections works similarly.

```javascript
import { observable, autorun } from "mobx"

const todos = observable([
    { title: "Spoil tea", completed: true },
    { title: "Make coffee", completed: false }
])

autorun(() => {
    console.log(
        "Remaining:",
        todos
            .filter(todo => !todo.completed)
            .map(todo => todo.title)
            .join(", ")
    )
})
// Prints: 'Remaining: Make coffee'

todos[0].completed = false
// Prints: 'Remaining: Spoil tea, Make coffee'

todos[2] = { title: "Take a nap", completed: false }
// Prints: 'Remaining: Spoil tea, Make coffee, Take a nap'

todos.shift()
// Prints: 'Remaining: Make coffee, Take a nap'
```

Observable arrays have some additional nifty utility functions:

-   `clear()` removes all current entries from the array.
-   `replace(newItems)` replaces all existing entries in the array with new ones.
-   `remove(value)` removes a single item by value from the array. Returns `true` if the item was found and removed.

</details>

<details id="non-convertibles"><summary>**Note:** primitives and class instances are never converted to observables<a href="#non-convertibles" class="tip-anchor"></a></summary>

Primitive values cannot be made observable by MobX since they are immutable in JavaScript (but they can be [boxed](api.md#observablebox)).
Although there is typically no use for this mechanism outside libraries.

Class instances will never be made observable automatically by passing them to `observable` or assigning them to an `observable` property.
Making class members observable is considered the responsibility of the class constructor.

</details>

<details id="avoid-proxies"><summary>{🚀} **Tip:** observable (proxied) versus makeObservable (unproxied)<a href="#avoid-proxies" class="tip-anchor"></a></summary>

The primary difference between `make(Auto)Observable` and `observable` is that the first one modifies the object you are passing in as first argument, while `observable` creates a _clone_ that is made observable.

The second difference is that `observable` creates a [`Proxy`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) object, to be able to trap future property additions in case you use the object as a dynamic lookup map.
If the object you want to make observable has a regular structure where all members are known up-front, we recommend to use `makeObservable` as non proxied objects are a little faster, and they are easier to inspect in the debugger and `console.log`.

Because of that, `make(Auto)Observable` is the recommended API to use in factory functions.
Note that it is possible to pass `{ proxy: false }` as an option to `observable` to get a non proxied clone.

</details>

## Available annotations

| Annotation                                 | Description                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observable`<br/>`observable.deep`         | Defines a trackable field that stores state. If possible, any value assigned to `observable` is automatically converted to (deep) `observable`, [`autoAction`](#autoAction) or `flow` based on it's type. Only `plain object`, `array`, `Map`, `Set`, `function`, `generator function` are convertible. Class instances and others are untouched. |
| `observable.ref`                           | Like `observable`, but only reassignments will be tracked. The assigned values are completely ignored and will NOT be automatically converted to `observable`/[`autoAction`](#autoAction)/`flow`. For example, use this if you intend to store immutable data in an observable field.                                                             |
| `observable.shallow`                       | Like `observable.ref` but for collections. Any collection assigned will be made observable, but the contents of the collection itself won't become observable.                                                                                                                                                                                    |
| `observable.struct`                        | Like `observable`, except that any assigned value that is structurally equal to the current value will be ignored.                                                                                                                                                                                                                                |
| `action`                                   | Mark a method as an action that will modify the state. Check out [actions](actions.md) for more details. Non-writable.                                                                                                                                                                                                                            |
| `action.bound`                             | Like action, but will also bind the action to the instance so that `this` will always be set. Non-writable.                                                                                                                                                                                                                                       |
| `computed`                                 | Can be used on a [getter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get) to declare it as a derived value that can be cached. Check out [computeds](computeds.md) for more details.                                                                                                                             |
| `computed.shallow`                         | Like `computed`, but for collections. After recomputing, if the contents of the collection are equal to the previous result, no observers will be notified.                                                                                                                                                                                       |
| `computed.struct`                          | Like `computed`, except that if after recomputing the result is structurally equal to the previous result, no observers will be notified.                                                                                                                                                                                                         |
| `true`                                     | Infer the best annotation. Check out [makeAutoObservable](#makeautoobservable) for more details.                                                                                                                                                                                                                                                  |
| `false`                                    | Explicitly do not annotate this property.                                                                                                                                                                                                                                                                                                         |
| `flow`                                     | Creates a `flow` to manage asynchronous processes. Check out [flow](actions.md#using-flow-instead-of-async--await-) for more details. Note that the inferred return type in TypeScript might be off. Non-writable.                                                                                                                                |
| `flow.bound`                               | Like flow, but will also bind the flow to the instance so that `this` will always be set. Non-writable.                                                                                                                                                                                                                                           |
| `override`                                 | [Applicable to inherited `action`, `flow`, `computed`, `action.bound` overridden by subclass](subclassing.md).                                                                                                                                                                                                                                    |
| <span id="autoAction"></span> `autoAction` | Should not be used explicitly, but is used under the hood by `makeAutoObservable` to mark methods that can act as action or derivation, based on their calling context. It will be determined at runtime if the function is a derivation or action.                                                                                               |

## Limitations

1. `make(Auto)Observable` only supports properties that are already defined. Make sure your [**compiler configuration** is correct](installation.md#use-spec-compliant-transpilation-for-class-properties), or as work-around, that a value is assigned to all properties before using `make(Auto)Observable`. Without correct configuration, fields that are declared but not initialized (like in `class X { y; }`) will not be picked up correctly.
1. `makeObservable` can only annotate properties declared by its own class definition. If a sub- or superclass introduces observable fields, it will have to call `makeObservable` for those properties itself.
1. `options` argument can be provided only once. Passed `options` are _"sticky"_ and can NOT be changed later (eg. in [subclass](subclassing.md)).
1. **Every field can be annotated only once** (except for `override`). The field annotation or configuration can't change in [subclass](subclassing.md).
1. **All annotated** fields of non-plain objects (**classes**) are **non-configurable**.<br>
   [Can be disabled with `configure({ safeDescriptors: false })` {🚀☣️} ](configuration.md#safedescriptors-boolean).
1. **All non-observable** (stateless) fields (`action`, `flow`) are **non-writable**.<br>
   [Can be disabled with `configure({ safeDescriptors: false })` {🚀☣️} ](configuration.md#safedescriptors-boolean).
1. [Only **`action`, `computed`, `flow`, `action.bound`** defined **on prototype** can be **overridden** by subclass](subclassing.md).
1. By default _TypeScript_ will not allow you to annotate **private** fields. This can be overcome by explicitly passing the relevant private fields as generic argument, like this: `makeObservable<MyStore, "privateField" | "privateField2">(this, { privateField: observable, privateField2: observable })`
1. **Calling `make(Auto)Observable`** and providing annotations must be done **unconditionally**, as this makes it possible to cache the inference results.
1. **Modifying prototypes** after **`make(Auto)Observable`** has been called is **not supported**.
1. _EcmaScript_ **private** fields (**`#field`**) are **not supported** by `make(Auto)Observable`. Use auto-accessor + Stage-3 decorators (`@observable accessor #field`) syntax instead. Otherwise, when using _TypeScript_, it is recommended to use the `private` modifier.
1. **Mixing annotations and decorators** within single inheritance chain is **not supported** - eg. you can't use decorators for superclass and annotations for subclass.
1. `makeObservable`,`extendObservable` cannot be used on other builtin observable types (`ObservableMap`, `ObservableSet`, `ObservableArray`, etc)
1. `makeObservable(Object.create(prototype))` copies properties from `prototype` to created object and makes them `observable`. This behavior is wrong, unexpected and therefore **deprecated** and will likely change in future versions. Don't rely on it.

## Options {🚀}

The above APIs take an optional `options` argument which is an object that supports the following options:

-   **`autoBind: true`** uses `action.bound`/`flow.bound` by default, rather than `action`/`flow`. Does not affect explicitely annotated members.
-   **`deep: false`** uses `observable.ref` by default, rather than `observable`. Does not affect explicitely annotated members.
-   **`name: <string>`** gives the object a debug name that is printed in error messages and reflection APIs.
-   **`proxy: false`** forces `observable(thing)` to use non-[**proxy**](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) implementation. This is a good option if the shape of the object will not change over time, as non-proxied objects are easier to debug and faster. This option is **not** available for `make(Auto)Observable`, see [avoiding proxies](#avoid-proxies).

<details id="one-options-per-target"><summary>**Note:** options are *sticky* and can be provided only once<a href="#one-options-per-target" class="tip-anchor"></a></summary>
`options` argument can be provided only for `target` that is NOT observable yet.<br>
It is NOT possible to change options once the observable object was initialized.<br>
Options are stored on target and respected by subsequent `makeObservable`/`extendObservable` calls.<br>
You can't pass different options in [subclass](subclassing.md).
</details>

## Converting observables back to vanilla JavaScript collections

Sometimes it is necessary to convert observable data structures back to their vanilla counterparts.
For example when passing observable objects to a React component that can't track observables, or to obtain a clone that should not be further mutated.

To convert a collection shallowly, the usual JavaScript mechanisms work:

```javascript
const plainObject = { ...observableObject }
const plainArray = observableArray.slice()
const plainMap = new Map(observableMap)
```

To convert a data tree recursively to plain objects, the [`toJS`](api.md#tojs) utility can be used.
For classes, it is recommended to implement a `toJSON()` method, as it will be picked up by `JSON.stringify`.

## A short note on classes

So far most examples above have been leaning towards the class syntax.
MobX is in principle unopinionated about this, and there are probably just as many MobX users that use plain objects.
However, a slight benefit of classes is that they have more easily discoverable APIs, e.g. TypeScript.
Also, `instanceof` checks are really powerful for type inference, and class instances aren't wrapped in `Proxy` objects, giving them a better experience in debuggers.
Finally, classes benefit from a lot of engine optimizations, since their shape is predictable, and methods are shared on the prototype.
But heavy inheritance patterns can easily become foot-guns, so if you use classes, keep them simple.
So, even though there is a slight preference to use classes, we definitely want to encourage you to deviate from this style if that suits you better.
