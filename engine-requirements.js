const major = parseInt(process.versions.node.split(".")[0], 10);
if (major < 20) {
    console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 Unsupported Node.js Version

• Current  : v${process.versions.node}
• Required : v20.0.0+

This package uses features available only in
Node.js 20 or newer.

Please update Node.js and try again.
━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(1);
}
