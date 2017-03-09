
const fs = require('fs')

// const parser = require('../foo.js')



// let input = fs.readFileSync('test/sample10k.json')
let input = '(( (1) ))'

// const { grammar, tokenizer } = require('../test/json')
const gilbert = require('../gilbert')

let grammar = new gilbert.Grammar({ start: 'E' })
grammar.add(new gilbert.Rule('E', ['(', '_', 'E', '_', ')'], function () { return [ arguments[2] ] }))
grammar.add(new gilbert.Rule('E', ['1'], () => 1))
grammar.add(new gilbert.Rule('_', []))
grammar.add(new gilbert.Rule('_', ['_', ' '])) // TODO we have a null-reduction bug here.

let p = eval(gilbert.compile(grammar))({})

// states.forEach(state => console.log(state.debug() + '\n'))

// tokenizer.initString(input)
// let lex = tokenizer.getNextToken.bind(tokenizer)

var index = 0
function lex() {
  return { type: input[index++] || '$' }
}

console.log(JSON.stringify(p(lex)))

