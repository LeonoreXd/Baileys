'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['src', 'WAProto'];
const files = [];

const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile() && fullPath.endsWith('.js')) files.push(fullPath);
    }
};

for (const root of roots) walk(root);

let failed = false;
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
