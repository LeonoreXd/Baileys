'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.USyncQuery = void 0;
const WABinary_1 = require('../WABinary');
const USyncBotProfileProtocol_1 = require('./Protocols/USyncBotProfileProtocol');
const USyncLIDProtocol_1 = require('./Protocols/USyncLIDProtocol');
const USyncBusinessProtocol_1 = require('./Protocols/USyncBusinessProtocol');
const USyncPictureProtocol_1 = require('./Protocols/USyncPictureProtocol');
const USyncTextStatusProtocol_1 = require('./Protocols/USyncTextStatusProtocol');
const USyncSidelistProtocol_1 = require('./Protocols/USyncSidelistProtocol');
const USyncFeatureProtocol_1 = require('./Protocols/USyncFeatureProtocol');
const Protocols_1 = require('./Protocols');
class USyncQuery {
    constructor() {
        this.protocols = [];
        this.users = [];
        this.context = 'interactive';
        this.mode = 'query';
    }
    withMode(mode) {
        this.mode = mode;
        return this;
    }
    withContext(context) {
        this.context = context;
        return this;
    }
    withUser(user) {
        this.users.push(user);
        return this;
    }
    parseUSyncQueryResult(result) {
        if (!result || result.attrs.type !== 'result') {
            return;
        }
        const protocolMap = Object.fromEntries(this.protocols.map(protocol => {
            return [protocol.name, protocol.parser];
        }));
        const queryResult = {
            list: [],
            sideList: []
        };
        const usyncNode = (0, WABinary_1.getBinaryNodeChild)(result, 'usync');
        const parseUserNodes = nodes => {
            return nodes.reduce((acc, node) => {
                const id = node?.attrs.jid;
                if (id) {
                    const data = Array.isArray(node?.content)
                        ? Object.fromEntries(node.content
                            .map(content => {
                            const protocol = content.tag;
                            const parser = protocolMap[protocol];
                            if (parser) {
                                return [protocol, parser(content)];
                            }
                            else {
                                return [protocol, null];
                            }
                        })
                            .filter(([, b]) => b !== null))
                        : {};
                    acc.push({ ...data, id });
                }
                return acc;
            }, []);
        };
        const listNode = usyncNode ? (0, WABinary_1.getBinaryNodeChild)(usyncNode, 'list') : undefined;
        if (listNode?.content && Array.isArray(listNode.content)) {
            queryResult.list = parseUserNodes(listNode.content);
        }
        const sideListNode = usyncNode ? (0, WABinary_1.getBinaryNodeChild)(usyncNode, 'side_list') : undefined;
        if (sideListNode?.content && Array.isArray(sideListNode.content)) {
            queryResult.sideList = parseUserNodes(sideListNode.content);
        }
        return queryResult;
    }
    withDeviceProtocol() {
        this.protocols.push(new Protocols_1.USyncDeviceProtocol());
        return this;
    }
    withContactProtocol() {
        this.protocols.push(new Protocols_1.USyncContactProtocol());
        return this;
    }
    withStatusProtocol() {
        this.protocols.push(new Protocols_1.USyncStatusProtocol());
        return this;
    }
    withDisappearingModeProtocol() {
        this.protocols.push(new Protocols_1.USyncDisappearingModeProtocol());
        return this;
    }
    withBotProfileProtocol() {
        this.protocols.push(new USyncBotProfileProtocol_1.USyncBotProfileProtocol());
        return this;
    }
    withLIDProtocol() {
        this.protocols.push(new USyncLIDProtocol_1.USyncLIDProtocol());
        return this;
    }
    withUsernameProtocol() {
        this.protocols.push(new Protocols_1.USyncUsernameProtocol());
        return this;
    }
    withBusinessProtocol(profileVersion) {
        this.protocols.push(new USyncBusinessProtocol_1.USyncBusinessProtocol(profileVersion));
        return this;
    }
    withPictureProtocol(type) {
        this.protocols.push(new USyncPictureProtocol_1.USyncPictureProtocol(type));
        return this;
    }
    withTextStatusProtocol() {
        this.protocols.push(new USyncTextStatusProtocol_1.USyncTextStatusProtocol());
        return this;
    }
    withSidelistProtocol(useLidAddressing) {
        this.protocols.push(new USyncSidelistProtocol_1.USyncSidelistProtocol(useLidAddressing));
        return this;
    }
    withFeatureProtocol(features) {
        this.protocols.push(new USyncFeatureProtocol_1.USyncFeatureProtocol(features));
        return this;
    }
}
exports.USyncQuery = USyncQuery;
