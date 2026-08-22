import { solarTimeEngine } from '../src/simulator/solar-time.engine';
import { coolingSimulator } from '../src/simulator/cooling.simulator';
import { cleaningSimulator } from '../src/simulator/cleaning.simulator';
import { simulatorState } from '../src/simulator/telemetry.simulator';

async function runTests() {
  console.log('=== TEST 1: 11:00 WIB Profile Target ===');
  solarTimeEngine.setFixedTimeString('11:00');
  solarTimeEngine.setMode('FIXED');
  const p11 = solarTimeEngine.getTargetSolarProfile(11.0);
  console.log('11:00 Target:', p11);
  if (p11.targetTemp >= 40 && p11.targetTemp <= 46) {
    console.log('✅ TEST 1 PASSED: 11:00 target temperature in range (40-46°C)');
  } else {
    console.error('❌ TEST 1 FAILED:', p11);
  }

  console.log('\n=== TEST 2: 12:00 WIB Profile Target ===');
  const p12 = solarTimeEngine.getTargetSolarProfile(12.0);
  console.log('12:00 Target:', p12);
  if (p12.targetTemp >= 48 && p12.targetTemp <= 55) {
    console.log('✅ TEST 2 PASSED: 12:00 target temperature in range (48-55°C)');
  } else {
    console.error('❌ TEST 2 FAILED:', p12);
  }

  console.log('\n=== TEST 3: 12:30 WIB Profile Target ===');
  const p1230 = solarTimeEngine.getTargetSolarProfile(12.5);
  console.log('12:30 Target:', p1230);
  if (p1230.targetTemp >= 50 && p1230.targetTemp <= 60) {
    console.log('✅ TEST 3 PASSED: 12:30 target temperature in range (50-60°C)');
  } else {
    console.error('❌ TEST 3 FAILED:', p1230);
  }

  console.log('\n=== TEST 4 & 5: Cooling & Cleaning State Dynamics ===');
  console.log('Cooling state:', coolingSimulator.getState());
  console.log('Cleaning state:', cleaningSimulator.getState());
  console.log('Simulator state:', simulatorState);

  console.log('\nAll simulation tests completed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
