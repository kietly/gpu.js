/**
 * @desc This handles all the raw state, converted state, etc. of a single function.
 * [INTERNAL] A collection of functionNodes.
 */
class FunctionBuilder {
	/**
	 *
	 * @param {Kernel} kernel
	 * @param {FunctionNode} FunctionNode
	 * @param {object} [extraNodeOptions]
	 * @returns FunctionBuilder
	 */
	static fromKernel(kernel, FunctionNode, extraNodeOptions) {
		const {
			argumentNames,
			argumentTypes,
			argumentSizes,
			constants,
			constantTypes,
			debug,
			loopMaxIterations,
			nativeFunctions,
			output,
		} = kernel;

		const onNestedFunction = (fnString) => {
			functionBuilder.addFunctionNode(new FunctionNode(fnString, nodeOptions));
		};

		const lookupReturnType = (functionName) => {
			return functionBuilder.lookupReturnType(functionName);
		};

		const nodeOptions = Object.assign({
			isRootKernel: false,
			onNestedFunction,
			lookupReturnType,
			constants,
			constantTypes,
			debug,
			loopMaxIterations,
			output,
		}, extraNodeOptions || {});

		const rootNode = new FunctionNode(kernel.fn, Object.assign({}, nodeOptions, {
			isRootKernel: true,
			name: 'kernel',
			argumentNames,
			argumentTypes,
			argumentSizes,
		}));

		let functionNodes = null;
		if (kernel.functions) {
			functionNodes = kernel.functions.map(fn => new FunctionNode(fn.source, Object.assign({}, nodeOptions, fn.settings)));
		}

		let subKernelNodes = null;
		if (kernel.subKernels) {
			subKernelNodes = kernel.subKernels.map((subKernel) => {
				const {
					name,
					source
				} = subKernel;
				return new FunctionNode(source, Object.assign({}, nodeOptions, {
					name,
					isSubKernel: true,
					isRootKernel: false
				}));
			});
		}

		const functionBuilder = new FunctionBuilder({
			rootNode,
			functionNodes,
			nativeFunctions,
			subKernelNodes
		});

		return functionBuilder;
	}

	/**
	 *
	 * @param {object} [settings]
	 */
	constructor(settings) {
		settings = settings || {};
		this.rootNode = settings.rootNode;
		this.functionNodes = settings.functionNodes || [];
		this.subKernelNodes = settings.subKernelNodes || [];
		this.nativeFunctions = settings.nativeFunctions || {};
		this.functionMap = {};

		if (this.rootNode) {
			this.functionMap['kernel'] = this.rootNode;
		}

		if (this.functionNodes) {
			for (let i = 0; i < this.functionNodes.length; i++) {
				this.functionMap[this.functionNodes[i].name] = this.functionNodes[i];
			}
		}

		if (this.subKernelNodes) {
			for (let i = 0; i < this.subKernelNodes.length; i++) {
				this.functionMap[this.subKernelNodes[i].name] = this.subKernelNodes[i];
			}
		}
	}

	/**
	 * @desc Add the function node directly
	 *
	 * @param {FunctionNode} functionNode - functionNode to add
	 *
	 */
	addFunctionNode(functionNode) {
		this.functionMap[functionNode.name] = functionNode;
		if (functionNode.isRootKernel) {
			this.rootNode = functionNode;
		}
	}

	/**
	 * @desc Trace all the depending functions being called, from a single function
	 *
	 * This allow for 'unneeded' functions to be automatically optimized out.
	 * Note that the 0-index, is the starting function trace.
	 *
	 * @param {String} functionName - Function name to trace from, default to 'kernel'
	 * @param {String[]} [retList] - Returning list of function names that is traced. Including itself.
	 * @param {Object} [parent] - Parent node
	 *
	 * @returns {String[]}  Returning list of function names that is traced. Including itself.
	 */
	traceFunctionCalls(functionName, retList, parent) {
		functionName = functionName || 'kernel';
		retList = retList || [];

		const functionNode = this.functionMap[functionName];
		if (functionNode) {
			// Check if function already exists
			const functionIndex = retList.indexOf(functionName);
			if (functionIndex === -1) {
				retList.push(functionName);
				if (parent) {
					functionNode.parent = parent;
				}
				functionNode.toString(); //ensure JS trace is done
				for (let i = 0; i < functionNode.calledFunctions.length; ++i) {
					this.traceFunctionCalls(functionNode.calledFunctions[i], retList, functionNode);
				}
			} else {
				/**
				 * https://github.com/gpujs/gpu.js/issues/207
				 * if dependent function is already in the list, because a function depends on it, and because it has
				 * already been traced, we know that we must move the dependent function to the end of the the retList.
				 * */
				const dependantFunctionName = retList.splice(functionIndex, 1)[0];
				retList.push(dependantFunctionName);
			}
		}

		if (this.nativeFunctions[functionName]) {
			if (retList.indexOf(functionName) >= 0) {
				// Does nothing if already traced
			} else {
				retList.push(functionName);
			}
		}

		return retList;
	}

	/**
	 * @desc Return the string for a function
	 * @param {String} functionName - Function name to trace from. If null, it returns the WHOLE builder stack
	 * @returns {String} The full string, of all the various functions. Trace optimized if functionName given
	 */
	getPrototypeString(functionName) {
		return this.getPrototypes(functionName).join('\n');
	}

	/**
	 * @desc Return the string for a function
	 * @param {String} [functionName] - Function name to trace from. If null, it returns the WHOLE builder stack
	 * @returns {Array} The full string, of all the various functions. Trace optimized if functionName given
	 */
	getPrototypes(functionName) {
		this.rootNode.toString();
		if (functionName) {
			return this.getPrototypesFromFunctionNames(this.traceFunctionCalls(functionName, []).reverse());
		}
		return this.getPrototypesFromFunctionNames(Object.keys(this.functionMap));
	}

	/**
	 * @desc Get string from function names
	 * @param {String[]} functionList - List of function to build string
	 * @returns {String} The string, of all the various functions. Trace optimized if functionName given
	 */
	getStringFromFunctionNames(functionList) {
		const ret = [];
		for (let i = 0; i < functionList.length; ++i) {
			const node = this.functionMap[functionList[i]];
			if (node) {
				ret.push(this.functionMap[functionList[i]].toString());
			}
		}
		return ret.join('\n');
	}

	/**
	 * @desc Return string of all functions converted
	 * @param {String[]} functionList - List of function names to build the string.
	 * @returns {Array} Prototypes of all functions converted
	 */
	getPrototypesFromFunctionNames(functionList) {
		const ret = [];
		for (let i = 0; i < functionList.length; ++i) {
			const functionName = functionList[i];
			const node = this.functionMap[functionName];
			if (node) {
				ret.push(node.toString());
			} else if (this.nativeFunctions[functionName]) {
				ret.push(this.nativeFunctions[functionName]);
			}
		}
		return ret;
	}

	/**
	 * @desc Get string for a particular function name
	 * @param {String} functionName - Function name to trace from. If null, it returns the WHOLE builder stack
	 * @returns {String} settings - The string, of all the various functions. Trace optimized if functionName given
	 */
	getString(functionName) {
		if (functionName) {
			return this.getStringFromFunctionNames(this.traceFunctionCalls(functionName).reverse());
		}
		return this.getStringFromFunctionNames(Object.keys(this.functionMap));
	}

	lookupReturnType(functionName) {
		const node = this.functionMap[functionName];
		if (node && node.returnType) {
			return node.returnType;
		}
		return null;
	}

	lookupArgumentType() {

	}
}

module.exports = FunctionBuilder;