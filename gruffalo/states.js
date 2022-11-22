
const { GrammarRule, CLR, ContextFreeGrammar } = require('./grammar');

var i;
const CLREOF = "$";

//TODO : probably speed this up, somehow...
function dotStr(x) {
    x = x.toString();
    if (/^[0-9]+$/.test(x)) { return x; }
    if (/^[a-zA-Zε]+$/.test(x)) { return x; }
    x = x.replace(/"/g, '\\"');
    x = x.replace(/\n/g, '\\l') + '\\l';
    return '"' + x + '"';
}

//WARNING : The State function has NOT been tested, if you want to use Gruffalo, fork the original code.
function State(grammar) {
    this.grammar = grammar;
    this.items = [];
    this.wants = {};
    this.index = null;

    this.transitions = {};
    this.reductions = {};
    // TODO separate nullReductions
    this.accept = null;
    this.incoming = [];
}

State.prototype.addItem = function(item) {
    if (!(item instanceof CLR)) { throw new Error('not an LR1'); }
    this.items.push(item);
    if (item.isAccepting) {
      this.accept = item;
    } else {
      // TODO: are accept/reduce conflicts possible?

      if (item.isRightNullable(this.grammar)) {
        // LR1 is complete, or right nullable after dot
        let set = this.reductions[item.lookahead] = this.reductions[item.lookahead] || [];
        set.push(item);
      }
      if (item.wants !== undefined) {
        var set = this.wants[item.wants];
        if (!set) { set = this.wants[item.wants] = []; }
        set.push(item);
      }
    }
}

State.prototype.process = function() {
    let grammar = this.grammar, items = this.items, predicted = {};
    for (i = 0; i < items.length; i++) { // nb. expands during iteration
        let item = items[i];
        if (item.wants === undefined) { continue; }

        let after = item.rule.symbols.slice(item.dot + 1);
        let lookahead = grammar.firstTerminal(after.concat([item.lookahead]));

        // TODO: do reductions with $null lookahead always apply?
        var spawned = predicted[item.wants];
        if (!spawned) { spawned = predicted[item.wants] = {}; }

        for (var key in lookahead) {
            if (key === '$null') { continue; }
            if (!spawned[key]) {
                let newItems = spawned[key] = [];
                for (let rule of (grammar.get(item.wants) || [])) {
                    let pred = rule.startItem(key);
                    this.addItem(pred);
                    newItems.push(pred);
                }
            }
        }
    }
}

State.prototype.successor = function(symbol, statesByHash) {
    let next = new State(this.grammar), ids = [];
    next.incoming = [this];
    for (let item of this.wants[symbol]) {
        let lr0 = item.advance;
        next.addItem(lr0);
        ids.push(lr0.id);
    }
    // TODO merge states with same items, but different lookahead ?
    let hash = ids.join(':');
    if (statesByHash[hash]) {
        statesByHash[hash].incoming.push(this);
        return this.transitions[symbol] = statesByHash[hash];
    }
    if (this.transitions[symbol]) { throw 'oops'; }
    next.process();
    return this.transitions[symbol] = statesByHash[hash] = next;
}

State.prototype.debug = function(symbol, statesByHash) {
    // return this.items.map(x => x.toString()).join('\n');
    var r = '';
    r += 's' + this.index + '\n';
    for (let lookahead in this.reductions) {
        for (let item of this.reductions[lookahead]) { r += '  [' + lookahead + '] -> reduce <' + item.rule + '> ' + item.dot + '\n'; }
    }
    for (let match in this.transitions) { r += '  [' + match + '] -> push s' + this.transitions[match].index + '\n'; }

    for (let item of this.items) {
        r += item.toString() + '\n';
        if (item.rule.isAccepting) { r += '  [$] -> accept\n'; }
    }
    return r;
}

State.prototype.toDot = function(symbol, statesByHash) {
    let r = '', label = 's' + this.index + '\\n' + this.items.map(item => item.toString()).join('\n');
    r += this.index + ' [shape=box align=left label=' + dotStr(label) + ']\n';
    for (let match in this.transitions) {
        let other = this.transitions[match];
        r += this.index + ' -> ' + other.index + ' [label=' + dotStr('«' + match + '»') + ']\n';
    }
    return r;
}

function generateStates(g) {
    if (g.start === undefined) { throw new Error('grammar needs a start non-terminal'); }

    // TODO: $acc ignores this processor
    let accept = new GrammarRule('$acc', [g.start], x => x);
    accept.isAccepting = true;

    let start = new State(g), startItem = accept.startItem(CLREOF);
    start.addItem(startItem);
    let statesByHash = { ['' + startItem.id]: start }
    start.index = 0;
    start.process();

    let states = [start];
    for (var i = 0; i < states.length; i++) { // nb. expands during iteration
        // console.log(i);
        let state = states[i];
        // state.log();
        for (let symbol in state.wants) {
            let next = state.successor(symbol, statesByHash);
            if (!next.index) { next.index = states.length; states.push(next); }
            // console.log(' * ', symbol, '->', next.index);
        }
        // console.log();
    }
    return states;
}

module.exports = { State, generateStates, }

