const { spawnSync, execSync } = require('child_process');

console.log('=== Environment Diagnostics ===');
console.log('PATH:', process.env.PATH);
console.log('SHELL:', process.env.SHELL);
console.log('CWD:', process.cwd());
console.log('');

console.log('=== Test 1: which git ===');
try {
  const result = spawnSync('which', ['git'], {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    env: process.env,
  });
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('error:', result.error);
  console.log('status:', result.status);
} catch (error) {
  console.error('ERROR:', error);
}

console.log('\n=== Test 2: git with full path ===');
try {
  const result = spawnSync('/usr/bin/git', ['--version'], {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    env: process.env,
  });
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('error:', result.error);
  console.log('status:', result.status);
} catch (error) {
  console.error('ERROR:', error);
}

console.log('\n=== Test 3: Augmented PATH ===');
const augmentedEnv = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
};

try {
  const result = spawnSync('git', ['--version'], {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    env: augmentedEnv,
  });
  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('error:', result.error);
  console.log('status:', result.status);
} catch (error) {
  console.error('ERROR:', error);
}

console.log('\n=== Test 4: execSync with shell ===');
try {
  const output = execSync('which git', {
    encoding: 'utf-8',
    shell: '/bin/zsh',
  });
  console.log('output:', output);
} catch (error) {
  console.error('ERROR:', error.message);
}
