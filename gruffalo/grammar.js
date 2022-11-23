var highestGrammarID = 0, highestCLRStateID = 0;
const CLREOF = "$";

//WARNING : The ContextFreeGrammar, GrammarRule and CLR functions have NOT been tested, if you want to use Gruffalo, fork the original code.
function GrammarRule(target, symbols, build) {
    if (!symbols || symbols.constructor !== Array) { throw 'symbols must be a list'; }
    if (typeof build !== 'function') {
      // TODO opt
      build = eval('(function (...args) { return [' + JSON.stringify(target) + ', args] })');
    }
    this.symbols = symbols;
    if (symbols.length > 0 && symbols[0] === undefined) { throw new Error() }
    this.target = target;
    this.build = build;
    this._items = {};
    this.id = ++highestGrammarID;
}

GrammarRule.prototype.startItem = function(lookahead) {
    if (this._items[lookahead]) { return this._items[lookahead]; }
    let symbols = this.symbols;
    if (!symbols.length) { return this._items[lookahead] = new CLR(this, 0, lookahead); }
    let previous, dot = 1, first = previous = new CLR(this, 0, lookahead);
    for (; dot < symbols.length; dot++) {
      let lr0 = new CLR(this, dot, lookahead);
      previous.advance = lr0;
      previous = lr0;
    }
    previous.advance = new CLR(this, dot, lookahead);
    return this._items[lookahead] = first;
}

GrammarRule.prototype.toString = function() { return this.target.toString() + ' → ' + this.symbols.join(' '); }

//This one is bizzare...
GrammarRule.prototype.reverse = function() {
    let clone = new GrammarRule(this.target, this.symbols.reverse(), null);
    clone.priority = this.priority;
    clone._original = this;
    return clone;
}

//Slow, but very reliable.
function CLR(rule, dot, lookahead) {
    this.id = ++highestCLRStateID;
    this._wlh = null;
    this.rule = rule;
    this.wants = rule.symbols[dot];
    this.dot = dot;
    this.advance = null; // set by rule
    this.lookahead = lookahead;
    this.getHash = function() { return this.rule.id + '$' + this.dot; }
    this.isAccepting = function() { return this.rule.isAccepting && this.wants === undefined && this.lookahead == CLREOF; }
    
    if (typeof lookahead !== 'string') { throw new Error(JSON.stringify(lookahead)) }
}

//TODO : test this rigourously
CLR.prototype.isRightNullable = function(grammar) {
    //This is the function that makes this GLR parser possible in the first place.
    let symbols = this.rule.symbols;
    for (let i = this.dot; i < symbols.length; i++) { if (!grammar.firstTerminalFor(symbols[i])['$null']) { return false; } }
    return true;
}

CLR.prototype.toString = function() {
    let symbols = this.rule.symbols.slice();
    symbols.splice(this.dot, 0, '•');
    let lookahead = this.lookahead === CLREOF ? '$' : this.lookahead;
    return this.rule.target.toString() + ' → ' + symbols.map(x => x.toString()).join(' ') + ' :: ' + lookahead;
}

CLR.prototype.wantsLookahead = function(grammar) {
    if (this._wlh) { return this._wlh; }
    let after = this.rule.symbols.slice(this.dot + 1), out = {};
    for (let terminal in this.lookahead) {
        let terminals = grammar.firstTerminal(after.concat(terminal))
        for (let key in terminals) { out[key] = true; }
    }
    this._wlh = out;
    return this._wlh;
}

function ContextFreeGrammar(options) {
    this.rules = [];
    this.ruleSets = {}; // rules by target
    this.start = options.start;
    this.highestPriority = 0;
    this._listFirst = {};
    this._symbolFirst = {};
    this.isTerminal = function(symbol) { return !this.ruleSets[symbol]; }
}

ContextFreeGrammar.prototype.addProductionRule = function(rule) {
    this.rules.push(rule);
    if (!(rule instanceof GrammarRule)) {throw 'not a rule';}
    rule.priority = ++this.highestPriority;
    let set = this.ruleSets[rule.target];
    if (!set) { this.ruleSets[rule.target] = set = []; }
    set.push(rule);
}

ContextFreeGrammar.prototype.getProductionRule = function(target) { return this.ruleSets[target]; }

ContextFreeGrammar.prototype.debug = function() {
    let rules = [];
    Object.keys(this.ruleSets).forEach(target => { let ruleSet = this.ruleSets[target]; ruleSet.forEach(rule => { rules.push(rule.toString()); }); });
    return rules.join('\n');
}

//TODO : test this rigourously
ContextFreeGrammar.prototype.firstTerminalFor = function(symbol, seenRules) {
    if (this._symbolFirst[symbol]) { return this._symbolFirst[symbol]; }

    let rules = this.ruleSets[symbol];
    if (!rules) { return { [symbol]: true }; } // terminal

    seenRules = seenRules || {};

    let result = {};
    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (seenRules[rule.id]) { continue; }
        seenRules[rule.id] = true;

        let symbols = rule.symbols, terminals = this.firstTerminal(symbols, seenRules);
        for (let key in terminals) { result[key] = true; }

        delete seenRules[rule.id];
    }

    return this._symbolFirst[symbol] = result;
}

//TODO : test this rigourously
ContextFreeGrammar.prototype.firstTerminal = function(symbols, seenRules) {
    if (symbols.length === 0) { return { '$null': true }; }
    let hash = symbols.join(', ');
    if (this._listFirst[hash]) { return this._listFirst[hash]; }
    let result = {};
    for (let i = 0; i < symbols.length; i++) {
        let terminals = this.firstTerminalFor(symbols[i], seenRules);
        for (let key in terminals) { if (key !== '$null' || i == symbols.length - 1) { result[key] = true; } }
        if (!terminals['$null']) { break; }
    }
    return this._listFirst[hash] = result;
}

/*var cfg = new ContextFreeGrammar({start : "S"});
cfg.addProductionRule(new GrammarRule("S", ["S", "S"], (function(A) {return ["S", A, A];})));
cfg.addProductionRule(new GrammarRule("S", ["m", "n"], (function() {return ["S", "m", "n"];})));
console.log(cfg.getProductionRule("S").toString());*/

module.exports = { GrammarRule, CLR, ContextFreeGrammar, };

