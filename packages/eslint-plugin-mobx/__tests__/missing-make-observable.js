import { getRuleTester } from "./utils/get-rule-tester";

import rule from "../src/missing-make-observable.js";

const tester = getRuleTester();

const fields = [
  'observable o = 5',
  'observable.ref or = []',
  'observable.shallow os = []',
  'observable.deep od = {}',
  'computed get c() {}',
  'computed.struct get cs() {}',
  'computed({ equals }) get co() {}',
  'action a() {}',
  'action.bound ab() {}',
  'flow *f() {}',
  'flow.bound *fb() {}',
];

const valid1 = fields.map(field => `
class C {     
  @${field}

  constructor() {
    makeObservable(this) 
  }      
}
`).map(code => ({ code }))

const valid2 = {
  code: `
class C {       
  o = 5;
  get c() {};
  a() {};
  *f() {};

  constructor() {
    makeObservable(this, {}) 
  }      
}
`
}

const valid3 = fields.map(field => `
class C {     
  @${field}

  constructor() {
    makeObservable(this, null, { name: 'foo' }) 
  }      
}
`).map(code => ({ code }))

const valid4 = fields.map(field => `
class C {     
  @${field}

  constructor(aString: string);
  constructor(aNum: number);
  constructor(stringOrNum: string | number) {
    makeObservable(this, null, { name: 'foo' }) 
  }      
}
`).map(code => ({ code }))

const invalid1 = fields.map(field => ({
  code: `
class C {
  @${field}
}
`,
  errors: [
    { messageId: 'missingMakeObservable' },
  ],
  output: `
class C {
constructor() { makeObservable(this); }
  @${field}
}
`
}))

const invalid2 = fields.map(field => ({
  code: `
class C {
  @${field}
  constructor() {}
}
`,
  errors: [
    { messageId: 'missingMakeObservable' },
  ],
  output: `
class C {
  @${field}
  constructor() {;makeObservable(this);}
}
`,
}))

const invalid3 = fields.map(field => ({
  code: `
class C {
  @${field}
  constructor() {
    makeObservable({ a: 5 });
  }
}
`,
  errors: [
    { messageId: 'missingMakeObservable' },
  ],
  output: `
class C {
  @${field}
  constructor() {
    makeObservable({ a: 5 });
  ;makeObservable(this);}
}
`,
}))

const invalid4 = fields.map(field => ({
  code: `
class C {
  @${field}
  constructor()
}
`,
  errors: [
    { messageId: 'missingMakeObservable' },
  ],
  output: `
class C {
  @${field}
  constructor() { makeObservable(this); }
}
`,
}))


const invalid5 = fields.map(field => ({
  code: `
class C {
  @${field}
  constructor() {
    makeObservable(this, { o: observable.ref });
  }
}
`,
  errors: [
    { messageId: 'secondArgMustBeNullish' },
  ],
}))

const invalid6 = fields.map(field => ({
    code: `
import * as mobx from 'mobx';

class C {
  @mobx.${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
import * as mobx from 'mobx';

class C {
constructor() { mobx.makeObservable(this); }
  @mobx.${field}
}
`,
  }
))

const invalid7 = fields.map(field => ({
    code: `
import { foo } from 'mobx';

class C {
  @${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
import { foo, makeObservable } from 'mobx';

class C {
constructor() { makeObservable(this); }
  @${field}
}
`,
  }
))

const invalid8 = fields.map(field => ({
    code: `
import { foo } from 'mobx';
import * as mobx from 'mobx';

class C {
  @mobx.${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
import { foo } from 'mobx';
import * as mobx from 'mobx';

class C {
constructor() { mobx.makeObservable(this); }
  @mobx.${field}
}
`,
  }
))

const invalid9 = fields.map(field => ({
    code: `
import { makeObservable as makeBanana } from 'mobx';

class C {
  @${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
import { makeObservable as makeBanana } from 'mobx';

class C {
constructor() { makeBanana(this); }
  @${field}
}
`,
  }
))

const invalid10 = fields.map(field => ({
    code: `
class C extends Component {
  @${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
class C extends Component {
constructor(props) { super(props); makeObservable(this); }
  @${field}
}
`,
  }
))

const invalid11 = fields.map(field => ({
    code: `
class C extends React.Component<{ foo: string }> {
  @${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservable' },
    ],
    output: `
class C extends React.Component<{ foo: string }> {
constructor(props: { foo: string }) { super(props); makeObservable(this); }
  @${field}
}
`,
  }
))

const invalid12 = fields.map(field => ({
    code: `
class C extends Banana {
  @${field}
}
`,
    errors: [
      { messageId: 'missingMakeObservableSuper' },
    ],
  }
))

tester.run("missing-make-observable", rule, {
  valid: [
    ...valid1,
    valid2,
    ...valid3,
    ...valid4,
  ],
  invalid: [
    ...invalid1,
    ...invalid2,
    ...invalid3,
    ...invalid4,
    ...invalid5,
    ...invalid6,
    ...invalid7,
    ...invalid8,
    ...invalid9,
    ...invalid10,
    ...invalid11,
    ...invalid12,
  ],
});