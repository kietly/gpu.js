const utils = require('../utils');
const acorn = require('acorn');

class FunctionNode {

	/**
	 *
	 * @desc Represents a single function, inside JS, webGL, or openGL.
	 *
	 * <p>This handles all the raw state, converted state, etc. Of a single function.</p>
	 */
	constructor(fn, settings) {
		if (!fn) {
			throw new Error('fn parameter is missing');
		}
		settings = settings || {};

		this.fn = fn;
		this.name = settings.isRootKernel ?
			'kernel' :
			(settings.name || utils.getFunctionNameFromString(fn));
		this.calledFunctions = [];
		this.calledFunctionsArguments = {};
		this.isRootKernel = false;
		this.isSubKernel = false;
		this.parent = null;
		this.debug = null;
		this.prototypeOnly = null;
		this.constants = null;
		this.output = null;
		this.declarations = {};
		this.states = [];

		let argumentTypes;
		let returnType;
		if (settings) {
			if (settings.hasOwnProperty('debug')) {
				this.debug = settings.debug;
			}
			if (settings.hasOwnProperty('prototypeOnly')) {
				this.prototypeOnly = settings.prototypeOnly;
			}
			if (settings.hasOwnProperty('constants')) {
				this.constants = settings.constants;
			}
			if (settings.hasOwnProperty('output')) {
				this.output = settings.output;
			}
			if (settings.hasOwnProperty('loopMaxIterations')) {
				this.loopMaxIterations = settings.loopMaxIterations;
			}
			if (settings.hasOwnProperty('argumentNames')) {
				this.argumentNames = settings.argumentNames || [];
			}
			if (settings.hasOwnProperty('argumentTypes')) {
				this.argumentTypes = argumentTypes = settings.argumentTypes;
			}
			if (settings.hasOwnProperty('argumentSizes')) {
				this.argumentSizes = settings.argumentSizes || [];
			}
			if (settings.hasOwnProperty('constantTypes')) {
				this.constantTypes = settings.constantTypes;
			} else {
				this.constantTypes = {};
			}
			if (settings.hasOwnProperty('returnType')) {
				returnType = settings.returnType;
			}
			if (settings.hasOwnProperty('isRootKernel')) {
				this.isRootKernel = settings.isRootKernel;
			}
			if (settings.hasOwnProperty('isSubKernel')) {
				this.isSubKernel = settings.isSubKernel;
			}
			if (settings.onNestedFunction) {
				this.onNestedFunction = settings.onNestedFunction;
			}
			if (settings.lookupReturnType) {
				this.lookupReturnType = settings.lookupReturnType;
			}
		}

		this.validateFn();

		if (!(this.name)) {
			throw new Error('name could not be set');
		}

		this.setupArgumentTypes(argumentTypes);

		if (!this.returnType) {
			this.returnType = returnType || 'Number';
		}
	}

	validateFn() {
		if (typeof this.fn !== 'string') {
			throw new Error('fn not a string');
		}
		if (!utils.isFunctionString(this.fn)) {
			throw new Error('fn not a function string');
		}
	}

	setupArgumentTypes(argumentTypes) {
		this.argumentNames = utils.getArgumentNamesFromString(this.fn);
		if (argumentTypes) {
			if (Array.isArray(argumentTypes)) {
				if (argumentTypes.length !== this.argumentNames.length) {
					throw new Error(
						'Invalid argument type array length, against function length -> (' +
						argumentTypes.length + ',' +
						this.argumentNames.length +
						')'
					);
				}
				this.argumentTypes = argumentTypes;
			} else if (typeof argumentTypes === 'object') {
				const argumentNamesFromTypes = Object.keys(argumentTypes);
				if (argumentTypes.hasOwnProperty('returns')) {
					this.returnType = argumentTypes.returns;
					argumentNamesFromTypes.splice(argumentNamesFromTypes.indexOf('returns'), 1);
				}
				if (argumentNamesFromTypes.length > 0 && argumentNamesFromTypes.length !== this.argumentNames.length) {
					throw new Error(
						'Invalid argument type array length, against function length -> (' +
						argumentNamesFromTypes.length + ',' +
						this.argumentNames.length +
						')'
					);
				} else {
					this.argumentTypes = this.argumentNames.map((key) => {
						if (argumentTypes.hasOwnProperty(key)) {
							return argumentTypes[key];
						} else {
							return 'Number';
						}
					});
				}
			}
		} else {
			this.argumentTypes = [];
		}
	}

	/**
	 * @param {String} name
	 * @returns {boolean}
	 */
	isIdentifierConstant(name) {
		if (!this.constants) return false;
		return this.constants.hasOwnProperty(name);
	}

	isInput(argumentName) {
		return this.argumentTypes[this.argumentNames.indexOf(argumentName)] === 'Input';
	}

	pushState(state) {
		this.states.push(state);
	}

	popState(state) {
		if (this.state !== state) {
			throw new Error(`Cannot popState ${ state } when in ${ this.state }`);
		}
		this.states.pop();
	}

	isState(state) {
		return this.state === state;
	}

	get state() {
		return this.states[this.states.length - 1];
	}

	/**
	 * @function
	 * @name astMemberExpressionUnroll
	 * @desc Parses the abstract syntax tree for binary expression.
	 *
	 * <p>Utility function for astCallExpression.</p>
	 *
	 * @param {Object} ast - the AST object to parse
	 *
	 * @returns {String} the function namespace call, unrolled
	 */
	astMemberExpressionUnroll(ast) {
		if (ast.type === 'Identifier') {
			return ast.name;
		} else if (ast.type === 'ThisExpression') {
			return 'this';
		}

		if (ast.type === 'MemberExpression') {
			if (ast.object && ast.property) {
				//babel sniffing
				if (ast.object.hasOwnProperty('name') && ast.object.name[0] === '_') {
					return this.astMemberExpressionUnroll(ast.property);
				}

				return (
					this.astMemberExpressionUnroll(ast.object) +
					'.' +
					this.astMemberExpressionUnroll(ast.property)
				);
			}
		}

		//babel sniffing
		if (ast.hasOwnProperty('expressions')) {
			const firstExpression = ast.expressions[0];
			if (firstExpression.type === 'Literal' && firstExpression.value === 0 && ast.expressions.length === 2) {
				return this.astMemberExpressionUnroll(ast.expressions[1]);
			}
		}

		// Failure, unknown expression
		throw this.astErrorOutput('Unknown astMemberExpressionUnroll', ast);
	}

	/**
	 * @desc Parses the class function JS, and returns its Abstract Syntax Tree object.
	 * This is used internally to convert to shader code
	 *
	 * @param {Object} [inParser] - Parser to use, assumes in scope 'parser' if null or undefined
	 *
	 * @returns {Object} The function AST Object, note that result is cached under this.ast;
	 */
	getJsAST(inParser) {
		if (this.ast) {
			return this.ast;
		}

		inParser = inParser || acorn;
		if (inParser === null) {
			throw 'Missing JS to AST parser';
		}

		const ast = Object.freeze(inParser.parse('var ' + this.name + ' = ' + this.fn + ';', {
			locations: true
		}));
		if (ast === null) {
			throw new Error('Failed to parse JS code');
		}

		// take out the function object, outside the var declarations
		const funcAST = ast.body[0].declarations[0].init;
		this.ast = funcAST;

		return funcAST;
	}

	/**
	 * @desc Return the type of parameter sent to subKernel/Kernel.
	 * @param {String} argumentName - Name of the parameter
	 * @returns {String} Type of the parameter
	 */
	getArgumentType(argumentName) {
		const argumentIndex = this.argumentNames.indexOf(argumentName);
		if (argumentIndex === -1) {
			if (this.declarations.hasOwnProperty(argumentName)) {
				return this.declarations[argumentName];
			} else {
				return 'Number';
			}
		} else {
			if (!this.parent) {
				if (this.argumentTypes[argumentIndex]) return this.argumentTypes[argumentIndex];
			} else {
				if (this.argumentTypes[argumentIndex]) return this.argumentTypes[argumentIndex];
				const calledFunctionArguments = this.parent.calledFunctionsArguments[this.name];
				for (let i = 0; i < calledFunctionArguments.length; i++) {
					const calledFunctionArgument = calledFunctionArguments[i];
					if (calledFunctionArgument[argumentIndex] !== null) {
						return this.argumentTypes[argumentIndex] = calledFunctionArgument[argumentIndex].type;
					}
				}
			}
		}
		return 'Number';
	}

	getConstantType(constantName) {
		if (this.constantTypes[constantName]) {
			return this.constantTypes[constantName];
		}
		return null;
	}

	/**
	 * @desc Return the name of the *user argument*(subKernel argument) corresponding
	 * to the argument supplied to the kernel
	 *
	 * @param {String} name - Name of the argument
	 * @returns {String} Name of the parameter
	 */
	getUserArgumentName(name) {
		const argumentIndex = this.argumentNames.indexOf(name);
		if (argumentIndex === -1) return null;
		if (!this.parent || !this.isSubKernel) return null;
		const calledFunctionArguments = this.parent.calledFunctionsArguments[this.name];
		for (let i = 0; i < calledFunctionArguments.length; i++) {
			const calledFunctionArgument = calledFunctionArguments[i];
			const argument = calledFunctionArgument[argumentIndex];
			if (argument !== null && argument.type !== 'Integer') {
				return argument.name;
			}
		}
		return null;
	}

	toString(settings) {
		throw new Error(`"toString" not defined on ${ this.constructor.name }`);
	}

	/**
	 * @desc Parses the abstract syntax tree for generically to its respective function
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the parsed string array
	 */
	astGeneric(ast, retArr) {
		if (ast === null) {
			throw this.astErrorOutput('NULL ast', ast);
		} else {
			if (Array.isArray(ast)) {
				for (let i = 0; i < ast.length; i++) {
					this.astGeneric(ast[i], retArr);
				}
				return retArr;
			}

			switch (ast.type) {
				case 'FunctionDeclaration':
					return this.astFunctionDeclaration(ast, retArr);
				case 'FunctionExpression':
					return this.astFunctionExpression(ast, retArr);
				case 'ReturnStatement':
					return this.astReturnStatement(ast, retArr);
				case 'Literal':
					return this.astLiteral(ast, retArr);
				case 'BinaryExpression':
					return this.astBinaryExpression(ast, retArr);
				case 'Identifier':
					return this.astIdentifierExpression(ast, retArr);
				case 'AssignmentExpression':
					return this.astAssignmentExpression(ast, retArr);
				case 'ExpressionStatement':
					return this.astExpressionStatement(ast, retArr);
				case 'EmptyStatement':
					return this.astEmptyStatement(ast, retArr);
				case 'BlockStatement':
					return this.astBlockStatement(ast, retArr);
				case 'IfStatement':
					return this.astIfStatement(ast, retArr);
				case 'BreakStatement':
					return this.astBreakStatement(ast, retArr);
				case 'ContinueStatement':
					return this.astContinueStatement(ast, retArr);
				case 'ForStatement':
					return this.astForStatement(ast, retArr);
				case 'WhileStatement':
					return this.astWhileStatement(ast, retArr);
				case 'DoWhileStatement':
					return this.astDoWhileStatement(ast, retArr);
				case 'VariableDeclaration':
					return this.astVariableDeclaration(ast, retArr);
				case 'VariableDeclarator':
					return this.astVariableDeclarator(ast, retArr);
				case 'ThisExpression':
					return this.astThisExpression(ast, retArr);
				case 'SequenceExpression':
					return this.astSequenceExpression(ast, retArr);
				case 'UnaryExpression':
					return this.astUnaryExpression(ast, retArr);
				case 'UpdateExpression':
					return this.astUpdateExpression(ast, retArr);
				case 'LogicalExpression':
					return this.astLogicalExpression(ast, retArr);
				case 'MemberExpression':
					return this.astMemberExpression(ast, retArr);
				case 'CallExpression':
					return this.astCallExpression(ast, retArr);
				case 'ArrayExpression':
					return this.astArrayExpression(ast, retArr);
				case 'DebuggerStatement':
					return this.astDebuggerStatement(ast, retArr);
			}

			throw this.astErrorOutput('Unknown ast type : ' + ast.type, ast);
		}
	}
	/**
	 * @desc To throw the AST error, with its location.
	 *
	 * @todo add location support for the AST error
	 *
	 * @param {string} error - the error message output
	 * @param {Object} ast - the AST object where the error is
	 */
	astErrorOutput(error, ast) {
		return new Error(error + ':\n' + utils.getAstString(this.fn, ast));
	}

	astDebuggerStatement(arrNode, retArr) {
		return retArr;
	}
	/**
	 * @desc Parses the abstract syntax tree for to its *named function declaration*
	 * @param {Object} ast - the AST object to parse
	 * @param {Array} retArr - return array string
	 * @returns {Array} the append retArr
	 */
	astFunctionDeclaration(ast, retArr) {
		if (this.onNestedFunction) {
			this.onNestedFunction(utils.getAstString(this.fn, ast));
		}
		return retArr;
	}
	astFunctionExpression(ast, retArr) {
		return retArr;
	}
	astReturnStatement(ast, retArr) {
		return retArr;
	}
	astLiteral(ast, retArr) {
		return retArr;
	}
	astBinaryExpression(ast, retArr) {
		return retArr;
	}
	astIdentifierExpression(ast, retArr) {
		return retArr;
	}
	astAssignmentExpression(ast, retArr) {
		return retArr;
	}
	astExpressionStatement(ast, retArr) {
		return retArr;
	}
	astEmptyStatement(ast, retArr) {
		return retArr;
	}
	astBlockStatement(ast, retArr) {
		return retArr;
	}
	astIfStatement(ast, retArr) {
		return retArr;
	}
	astBreakStatement(ast, retArr) {
		return retArr;
	}
	astContinueStatement(ast, retArr) {
		return retArr;
	}
	astForStatement(ast, retArr) {
		return retArr;
	}
	astWhileStatement(ast, retArr) {
		return retArr;
	}
	astDoWhileStatement(ast, retArr) {
		return retArr;
	}
	astVariableDeclaration(ast, retArr) {
		return retArr;
	}
	astVariableDeclarator(ast, retArr) {
		return retArr;
	}
	astThisExpression(ast, retArr) {
		return retArr;
	}
	astSequenceExpression(ast, retArr) {
		return retArr;
	}
	astUnaryExpression(ast, retArr) {
		return retArr;
	}
	astUpdateExpression(ast, retArr) {
		return retArr;
	}
	astLogicalExpression(ast, retArr) {
		return retArr;
	}
	astMemberExpression(ast, retArr) {
		return retArr;
	}
	astCallExpression(ast, retArr) {
		return retArr;
	}
	astArrayExpression(ast, retArr) {
		return retArr;
	}

	/**
	 * @function
	 * @name pushParameter
	 *
	 * @desc [INTERNAL] pushes a fn parameter onto retArr and 'casts' to int if necessary
	 *  i.e. deal with force-int-parameter state
	 *
	 * @param {Array} retArr - return array string
	 * @param {String} name - the parameter name
	 *
	 */
	pushParameter(retArr, name) {
		retArr.push(`user_${name}`);
	}
}

module.exports = FunctionNode;