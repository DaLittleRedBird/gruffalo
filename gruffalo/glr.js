
var i, j, highestGSSId = 0;
const CLREOF = "$";

//WARNING : The GSSNode, Path, Edge and ReduceSet objects been NOT tested yet, if you want to use Gruffalo, fork the main page.
function GSSNode(label) {
    this.label = label;
    this.edgesById = {};
    this.id = ++highestGSSId;
}

GSSNode.prototype.getName = function() { return 'state #' + this.id; }

GSSNode.prototype.addEdge = function(node) {
    let edge = this.edgesById[node.id];
    if (!edge) { return this.edgesById[node.id] = new Edge(node); }
    return edge;
}

// TODO: test nb. length can be out-of-bounds (return []) or zero (return [this])
GSSNode.prototype.traverse = function(length, firstEdge) {
    // assert(firstEdge.head.node === this);
    let paths = [firstEdge];
    for (; length--;) {
        let newPaths = [];
        for (i = paths.length; i--; ) {
            let path = paths[i], begin = path ? path.head.node : this;
            let edges = begin.edgesById, keys = Object.keys(edges);
            for (j = keys.length; j--; ) {
                let edge = edges[keys[j]];
                newPaths.push(new Path(edge, path));
            }
        }
        paths = newPaths;
    }
    return paths;
}

function Path(head, tail) { //A valid GLR stack.
    this.head = head; //Top of the stack
    this.tail = tail; //Rest of the stack
}

//Returns the stack corresponding to the current path.
Path.prototype.toArray = function() {
    let outStack = [], curEdge = this;
    do { outStack.push(curEdge.head.data); } while (curEdge = curEdge.tail);
    return outStack;
}

function Edge(node) {
    this.node = node;
    this.data = null;
    this.debug = function() { return this.data; }
}

/* The RNGLR paper uses Rekers for better memory efficiency.
 * Use Tomita's SPPF algorithm since it's simpler & faster.
 */
Edge.prototype.addDerivation = function(rule, path) {
    let children = path ? path.toArray() : [];

    // console.log('' + rule, children);
    let data = rule.build.apply(null, children);

    if (this.data !== null) { throw 'wow'; }
    this.data = data;
}

// TODO: how to implement this efficiently, Red-Black trees?
function ReduceSet() {
    this.reductions = [];
    this.unique = {};
}

ReduceSet.prototype.insert = function(start, item, firstEdge) {
    //Hash tables are good, maybe we can use 32-bit bitstrings?
    let hash = start.id + '$' + item.id;
    if (!this.unique[hash]) { this.reductions.push(this.unique[hash] = {start, item, firstEdge}); }
}

ReduceSet.prototype.pop = function() {
    let r = this.reductions.pop();
    if (!r) {return;}
    let hash = r.start.id + '$' + r.item.id;
    delete this.unique[hash];
    return r;
}

var REDUCTIONS = new ReduceSet(), NODES = {}, TOKEN, LOOKAHEAD, GOTO, DATA, LENGTH;

function push(advance, start) {
  let node = NODES[advance.index];

  if (!node) {
    // new node
    let node = NODES[advance.index] = new GSSNode(advance); // node: Node = w

    /* record all reductions (of length 0)
     * together with the second node along the path
     * which is `node`, since the `start` of a Reduction is the second node... ?!
     */
    for (let item of advance.reductions[LOOKAHEAD] || []) { // lookup l
      if (item.dot === 0) { REDUCTIONS.insert(node, item, null) } // (w, B, 0)
    }
  }

  let edge = node.addEdge(start);

  /* we're creating a new path
   * so we need to make sure we record valid reductions (of length >0)
   * to check those against the new path
   */
  if (LENGTH > 0) {
    for (let item of advance.reductions[LOOKAHEAD] || []) {
      if (item.dot !== 0) { REDUCTIONS.add(start, item, new Path(edge)); } // (v, B, t)
    }
  }

  return edge;
}

function goSwitch(start) {
    let advance = start.label.transitions[GOTO];
    if (advance) { return push(advance, start); }
}

function shift(nextColumn) {
  let OLD = NODES, keys = Object.keys(OLD);
  
  NODES = {};
  for (let index of keys) {
    let start = OLD[index]; // start: Node = v, advance: State = k
    let edge = goSwitch(start);
    if (edge) { edge.data = DATA; }
  }
  return nextColumn;
}

function reduce(item, start, firstEdge) {
  let length = item.dot, rule = item.rule, target = rule.target; // target = X
    
  // console.log('(', start.name, target, length, ')');
  let set = start.traverse(Math.max(0, length - 1), firstEdge), edge;
    
  for (let path of set) {
    let begin = path ? path.head.node : start

    // if (path) {assert(begin === path.head.node);}

    // begin.label: State = k

    LENGTH = length; GOTO = target;
    let edge = goSwitch(begin);
    // assert(edge);
    edge.addDerivation(rule, path, firstEdge);
  }
}

function reduceAll() {
  var reduction;
  while (reduction = REDUCTIONS.pop()) {
    let { start, item, firstEdge } = reduction; // length: Int = m
    reduce(item, start, firstEdge);
  }
}



function parse(startState, target, lex) {
  // TODO don't hardcode grammar start symbol
  let acceptingState = startState.transitions[target];

  // TODO handle empty input

  TOKEN = lex();
  NODES = {};
  let startNode = NODES[startState.index] = new Node(startState);
  for (let item of startState.reductions[TOKEN.type] || []) { REDUCTIONS.insert(startNode, item, null); } // TODO test this

  let count = 0;
  do {
    reduceAll();
    // console.log(column.debug());
    // console.log(column.reductions);

    GOTO = TOKEN.type;
    DATA = TOKEN;

    TOKEN = lex();
    LOOKAHEAD = TOKEN.type;
    LENGTH = 1;

    shift(NODES);

    // check column is non-empty
    if (Object.keys(NODES).length === 0) { throw new Error('Syntax error @ ' + count + ': ' + JSON.stringify(TOKEN.type)); }
    count++;
  } while (TOKEN.type !== CLREOF);

  reduceAll();
  // console.log(column.debug());

  let finalNode = NODES[acceptingState.index];
  if (!finalNode) { throw new Error('Unexpected end of input'); }

  let rootEdge = finalNode.edgesById[startNode.id];

  return rootEdge.data;
}

module.exports = { parse }

