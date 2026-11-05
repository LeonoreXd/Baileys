'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.USyncBusinessProtocol = void 0;
const WABinary_1 = require('../../WABinary');
class USyncBusinessProtocol {
    constructor(profileVersion = '2') {
        this.name = 'business';
        this.profileVersion = profileVersion;
    }
    getQueryElement() {
        return {
            tag: 'business',
            attrs: {},
            content: [
                { tag: 'verified_name', attrs: {} },
                { tag: 'profile', attrs: { v: this.profileVersion } }
            ]
        };
    }
    getUserElement(user) {
        const children = [];
        if (user.verifiedNameSerial) {
            children.push({ tag: 'verified_name', attrs: { serial: user.verifiedNameSerial } });
        }
        if (user.businessProfileTag) {
            children.push({ tag: 'profile', attrs: { tag: user.businessProfileTag } });
        }
        return children.length > 0 ? { tag: 'business', attrs: {}, content: children } : null;
    }
    parser(node) {
        if (node.tag !== 'business')
            return null;
        (0, WABinary_1.assertNodeErrorFree)(node);
        const verifiedNameNode = (0, WABinary_1.getBinaryNodeChild)(node, 'verified_name');
        const profileNode = (0, WABinary_1.getBinaryNodeChild)(node, 'profile');
        return {
            verifiedName: verifiedNameNode?.content ?? null,
            verifiedLevel: verifiedNameNode?.attrs?.verified_level ?? null,
            profileTag: profileNode?.attrs?.tag ?? null,
            pnJid: node.attrs?.pn_jid ?? null
        };
    }
}
exports.USyncBusinessProtocol = USyncBusinessProtocol;
