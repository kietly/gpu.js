(function() {
	const GPU = require('../../src/index');

	function testDivideByThree(mode) {
		const gpu = new GPU({mode});
		const k = gpu.createKernel(function (v1, v2) {
			return v1 / v2;
		})
			.setOutput([1])
			.setFloatOutput(true);
		QUnit.assert.equal(k(6, 3)[0], 2);
		gpu.destroy();
	}

	QUnit.test('Issue #349 - divide by three (auto)', () => {
		testDivideByThree();
	});

	QUnit.test('Issue #349 - divide by three (gpu)', () => {
		testDivideByThree('gpu');
	});

	(GPU.isWebGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - divide by three (webgl)', () => {
		testDivideByThree('webgl');
	});

	(GPU.isWebGL2Supported ? QUnit.test : QUnit.skip)('Issue #349 - divide by three (webgl2)', () => {
		testDivideByThree('webgl2');
	});

	(GPU.isHeadlessGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - divide by three (headlessgl)', () => {
		testDivideByThree('headlessgl');
	});

	QUnit.test('Issue #349 - divide by three (cpu)', () => {
		testDivideByThree('cpu');
	});
})();

(() => {
	const GPU = require('../../src/index');
	const DATA_MAX = 1024 * 1024;
	const dividendData = new Float32Array(DATA_MAX);
	const divisorData = new Float32Array(DATA_MAX);
	const expectedResults = new Float32Array(DATA_MAX);
	const maxWholeNumberRepresentation = Math.sqrt(16777217);
	for (let i = 0; i < DATA_MAX; i++) {
		divisorData[i] = parseInt(Math.random() * maxWholeNumberRepresentation + 1, 10);
		expectedResults[i] = parseInt(Math.random() * maxWholeNumberRepresentation + 1, 10);
		dividendData[i] = divisorData[i] * expectedResults[i];
	}

	function someRandomWholeNumberDivisions(mode) {
		const gpu = new GPU({mode});
		const k = gpu.createKernel(function (v1, v2) {
			return v1[this.thread.x] / v2[this.thread.x];
		})
			.setOutput([DATA_MAX])
			.setFloatOutput(true);
		const result = k(dividendData, divisorData);
		let same = true;
		let i = 0;
		for (; i < DATA_MAX; i++) {
			if (result[i] !== expectedResults[i]) {
				same = false;
				break;
			}
		}
		QUnit.assert.ok(same, same ? "" : "not all elements are the same, failed on index:" + i + " " + dividendData[i] + "/" + divisorData[i]);
		gpu.destroy();
	}

	QUnit.test('Issue #349 - some random whole number divisions (auto)', () => {
		someRandomWholeNumberDivisions();
	});
	QUnit.test('Issue #349 - some random whole number divisions (gpu)', () => {
		someRandomWholeNumberDivisions('gpu');
	});
	(GPU.isWebGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - some random whole number divisions (webgl)', () => {
		someRandomWholeNumberDivisions('webgl');
	});
	(GPU.isWebGL2Supported ? QUnit.test : QUnit.skip)('Issue #349 - some random whole number divisions (webgl2)', () => {
		someRandomWholeNumberDivisions('webgl2');
	});
	(GPU.isHeadlessGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - some random whole number divisions (headlessgl)', () => {
		someRandomWholeNumberDivisions('headlessgl');
	});
	QUnit.test('Issue #349 - some random whole number divisions (cpu)', () => {
		someRandomWholeNumberDivisions('cpu');
	});
})();

(() => {
	const GPU = require('../../src/index');
	function testDisableFixIntegerDivisionBug(mode) {
		const gpu = new GPU({mode});
		const idFix = gpu.createKernel(function(v1, v2) {
			return v1 / v2;
		})
			.setOutput([1])
			.setFloatOutput(true);

		const idDixOff = gpu.createKernel(function(v1, v2) {
			return v1 / v2;
		})
			.setOutput([1])
			.setFloatOutput(true)
			.setFixIntegerDivisionAccuracy(false);

		if (!gpu.Kernel.features.isIntegerDivisionAccurate) {
			QUnit.assert.ok(
				(
					idFix(6, 3)[0] === 2
					&& idFix(6030401, 3991)[0] === 1511
				) && (
					idDixOff(6, 3)[0] !== 2
					|| idDixOff(6030401, 3991)[0] !== 1511
				), "when bug is present should show bug!");
		} else {
			QUnit.assert.ok(idFix(6, 3)[0] === 2 && idDixOff(6, 3)[0] === 2, "when bug isn't present should not show bug!");
		}
		gpu.destroy();
	}
	QUnit.test('Issue #349 - test disable fix integer division bug (auto)', () => {
		testDisableFixIntegerDivisionBug();
	});

	QUnit.test('Issue #349 - test disable fix integer division bug (gpu)', () => {
		testDisableFixIntegerDivisionBug('gpu');
	});

	(GPU.isWebGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - test disable fix integer division bug (webgl)', () => {
		testDisableFixIntegerDivisionBug('webgl');
	});

	(GPU.isWebGL2Supported ? QUnit.test : QUnit.skip)('Issue #349 - test disable fix integer division bug (webgl2)', () => {
		testDisableFixIntegerDivisionBug('webgl2');
	});

	(GPU.isHeadlessGLSupported ? QUnit.test : QUnit.skip)('Issue #349 - test disable fix integer division bug (headlessgl)', () => {
		testDisableFixIntegerDivisionBug('headlessgl');
	});

	QUnit.test('Issue #349 - test disable fix integer division bug (cpu)', () => {
		testDisableFixIntegerDivisionBug('cpu');
	});
})();
